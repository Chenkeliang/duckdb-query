# pylint: disable=too-many-lines,broad-exception-caught,logging-fstring-interpolation,import-outside-toplevel,line-too-long,unused-argument
"""Pivot query HTTP routes (generate/preview with mode=pivot). Visual builder UI removed."""
import logging
from typing import Any, Dict, List, Optional

import duckdb

from core.database.duckdb_engine import execute_query, with_duckdb_connection
from core.database.duckdb_pool import interruptible_connection
from core.services.visual_query_generator import (
    estimate_query_performance,
    generate_visual_query_sql,
    validate_query_config,
)
from fastapi import APIRouter, Header
from models.visual_query_models import PreviewRequest, ResolvedTypeCast, VisualQueryRequest
from utils.response_helpers import (
    MessageCode,
    create_success_response,
    error_json_response,
)
from routers.query_sql_utils import ensure_query_has_limit

logger = logging.getLogger(__name__)

router = APIRouter()


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


# ==================== Visual Query API Endpoints ====================


@router.post("/api/visual-query/generate", tags=["Visual Query"])
async def generate_visual_query(request: VisualQueryRequest):
    """Generate visual query SQL"""
    try:
        validation_result = validate_query_config(request.config)

        if not validation_result.is_valid:
            return error_json_response(
                400,
                MessageCode.VISUAL_QUERY_INVALID,
                "Visual query configuration is invalid",
                details={
                    "errors": validation_result.errors,
                    "warnings": validation_result.warnings,
                    "mode": request.mode,
                },
            )

        resolved_casts_map = _map_resolved_casts(request.resolved_casts)

        generation = generate_visual_query_sql(
            request.config,
            mode=request.mode,
            pivot_config=request.pivot_config,
            resolved_casts=resolved_casts_map,
        )

        combined_warnings = list(validation_result.warnings or [])
        combined_warnings.extend(generation.warnings)

        metadata: Optional[Dict[str, Any]] = None

        if request.include_metadata:
            try:
                with with_duckdb_connection() as con:
                    estimate = estimate_query_performance(request.config, con)
                metadata = {
                    "estimated_rows": estimate.estimated_rows,
                    "estimated_time": estimate.estimated_time,
                    "complexity_score": validation_result.complexity_score,
                }
            except Exception as perf_exc:
                logger.warning("Failed to estimate query performance: %s", perf_exc)
                combined_warnings.append("Unable to estimate query performance")
                metadata = {
                    "estimated_rows": None,
                    "estimated_time": None,
                    "complexity_score": validation_result.complexity_score,
                }

            if metadata is not None:
                metadata.update(generation.metadata or {})
        elif generation.metadata:
            metadata = generation.metadata

        return create_success_response(
            data={
                "sql": generation.final_sql,
                "base_sql": generation.base_sql,
                "pivot_sql": generation.pivot_sql,
                "errors": [],
                "warnings": combined_warnings,
                "metadata": metadata,
                "mode": request.mode,
            },
            message_code=MessageCode.VISUAL_QUERY_GENERATED,
        )

    except Exception as exc:
        logger.error("Failed to generate visual query: %s", exc, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to generate query: {str(exc)}",
            details={"mode": request.mode},
        )


@router.post("/api/visual-query/preview", tags=["Visual Query"])
async def preview_visual_query(
    request: PreviewRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """Preview visual query results"""
    query_id = f"sync:{x_request_id}" if x_request_id else None

    try:
        validation_result = validate_query_config(request.config)

        if not validation_result.is_valid:
            return error_json_response(
                400,
                MessageCode.VISUAL_QUERY_INVALID,
                "Visual query configuration is invalid",
                details={
                    "errors": validation_result.errors,
                    "warnings": validation_result.warnings,
                    "mode": request.mode,
                },
            )

        resolved_casts_map = _map_resolved_casts(request.resolved_casts)

        generation = generate_visual_query_sql(
            request.config,
            mode=request.mode,
            pivot_config=request.pivot_config,
            resolved_casts=resolved_casts_map,
        )

        preview_limit = request.limit
        if preview_limit is None or preview_limit <= 0:
            from core.common.config_manager import config_manager

            preview_limit = config_manager.get_app_config().max_query_rows or 10
        preview_sql = ensure_query_has_limit(generation.final_sql, preview_limit)

        # Execute query using interruptible connection
        if query_id:
            with interruptible_connection(query_id, preview_sql) as conn:
                preview_df = conn.execute(preview_sql).fetchdf()

                # Calculate total rows (in same connection context)
                total_rows = len(preview_df)
                try:
                    count_sql = _build_preview_count_sql(generation.final_sql)
                    count_df = conn.execute(count_sql).fetchdf()
                    if not count_df.empty:
                        total_rows = int(count_df.iloc[0][0])
                except Exception as count_exc:
                    logger.warning("Failed to calculate preview total rows: %s", count_exc)
        else:
            with with_duckdb_connection() as con:
                preview_df = execute_query(preview_sql, con)

                total_rows = len(preview_df)
                try:
                    count_sql = _build_preview_count_sql(generation.final_sql)
                    count_df = execute_query(count_sql, con)
                    if not count_df.empty:
                        total_rows = int(count_df.iloc[0, 0])
                except Exception as count_exc:
                    logger.warning("Failed to calculate preview total rows: %s", count_exc)

        data = preview_df.to_dict("records")
        columns = [str(col) for col in preview_df.columns.tolist()]

        estimated_time = None
        try:
            with with_duckdb_connection() as con:
                estimate = estimate_query_performance(request.config, con)
                estimated_time = estimate.estimated_time
        except Exception as perf_exc:
            logger.debug("Failed to estimate preview performance: %s", perf_exc)

        combined_warnings = list(validation_result.warnings or [])
        combined_warnings.extend(generation.warnings)

        returned_rows = len(data)
        return create_success_response(
            data={
                "data": data,
                "columns": columns,
                "row_count": total_rows,
                "returned_rows": returned_rows,
                "estimated_time": estimated_time,
                "sql": preview_sql,
                "base_sql": generation.base_sql,
                "pivot_sql": generation.pivot_sql,
                "mode": request.mode,
                "errors": [],
                "warnings": combined_warnings,
            },
            message_code=MessageCode.VISUAL_QUERY_PREVIEWED,
        )

    except duckdb.InterruptException:
        logger.info(f"Visual query preview {query_id} was cancelled by user")
        return error_json_response(
            499,
            MessageCode.QUERY_CANCELLED,
            "Query cancelled by client",
            details={"query_id": query_id},
        )
    except Exception as exc:
        logger.error("Failed to preview visual query: %s", exc, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to preview query: {str(exc)}",
            details={"mode": request.mode},
        )
