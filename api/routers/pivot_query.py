# pylint: disable=too-many-lines,broad-exception-caught,logging-fstring-interpolation,import-outside-toplevel,line-too-long,unused-argument
"""Pivot query HTTP routes (generate/preview)."""

import logging
from typing import Any, Dict, List, Optional

import duckdb
from fastapi import APIRouter, Header

from core.database.duckdb_engine import (
    timed_fetch_query_records,
    with_duckdb_connection,
)
from core.database.duckdb_pool import interruptible_connection
from core.database.federated_attach import (
    attach_databases_on_connection,
    detach_databases_on_connection,
    execute_sql_with_attach,
    resolve_attach_configs,
)
from core.services.pivot_query_generator import (
    generate_pivot_query_sql,
    validate_query_config,
)
from models.pivot_query_models import (
    PivotPreviewRequest,
    ResolvedTypeCast,
    PivotQueryMode,
    PivotQueryRequest,
)
from routers.query_sql_utils import ensure_query_has_limit
from utils.response_helpers import (
    MessageCode,
    create_success_response,
    error_json_response,
)
from core.common.error_codes import classify_exception

logger = logging.getLogger(__name__)

router = APIRouter()
PIVOT_MODE = PivotQueryMode.PIVOT
PIVOT_TAGS = ["Pivot Query"]


def _map_resolved_casts(resolved_casts: List[ResolvedTypeCast]) -> Dict[str, str]:
    casts_map: Dict[str, str] = {}
    for item in resolved_casts or []:
        column = (item.column or "").strip()
        cast = (item.cast or "").strip().upper()
        if not column or not cast:
            continue
        casts_map[column.lower()] = cast
    return casts_map


def _strip_sql_semicolon(sql: str) -> str:
    return sql.rstrip().rstrip(";")


def _build_preview_count_sql(sql: str) -> str:
    cleaned = _strip_sql_semicolon(sql)
    return f"SELECT COUNT(*) AS total_rows FROM ({cleaned}) AS preview_count"


def _generate_pivot_query(request: PivotQueryRequest):
    """Generate pivot query SQL."""
    try:
        validation_result = validate_query_config(request.config)

        if not validation_result.is_valid:
            return error_json_response(
                400,
                MessageCode.PIVOT_QUERY_INVALID,
                "Pivot query configuration is invalid",
                details={
                    "errors": validation_result.errors,
                    "warnings": validation_result.warnings,
                },
            )

        resolved_casts_map = _map_resolved_casts(request.resolved_casts)

        # 列上限探测/列值采样须在【已 ATTACH】连接上跑,否则联邦透视看不到外部表(回归修复)。
        # 生成器保持纯:不自开连接,用这里 ATTACH 好的连接。
        attach_list = getattr(request, "attach_databases", None) or None
        with with_duckdb_connection() as con:
            try:
                if attach_list:
                    attach_databases_on_connection(con, resolve_attach_configs(attach_list))
                generation = generate_pivot_query_sql(
                    request.config,
                    pivot_config=request.pivot_config,
                    resolved_casts=resolved_casts_map,
                    connection=con,
                )
            finally:
                # 防御性 detach:按【意图 attach 的别名】清理——即使 attach 中途失败(前面已成功
                # 部分),也不把带残留 ATTACH 的连接放回池(detach 对不存在别名安全跳过)。
                if attach_list:
                    detach_databases_on_connection(
                        con, [db.alias for db in attach_list if getattr(db, "alias", None)]
                    )

        combined_warnings = list(validation_result.warnings or [])
        combined_warnings.extend(generation.warnings)

        metadata: Optional[Dict[str, Any]] = dict(generation.metadata or {})

        return create_success_response(
            data={
                "sql": generation.final_sql,
                "base_sql": generation.base_sql,
                "pivot_sql": generation.pivot_sql,
                "errors": [],
                "warnings": combined_warnings,
                "metadata": metadata,
                "mode": PIVOT_MODE,
            },
            message_code=MessageCode.PIVOT_QUERY_GENERATED,
        )

    except Exception as exc:
        logger.error("Failed to generate pivot query: %s", exc, exc_info=True)
        code, status = classify_exception(str(exc))
        return error_json_response(
            status,
            code,
            f"Failed to generate query: {str(exc)}",
        )


