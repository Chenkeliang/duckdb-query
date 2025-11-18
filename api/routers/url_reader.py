from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl
import requests
import tempfile
import os
import time
import logging
from typing import Optional
from core.config_manager import config_manager
from core.duckdb_engine import get_db_connection
from core.file_datasource_manager import (
    file_datasource_manager,
    create_table_from_dataframe,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# DuckDB 原生 read_* 能直接通过 httpfs 读取的文件类型
NATIVE_REMOTE_TYPES = {"csv", "json", "jsonl", "parquet", "pq"}


class URLReadRequest(BaseModel):
    url: HttpUrl
    table_alias: str
    file_type: Optional[str] = None  # 可选：csv, json, parquet, excel
    encoding: Optional[str] = "utf-8"
    delimiter: Optional[str] = ","
    header: Optional[bool] = True


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
            # 默认尝试CSV
            file_type = "csv"
        conn = get_db_connection()

        table_name = request.table_alias
        original_table_name = table_name

        while True:
            try:
                result = conn.execute(
                    "SELECT table_name FROM information_schema.tables WHERE lower(table_name) = lower(?)",
                    [table_name],
                ).fetchone()
                if result is None:
                    break
                timestamp = time.strftime("%Y%m%d%H%M", time.localtime())
                table_name = f"{original_table_name}_{timestamp}"
                break
            except Exception as e:
                logger.debug("检查表名时出错: %s", e)
                break

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
        native_attempted = file_type in NATIVE_REMOTE_TYPES
        if native_attempted:
            try:
                metadata = create_table_from_dataframe(
                    conn,
                    table_name,
                    converted_url,
                    file_type,
                    reader_options=reader_options,
                )
            except Exception as exc:
                logger.warning(
                    "DuckDB/httpfs 读取失败，准备回退: url=%s, err=%s",
                    converted_url,
                    exc,
                )

        if metadata is None:
            try:
                response = requests.get(
                    converted_url, timeout=app_config.url_reader_timeout
                )
                response.raise_for_status()
            except requests.RequestException as download_error:
                raise HTTPException(
                    status_code=400, detail=f"无法下载文件: {str(download_error)}"
                )

            with tempfile.NamedTemporaryFile(
                delete=False, suffix=f".{file_type}"
            ) as temp_file:
                temp_file.write(response.content)
                temp_file_path = temp_file.name

            metadata = create_table_from_dataframe(
                conn,
                table_name,
                temp_file_path,
                file_type,
                reader_options=reader_options,
            )

        from core.timezone_utils import get_current_time_iso

        table_metadata = {
            "source_id": table_name,
            "filename": f"url_{table_name}",
            "file_path": f"url://{converted_url}",
            "file_type": file_type,
            "row_count": metadata.get("row_count", 0),
            "column_count": metadata.get("column_count", 0),
            "columns": metadata.get("columns", []),
            "column_profiles": metadata.get("column_profiles", []),
            "schema_version": 2,
            "created_at": get_current_time_iso(),
            "source_url": converted_url,
        }

        file_datasource_manager.save_file_datasource(table_metadata)
        logger.debug("成功保存URL表元数据: %s", table_name)

        return {
            "success": True,
            "message": f"成功从URL读取文件并创建表: {table_name}",
            "table_name": table_name,
            "row_count": metadata.get("row_count", 0),
            "column_count": metadata.get("column_count", 0),
            "columns": metadata.get("columns", []),
            "file_type": file_type,
            "url": converted_url,
            "original_url": str(request.url),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"处理文件时发生错误: {str(e)}")
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

        return {
            "success": True,
            "file_type": file_type,
            "content_type": content_type,
            "content_length": int(content_length) if content_length else None,
            "url": url,
        }

    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"无法访问URL: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取URL信息时发生错误: {str(e)}")
