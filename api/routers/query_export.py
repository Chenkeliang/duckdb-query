"""同步查询结果服务端导出（Parquet / CSV）。"""

from __future__ import annotations

import logging
import os
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
from utils.response_helpers import (
    MessageCode,
    create_success_response,
    error_json_response,
)

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


@router.post("/api/query-results/export", tags=["Query Export"])
async def export_query_results(
    request: QueryResultExportRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """将 SQL 查询结果导出为 Parquet 或 CSV 文件（服务端 COPY，避免浏览器内存限制）。"""
    sql_query = request.sql.strip().rstrip(";")
    if not sql_query:
        raise APIValidationError("SQL cannot be empty")

    _ensure_read_only(sql_query)

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

    copy_sql = (
        f"COPY ({sql_query}) TO '{file_path}' "
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
async def download_query_export(file_id: str):
    """下载已导出的查询结果文件。"""
    if not file_id or ".." in file_id or "/" in file_id:
        raise APIValidationError("Invalid file id")

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
                filename=f"query_export.{ext}",
            )

    return error_json_response(
        404,
        MessageCode.RESOURCE_NOT_FOUND,
        "Export file not found",
    )
