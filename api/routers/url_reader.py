# pylint: disable=duplicate-code
from fastapi import APIRouter
from pydantic import BaseModel, HttpUrl
import requests
import tempfile
import os
import time
import logging
from typing import Dict, Optional
from core.common.config_manager import config_manager
from core.database.duckdb_engine import with_duckdb_connection
from core.data.import_mode import normalize_import_mode, resolve_import_mode
from core.services.file_ingestion_service import (
    build_file_metadata,
    ingest_tabular_file,
    resolve_unique_table_name,
    save_file_metadata,
)
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


def normalize_remote_url(url: str) -> str:
    """对常见远程地址做规范化（当前仅处理 GitHub blob→raw）"""
    url_str = str(url)

    # 检查是否是GitHub blob URL
    if "github.com" in url_str and "/blob/" in url_str:
        # 将 github.com/user/repo/blob/branch/path 转换为 raw.githubusercontent.com/user/repo/branch/path
        url_str = url_str.replace("github.com", "raw.githubusercontent.com")
        url_str = url_str.replace("/blob/", "/")

    return url_str


@router.post("/api/read_from_url")
async def read_from_url(request: URLReadRequest):
    """从URL读取文件并创建DuckDB表"""
    temp_file_path = None
    try:
        converted_url = normalize_remote_url(str(request.url))
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
                head_response = requests.head(
                    converted_url,
                    timeout=app_config.url_reader_head_timeout,
                    allow_redirects=True,
                    proxies=_requests_proxies(),
                )
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
            except Exception as head_err:
                logger.warning(f"HEAD request failed, using default CSV: {head_err}")
                file_type = "csv"
        import_mode = resolve_import_mode(
            request.import_mode or "auto", file_type=file_type
        )

        reader_options = None
        if file_type == "csv":
            reader_options = {
                "HEADER": bool(request.header),
                "DELIM": request.delimiter or ",",
                "SAMPLE_SIZE": -1,
            }
            if request.encoding:
                reader_options["ENCODING"] = request.encoding

        metadata = None
        native_attempted = bool(request.prefer_native) and file_type in NATIVE_REMOTE_TYPES

        with with_duckdb_connection() as conn:
            table_name = resolve_unique_table_name(
                conn, request.table_alias, user_provided=True
            )
            if native_attempted:
                try:
                    from core.data.file_datasource_manager import (
                        create_table_from_dataframe,
                    )

                    metadata = create_table_from_dataframe(
                        conn,
                        table_name,
                        converted_url,
                        file_type,
                        reader_options=reader_options,
                        import_mode=import_mode,
                    )
                except Exception as exc:
                    logger.warning(
                        "DuckDB/httpfs read failed, preparing fallback: url=%s, err=%s",
                        converted_url,
                        exc,
                    )

            if metadata is None:
                if converted_url.lower().startswith("s3://"):
                    raise APIValidationError(
                        "S3 URL requires httpfs and duckdb_remote_settings; "
                        "HTTP download fallback is disabled for s3:// URLs",
                        details={"url": converted_url, "code": "REMOTE_READ_FAILED"},
                    )
                try:
                    response = requests.get(
                        converted_url,
                        timeout=app_config.url_reader_timeout,
                        proxies=_requests_proxies(),
                    )
                    response.raise_for_status()
                except requests.RequestException as download_error:
                    raise APIValidationError(
                        f"Unable to download file: {str(download_error)}",
                        details={"url": converted_url},
                    ) from download_error

                with tempfile.NamedTemporaryFile(
                    delete=False, suffix=f".{file_type}"
                ) as temp_file:
                    temp_file.write(response.content)
                    temp_file_path = temp_file.name

                ingest_result = ingest_tabular_file(
                    conn,
                    temp_file_path,
                    file_type,
                    request.table_alias,
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
                    "column_profiles": ingest_result.column_profiles,
                }
            else:
                table_metadata = build_file_metadata(
                    source_id=table_name,
                    filename=f"url_{table_name}",
                    file_path=f"url://{converted_url}",
                    file_type=file_type,
                    table_metadata=metadata,
                    extra={"source_url": converted_url},
                )
                save_file_metadata(table_metadata)
                logger.debug("Successfully saved URL table metadata: %s", table_name)

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
async def get_url_info(url: str):
    """获取URL文件信息（不下载完整文件）"""
    try:
        app_config = config_manager.get_app_config()
        response = requests.head(url, timeout=app_config.url_reader_head_timeout)
        response.raise_for_status()

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
