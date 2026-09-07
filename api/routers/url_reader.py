# pylint: disable=duplicate-code
from fastapi import APIRouter
from pydantic import BaseModel, HttpUrl
import requests
import tempfile
import os
import time
import logging
from typing import Dict, Optional
from urllib.parse import urlsplit, urlunsplit, urljoin
from core.common.config_manager import config_manager
from core.database.duckdb_engine import with_duckdb_connection
from core.data.import_mode import normalize_import_mode, resolve_import_mode
from core.services.file_ingestion_service import ingest_tabular_file
from core.common.exceptions import BaseAPIException, ValidationError as APIValidationError
from utils.response_helpers import (
    create_success_response,
    MessageCode,
    error_json_response,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# DuckDB 原生 read_* 能直接通过 httpfs 读取的文件类型
NATIVE_REMOTE_TYPES = {"csv", "json", "jsonl", "parquet", "pq"}


class _PinnedAddressAdapter(requests.adapters.HTTPAdapter):
    """Keep direct connections on validated DNS addresses, including TLS SNI."""

    def get_connection_with_tls_context(self, request, verify, proxies=None, cert=None):
        address = _assert_public_url(request.url)
        # An explicitly configured proxy is a trusted network boundary: it resolves
        # destination DNS itself. Local validation and redirect checks still apply.
        if requests.utils.select_proxy(request.url, proxies or {}):
            return super().get_connection_with_tls_context(request, verify, proxies, cert)
        host, tls = self.build_connection_pool_key_attributes(request, verify, cert)
        original_host = host["host"]
        host["host"] = address
        if host["scheme"] == "https":
            tls["server_hostname"] = original_host
            tls["assert_hostname"] = original_host
        return self.poolmanager.connection_from_host(**host, pool_kwargs=tls)


def _send_checked_request(method: str, url: str, timeout: float):
    """Create a streaming response with validated direct DNS and trusted proxy support."""
    session = requests.Session()
    session.mount("http://", _PinnedAddressAdapter())
    session.mount("https://", _PinnedAddressAdapter())
    parsed = urlsplit(url)
    try:
        response = session.request(
            method.upper(), url, timeout=timeout, allow_redirects=False, stream=True,
            proxies=_requests_proxies(), headers={"Host": parsed.netloc},
        )
    except BaseException:
        session.close()
        raise
    original_close = response.close

    def close():
        original_close()
        session.close()

    response.close = close
    return response


def _requests_proxies() -> Optional[Dict[str, str]]:
    """从环境变量构建 requests 代理（HTTP_PROXY / HTTPS_PROXY）。"""
    http_proxy = os.getenv("HTTP_PROXY") or os.getenv("http_proxy")
    https_proxy = os.getenv("HTTPS_PROXY") or os.getenv("https_proxy")
    proxies: Dict[str, str] = {}
    if http_proxy:
        proxies["http"] = http_proxy
    if https_proxy:
        proxies["https"] = https_proxy
    return proxies or None


class URLReadRequest(BaseModel):
    url: HttpUrl
    table_alias: str
    file_type: Optional[str] = None  # 可选：csv, json, parquet, excel
    encoding: Optional[str] = "utf-8"
    delimiter: Optional[str] = ","
    header: Optional[bool] = True
    import_mode: Optional[str] = "auto"
    prefer_native: bool = True


def _assert_public_url(url: str) -> str:
    """拒绝指向内部地址的 URL（loopback / link-local 云元数据 / 多播 / 保留段）。

    自托管工具默认仍允许常规局域网私网段（10/172.16/192.168），仅拦截
    永远不应作为数据源、且是 SSRF 主要目标的地址（如 169.254.169.254）。
    """
    import ipaddress
    import socket
    from urllib.parse import urlparse

    parsed = urlparse(url)
    host = parsed.hostname
    if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
        raise APIValidationError(
            "Invalid URL host",
            details={"url": url, "code": "SSRF_BLOCKED"},
        )
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError as exc:
        raise APIValidationError(
            f"Cannot resolve host: {host}",
            details={"url": url, "code": "SSRF_BLOCKED"},
        ) from exc

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        ip = getattr(ip, "ipv4_mapped", None) or ip
        if (
            ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise APIValidationError(
                f"Access to internal address is not allowed: {ip}",
                details={"url": url, "code": "SSRF_BLOCKED"},
            )
    if not infos:
        raise APIValidationError("URL host resolved to no addresses")
    return infos[0][4][0]


def _checked_request(method: str, url: str, timeout: float):
    """Validate every redirect before sending a bounded HTTP request."""
    for _ in range(6):
        _assert_public_url(url)
        response = _send_checked_request(method, url, timeout)
        if response.status_code in {301, 302, 303, 307, 308}:
            location = response.headers.get("Location")
            response.close()
            if not location:
                raise APIValidationError("Redirect is missing Location")
            url = urljoin(url, location)
            continue
        try:
            response.raise_for_status()
        except BaseException:
            response.close()
            raise
        return response
    raise APIValidationError("Too many URL redirects")


def normalize_remote_url(url: str) -> str:
    """对常见远程地址做规范化（当前仅处理 GitHub blob→raw）"""
    url_str = str(url)

    # 检查是否是GitHub blob URL
    parsed = urlsplit(url_str)
    if parsed.hostname == "github.com" and "/blob/" in parsed.path:
        # 将 github.com/user/repo/blob/branch/path 转换为 raw.githubusercontent.com/user/repo/branch/path
        url_str = urlunsplit(parsed._replace(
            netloc="raw.githubusercontent.com", path=parsed.path.replace("/blob/", "/", 1)
        ))

    return url_str


@router.post("/api/read_from_url")
def read_from_url(request: URLReadRequest):
    """从URL读取文件并创建DuckDB表"""
    temp_file_path = None
    try:
        converted_url = normalize_remote_url(str(request.url))
        _assert_public_url(converted_url)
        app_config = config_manager.get_app_config()

        url_str = converted_url.lower()
        if request.file_type:
            file_type = request.file_type.lower()
        elif url_str.endswith(".csv"):
            file_type = "csv"
        elif url_str.endswith(".json"):
            file_type = "json"
        elif url_str.endswith((".parquet", ".pq")):
            file_type = "parquet"
        elif url_str.endswith((".xlsx", ".xls")):
            file_type = "excel"
        else:
            # 没有明确扩展名时，尝试通过 HEAD 请求检测 Content-Type
            try:
                with _checked_request("head", converted_url, app_config.url_reader_head_timeout) as head_response:
                    content_type = head_response.headers.get("content-type", "").lower()
                
                if "json" in content_type:
                    file_type = "json"
                elif "csv" in content_type or "text/plain" in content_type:
                    file_type = "csv"
                elif "parquet" in content_type:
                    file_type = "parquet"
                elif "excel" in content_type or "spreadsheet" in content_type:
                    file_type = "excel"
                else:
                    # 默认尝试 CSV
                    file_type = "csv"
                    logger.info(f"Unable to infer file type from Content-Type, using default CSV: {content_type}")
            except BaseAPIException:
                raise
            except Exception as head_err:
                logger.warning(f"HEAD request failed, using default CSV: {head_err}")
                file_type = "csv"
        import_mode = resolve_import_mode(
            request.import_mode or "auto", file_type=file_type
        )
        if file_type not in {"csv", "json", "jsonl", "parquet", "pq", "excel", "xlsx", "xls"}:
            raise APIValidationError("Unsupported remote file type")
        suffix = file_type
        if file_type == "excel":
            suffix = "xls" if urlsplit(converted_url).path.lower().endswith(".xls") else "xlsx"

        reader_options = None
        if file_type == "csv":
            reader_options = {
                "HEADER": bool(request.header),
                "DELIM": request.delimiter or ",",
                "SAMPLE_SIZE": -1,
            }
            if request.encoding:
                reader_options["ENCODING"] = request.encoding

        # HTTP input is staged before acquiring a database connection.
        try:
            response = _checked_request("get", converted_url, app_config.url_reader_timeout)
        except requests.RequestException as download_error:
            raise APIValidationError("Unable to download remote file") from download_error

        with response, tempfile.NamedTemporaryFile(delete=False, suffix=f".{suffix}") as temp_file:
            temp_file_path = temp_file.name
            downloaded = 0
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                downloaded += len(chunk)
                if downloaded > app_config.max_file_size:
                    raise BaseAPIException("Remote file exceeds upload limit", 413, "FILE_TOO_LARGE")
                temp_file.write(chunk)

        with with_duckdb_connection() as conn:
            ingest_result = ingest_tabular_file(
                conn, temp_file_path, file_type, request.table_alias,
                import_mode=import_mode,
                filename_for_meta=f"url_{request.table_alias}",
                persist_path=f"url://{converted_url}",
                reader_options=reader_options,
            )
            table_name = ingest_result.table_name
            metadata = {
                "row_count": ingest_result.row_count,
                "column_count": ingest_result.column_count,
                "columns": ingest_result.columns,
            }

        return create_success_response(
            data={
                "table_name": table_name,
                "row_count": metadata.get("row_count", 0),
                "column_count": metadata.get("column_count", 0),
                "columns": metadata.get("columns", []),
                "file_type": file_type,
                "url": converted_url,
                "original_url": str(request.url),
            },
            message_code=MessageCode.URL_READ_SUCCESS,
            message=f"Successfully read file from URL and created table: {table_name}",
        )

    except BaseAPIException:
        raise
    except ValueError as e:
        return error_json_response(
            400,
            MessageCode.URL_INVALID,
            str(e),
        )
    except Exception as e:
        return error_json_response(
            500,
            MessageCode.URL_READ_FAILED,
            f"Error occurred while processing file: {str(e)}",
            details={"url": str(request.url)},
        )
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.unlink(temp_file_path)


@router.get("/api/url_info")
def get_url_info(url: str):
    """获取URL文件信息（不下载完整文件）"""
    try:
        app_config = config_manager.get_app_config()
        with _checked_request("head", url, app_config.url_reader_head_timeout) as response:
            content_type = response.headers.get("content-type", "")
            content_length = response.headers.get("content-length")

        # 检测文件类型
        url_lower = url.lower()
        if url_lower.endswith(".csv") or "csv" in content_type:
            file_type = "csv"
        elif url_lower.endswith(".json") or "json" in content_type:
            file_type = "json"
        elif url_lower.endswith((".parquet", ".pq")):
            file_type = "parquet"
        elif url_lower.endswith((".xlsx", ".xls")) or "excel" in content_type:
            file_type = "excel"
        else:
            file_type = "unknown"

        return create_success_response(
            data={
                "file_type": file_type,
                "content_type": content_type,
                "content_length": int(content_length) if content_length else None,
                "url": url,
            },
            message_code=MessageCode.URL_INFO_RETRIEVED,
        )

    except BaseAPIException:
        raise
    except requests.RequestException as e:
        return error_json_response(
            400,
            MessageCode.URL_INVALID,
            f"Unable to access URL: {str(e)}",
            details={"url": url},
        )
    except Exception as e:
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Error occurred while getting URL info: {str(e)}",
            details={"url": url},
        )