def _preview_pivot_query(
    request: PivotPreviewRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """Preview pivot query results."""
    query_id = f"sync:{x_request_id}" if x_request_id else None

    try:
        validation_result = validate_query_config(request.config)

        if not validation_result.is_valid:
            return error_json_response(
                400,
                MessageCode.PIVOT_QUERY_INVALID,
                "Pivot query configuration is invalid",
                details={
                    "errors": validation_result.errors,
                    "warnings": validation_result.warnings,
                },
            )

        resolved_casts_map = _map_resolved_casts(request.resolved_casts)
        attach_list = getattr(request, "attach_databases", None) or None

        # 生成期的列上限探测/采样须在已 ATTACH 连接上(联邦透视看得到外部表);生成器不自开连接。
        with with_duckdb_connection() as con:
            try:
                if attach_list:
                    attach_databases_on_connection(con, resolve_attach_configs(attach_list))
                generation = generate_pivot_query_sql(
                    request.config,
                    pivot_config=request.pivot_config,
                    resolved_casts=resolved_casts_map,
                    connection=con,
                )
            finally:
                # 防御性 detach:按【意图 attach 的别名】清理(部分 attach 失败也不残留,见 generate 路由)
                if attach_list:
                    detach_databases_on_connection(
                        con, [db.alias for db in attach_list if getattr(db, "alias", None)]
                    )

        preview_limit = request.limit
        if preview_limit is None or preview_limit <= 0:
            from core.common.config_manager import config_manager

            preview_limit = config_manager.get_app_config().max_query_rows or 10
        preview_sql = ensure_query_has_limit(generation.final_sql, preview_limit)

        if attach_list:
            columns, data, _ = execute_sql_with_attach(
                preview_sql,
                attach_databases=attach_list,
                query_id=query_id,
            )
            total_rows = len(data)
            try:
                count_sql = _build_preview_count_sql(generation.final_sql)
                _, count_records, _ = execute_sql_with_attach(
                    count_sql,
                    attach_databases=attach_list,
                    query_id=None,
                )
                if count_records:
                    total_rows = int(next(iter(count_records[0].values())))
            except Exception as count_exc:
                logger.warning("Failed to calculate preview total rows: %s", count_exc)
        elif query_id:
            with interruptible_connection(query_id, preview_sql) as conn:
                columns, data, _ = timed_fetch_query_records(conn, preview_sql)
                total_rows = len(data)
                try:
                    count_sql = _build_preview_count_sql(generation.final_sql)
                    count_row = conn.execute(count_sql).fetchone()
                    if count_row is not None:
                        total_rows = int(count_row[0])
                except Exception as count_exc:
                    logger.warning("Failed to calculate preview total rows: %s", count_exc)
        else:
            with with_duckdb_connection() as con:
                columns, data, _ = timed_fetch_query_records(con, preview_sql)
                total_rows = len(data)
                try:
                    count_sql = _build_preview_count_sql(generation.final_sql)
                    count_row = con.execute(count_sql).fetchone()
                    if count_row is not None:
                        total_rows = int(count_row[0])
                except Exception as count_exc:
                    logger.warning("Failed to calculate preview total rows: %s", count_exc)

        combined_warnings = list(validation_result.warnings or [])
        combined_warnings.extend(generation.warnings)

        returned_rows = len(data)
        return create_success_response(
            data={
                "data": data,
                "columns": columns,
                "row_count": total_rows,
                "returned_rows": returned_rows,
                "sql": preview_sql,
                "base_sql": generation.base_sql,
                "pivot_sql": generation.pivot_sql,
                "mode": PIVOT_MODE,
                "errors": [],
                "warnings": combined_warnings,
            },
            message_code=MessageCode.PIVOT_QUERY_PREVIEWED,
        )

    except duckdb.InterruptException:
        logger.info("Pivot query preview %s was cancelled by user", query_id)
        return error_json_response(
            499,
            MessageCode.QUERY_CANCELLED,
            "Query cancelled by client",
            details={"query_id": query_id},
        )
    except Exception as exc:
        logger.error("Failed to preview pivot query: %s", exc, exc_info=True)
        # 与 join-query 一致地分类（表不存在→404、语法错→400…），不再一律 500（回归 #16）
        code, status = classify_exception(str(exc))
        return error_json_response(
            status,
            code,
            f"Failed to preview query: {str(exc)}",
        )


@router.post("/api/pivot-query/generate", tags=PIVOT_TAGS)
def generate_pivot_query_route(request: PivotQueryRequest):
    return _generate_pivot_query(request)


@router.post("/api/pivot-query/preview", tags=PIVOT_TAGS)
def preview_pivot_query_route(
    request: PivotPreviewRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    return _preview_pivot_query(request, x_request_id)
