"""同步查询结果服务端导出（Parquet / CSV）。"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import time
import uuid
from typing import List, Literal, Optional

import duckdb
from core.common.config_manager import config_manager
from core.common.exceptions import ValidationError as APIValidationError
from core.database.duckdb_engine import with_duckdb_connection
from core.database.duckdb_pool import interruptible_connection
from core.database.federated_attach import (
    attach_databases_on_connection,
    detach_databases_on_connection,
    resolve_attach_configs,
)
from core.database.query_metrics import log_query_duration
from fastapi import APIRouter, Header
from fastapi.responses import FileResponse
from models.query_models import AttachDatabase
from pydantic import BaseModel, Field
from utils.local_export import desktop_local_export_enabled, validate_local_target_path
from utils.response_helpers import (
    MessageCode,
    create_success_response,
    error_json_response,
)
from utils.safe_filename import safe_filename_base

logger = logging.getLogger(__name__)

router = APIRouter()


def _ensure_read_only(sql: str) -> None:
    """解析 SQL 并拒绝任何非 SELECT 语句（防止经导出端点执行写操作）。

    用 DuckDB 解析器判定语句类型，替代易绕过/易误杀的关键字黑名单。
    """
    parser = duckdb.connect()
    try:
        statements = parser.extract_statements(sql)
    except Exception as exc:
        raise APIValidationError(f"Invalid SQL: {exc}")
    finally:
        parser.close()

    if not statements or any(
        stmt.type != duckdb.StatementType.SELECT for stmt in statements
    ):
        raise APIValidationError(
            "Only read-only SELECT queries are allowed for export"
        )


class QueryResultExportRequest(BaseModel):
    sql: str = Field(..., min_length=1)
    format: Literal["parquet", "csv"] = "parquet"
    attach_databases: Optional[List[AttachDatabase]] = None
    # 行数范围【显式选择】:False(默认)=全量导出(逐字执行,尊重用户自己的 LIMIT);
    # True=限制(最外层缺 LIMIT 时补 max_query_rows)。不从 SQL 文本猜测。
    apply_row_limit: bool = False


@router.post("/api/query-results/export", tags=["Query Export"])
def export_query_results(
    request: QueryResultExportRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """将 SQL 查询结果导出为 Parquet 或 CSV 文件（服务端 COPY，避免浏览器内存限制）。"""
    from routers.query_sql_utils import (
        apply_row_limit_choice,
        prepare_query_for_embedding,
    )

    sql_query = apply_row_limit_choice(
        request.sql.strip().rstrip(";"), request.apply_row_limit
    )
    if not sql_query:
        raise APIValidationError("SQL cannot be empty")

    _ensure_read_only(sql_query)
    embedded_sql = prepare_query_for_embedding(sql_query)

    exports_dir = str(config_manager.get_exports_dir())
    os.makedirs(exports_dir, exist_ok=True)

    file_id = str(uuid.uuid4())
    ext = "parquet" if request.format == "parquet" else "csv"
    file_path = os.path.join(exports_dir, f"{file_id}.{ext}")

    query_id = f"sync:{x_request_id}" if x_request_id else None
    conn_ctx = (
        interruptible_connection(query_id, sql_query)
        if query_id
        else with_duckdb_connection()
    )

    # Newlines keep a terminal ``-- comment`` from swallowing COPY's closing parenthesis.
    copy_sql = (
        f"COPY (\n{embedded_sql}\n) TO '{file_path}' "
        f"(FORMAT {'PARQUET' if request.format == 'parquet' else 'CSV'})"
    )
    attached_aliases: List[str] = []
    row_count = 0
    try:
        start = time.time()
        with conn_ctx as con:
            try:
                if request.attach_databases:
                    attach_configs = resolve_attach_configs(request.attach_databases)
                    attached_aliases = attach_databases_on_connection(con, attach_configs)

                copy_result = con.execute(copy_sql).fetchone()
                row_count = int(copy_result[0]) if copy_result else 0
            finally:
                if attached_aliases:
                    detach_databases_on_connection(con, attached_aliases)

        elapsed_ms = (time.time() - start) * 1000
        explain_threshold = max(
            config_manager.get_app_config().duckdb_auto_explain_threshold_ms or 0, 0
        )
        # 仅在确实需要 EXPLAIN 时才额外获取连接，避免每次导出多占一个池连接
        if explain_threshold and elapsed_ms >= explain_threshold:
            with with_duckdb_connection() as metrics_con:
                log_query_duration(
                    metrics_con,
                    copy_sql,
                    elapsed_ms,
                    row_count,
                    explain_threshold_ms=explain_threshold,
                )
        else:
            log_query_duration(
                None,
                copy_sql,
                elapsed_ms,
                row_count,
                explain_threshold_ms=explain_threshold,
            )

        download_url = f"/api/query-results/export/{file_id}/download"
        return create_success_response(
            data={
                "file_id": file_id,
                "download_url": download_url,
                "format": request.format,
                "row_count_estimate": row_count,
            },
            message_code=MessageCode.OPERATION_SUCCESS,
            message="Export completed",
        )
    except duckdb.InterruptException as exc:
        if os.path.exists(file_path):
            os.remove(file_path)
        return error_json_response(
            499,
            MessageCode.QUERY_CANCELLED,
            "Export cancelled",
            details={"error": str(exc)},
        )
    except Exception as exc:
        if os.path.exists(file_path):
            os.remove(file_path)
        logger.error("Query export failed: %s", exc, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Export failed: {exc}",
        )


@router.get("/api/query-results/export/{file_id}/download", tags=["Query Export"])
def download_query_export(file_id: str, filename: Optional[str] = None):
    """下载已导出的查询结果文件。

    filename(可选):前端传入的友好下载名(通常是表名),用于 Content-Disposition,
    让用户在浏览器下载里认出文件;清洗后使用,防路径穿越/头注入。缺省回退 query_export。
    """
    if not file_id or ".." in file_id or "/" in file_id:
        raise APIValidationError("Invalid file id")

    safe_name = safe_filename_base(filename) if filename else ""

    exports_dir = str(config_manager.get_exports_dir())
    for ext in ("parquet", "csv"):
        path = os.path.join(exports_dir, f"{file_id}.{ext}")
        if os.path.isfile(path):
            media = (
                "application/octet-stream"
                if ext == "parquet"
                else "text/csv"
            )
            return FileResponse(
                path,
                media_type=media,
                filename=f"{safe_name or 'query_export'}.{ext}",
            )

    return error_json_response(
        404,
        MessageCode.RESOURCE_NOT_FOUND,
        "Export file not found",
    )


class SaveExportToPathRequest(BaseModel):
    """桌面直写:把已导出文件拷到原生存盘对话框选定的绝对路径。"""

    target_path: str


def _find_export_file(file_id: str) -> Optional[str]:
    """按 file_id 定位 exports 目录里的导出文件(与下载端点同一查找规则)。"""
    exports_dir = str(config_manager.get_exports_dir())
    for ext in ("parquet", "csv"):
        path = os.path.join(exports_dir, f"{file_id}.{ext}")
        if os.path.isfile(path):
            return path
    return None


@router.post("/api/query-results/export/{file_id}/save-to-path", tags=["Query Export"])
async def save_query_export_to_path(file_id: str, request: SaveExportToPathRequest):
    """桌面模式专用:把已导出的查询结果文件拷贝到用户选定的本地路径。

    门控与 async-tasks 的 export-to-path 一致(ALLOW_ARBITRARY_LOCAL_PATHS=1,
    见 utils/local_export.py);Web/Docker 一律 403,浏览器场景继续用
    GET /download 流式端点。拷贝跑线程池,不阻塞事件循环。
    """
    if not desktop_local_export_enabled():
        return error_json_response(
            403,
            MessageCode.FORBIDDEN,
            "Direct local export is only available in the desktop app; "
            "use GET /api/query-results/export/{file_id}/download instead",
            details={"file_id": file_id},
        )
    if not file_id or ".." in file_id or "/" in file_id:
        raise APIValidationError("Invalid file id")
    try:
        target = validate_local_target_path(request.target_path)
        source = _find_export_file(file_id)
        if source is None:
            return error_json_response(
                404,
                MessageCode.RESOURCE_NOT_FOUND,
                "Export file not found",
                details={"file_id": file_id},
            )
        await asyncio.to_thread(shutil.copyfile, source, target)
        return create_success_response(
            data={"path": target, "size_bytes": os.path.getsize(target)},
            message_code=MessageCode.OPERATION_SUCCESS,
        )
    except ValueError as e:
        return error_json_response(
            400, MessageCode.VALIDATION_ERROR, str(e), details={"file_id": file_id}
        )
    except Exception as e:  # pylint: disable=broad-exception-caught
        logger.error("Failed to save export to local path: %s, error: %s", file_id, e)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to save export to local path: {str(e)}",
            details={"file_id": file_id},
        )
