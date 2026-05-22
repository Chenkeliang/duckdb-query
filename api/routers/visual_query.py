# pylint: disable=too-many-lines,broad-exception-caught,logging-fstring-interpolation,import-outside-toplevel,line-too-long,unused-argument
"""Visual query HTTP routes (extracted from join_query.py)."""
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

import duckdb

from core.data.file_datasource_manager import (
    build_table_metadata_snapshot,
    file_datasource_manager,
)
from core.database.duckdb_engine import execute_query, get_db_connection
from core.database.duckdb_pool import interruptible_connection
from core.services.visual_query_generator import (
    _build_where_clause,
    _quote_identifier,
    estimate_query_performance,
    generate_visual_query_sql,
    get_column_statistics,
    validate_query_config,
)
from core.common.exceptions import (
    BaseAPIException,
    ResourceNotFoundError,
    ValidationError as APIValidationError,
)
from fastapi import APIRouter, Body, Header
from models.visual_query_models import (
    ColumnProfilePayload,
    ColumnTypeReference,
    PreviewRequest,
    ResolvedTypeCast,
    TypeConflictModel,
    VisualQueryConfig,
    VisualQueryRequest,
    VisualQueryValidationRequest,
)
from pydantic import BaseModel, Field, ValidationError
from utils.response_helpers import (
    MessageCode,
    create_success_response,
    error_json_response,
)
from routers.query_sql_utils import ensure_query_has_limit, remove_auto_added_limit

logger = logging.getLogger(__name__)

router = APIRouter()


_NUMERIC_AGG_FUNCTIONS = {
    "SUM",
    "AVG",
    "STDDEV_SAMP",
    "VAR_SAMP",
    "MEDIAN",
    "PERCENTILE_CONT_25",
    "PERCENTILE_CONT_75",
    "PERCENTILE_DISC_25",
    "PERCENTILE_DISC_75",
    "SUM_OVER",
    "AVG_OVER",
}

_NUMERIC_TYPE_PREFIXES = (
    "DECIMAL",
    "NUMERIC",
    "DOUBLE",
    "FLOAT",
    "REAL",
)

_NUMERIC_TYPE_NAMES = {
    "INTEGER",
    "INT",
    "BIGINT",
    "SMALLINT",
    "TINYINT",
    "HUGEINT",
    "UTINYINT",
    "USMALLINT",
    "UINTEGER",
    "UBIGINT",
    "DOUBLE",
    "FLOAT",
    "REAL",
}


def _normalize_duckdb_type(type_str: Optional[str]) -> Optional[str]:
    if not type_str:
        return None
    normalized = type_str.strip().upper()
    if "(" in normalized:
        normalized = normalized.split("(", 1)[0]
    return normalized


def _is_numeric_type(type_str: Optional[str]) -> bool:
    normalized = _normalize_duckdb_type(type_str)
    if not normalized:
        return False
    if normalized in _NUMERIC_TYPE_NAMES:
        return True
    return any(normalized.startswith(prefix) for prefix in _NUMERIC_TYPE_PREFIXES)


def _map_resolved_casts(resolved_casts: List[ResolvedTypeCast]) -> Dict[str, str]:
    casts_map: Dict[str, str] = {}
    for item in resolved_casts or []:
        column = (item.column or "").strip()
        cast = (item.cast or "").strip().upper()
        if not column or not cast:
            continue
        casts_map[column.lower()] = cast
    return casts_map


def _map_frontend_profiles(
    profiles: List[ColumnProfilePayload],
) -> Dict[str, ColumnProfilePayload]:
    return {
        profile.name.lower(): profile
        for profile in profiles or []
        if profile.name and profile.name.strip()
    }


def _load_backend_column_profiles(table_name: str) -> Dict[str, Dict[str, Any]]:
    try:
        entry = file_datasource_manager.get_file_datasource(table_name)
        profiles = (entry or {}).get("column_profiles") if entry else None
        if profiles:
            return {
                str(profile.get("name", "")).lower(): profile for profile in profiles
            }

        con = get_db_connection()
        snapshot = build_table_metadata_snapshot(con, table_name)
        return {
            str(profile.get("name", "")).lower(): profile
            for profile in snapshot.get("column_profiles", [])
        }
    except Exception as exc:
        logger.warning("Failed to load backend column metadata: %s", exc)
        return {}


def _recommended_numeric_casts(_: Optional[str]) -> List[str]:
    return ["DECIMAL(18,4)", "DOUBLE"]


def _build_conflict_column_ref(
    table: str,
    column: str,
    duckdb_type: Optional[str],
    normalized_type: Optional[str],
) -> ColumnTypeReference:
    return ColumnTypeReference(
        table=table,
        column=column,
        duckdb_type=duckdb_type,
        normalized_type=normalized_type,
    )


def _detect_aggregation_conflicts(
    config: VisualQueryConfig,
    backend_profiles: Dict[str, Dict[str, Any]],
    frontend_profiles: Dict[str, ColumnProfilePayload],
    resolved_casts: Dict[str, str],
) -> Tuple[List[TypeConflictModel], Dict[str, List[str]]]:
    conflicts: List[TypeConflictModel] = []
    suggested_casts: Dict[str, List[str]] = {}

    for agg in config.aggregations or []:
        func = agg.function.value.upper()
        if func not in _NUMERIC_AGG_FUNCTIONS:
            continue

        column_key = (agg.column or "").strip()
        if not column_key:
            continue

        if column_key.lower() in resolved_casts:
            # User has specified TRY_CAST, considered resolved
            continue

        backend_profile = backend_profiles.get(column_key.lower())
        frontend_profile = frontend_profiles.get(column_key.lower())

        duckdb_type = None
        normalized_type = None

        if backend_profile:
            duckdb_type = backend_profile.get("duckdb_type") or backend_profile.get(
                "type"
            )
            normalized_type = _normalize_duckdb_type(duckdb_type)

        if not normalized_type and frontend_profile:
            duckdb_type = (
                frontend_profile.duckdb_type or frontend_profile.raw_type or duckdb_type
            )
            normalized_type = (
                frontend_profile.normalized_type
                or _normalize_duckdb_type(frontend_profile.duckdb_type)
                or _normalize_duckdb_type(frontend_profile.raw_type)
            )

        if _is_numeric_type(normalized_type):
            continue

        recommended = _recommended_numeric_casts(normalized_type)
        if recommended:
            suggested_casts[column_key] = recommended

        message = (
            f"{func} requires numeric type, but column {column_key} is currently {duckdb_type or 'unknown type'}"
        )

        conflicts.append(
            TypeConflictModel(
                operation="aggregation",
                message=message,
                left=_build_conflict_column_ref(
                    table=config.table_name,
                    column=column_key,
                    duckdb_type=duckdb_type,
                    normalized_type=normalized_type,
                ),
                right=None,
                function=func,
                recommended_casts=recommended,
            )
        )

    return conflicts, suggested_casts


class DistinctValuesMetric(BaseModel):
    agg: str = Field(..., description="Aggregation: SUM|COUNT|AVG|MIN|MAX")
    column: str = Field(..., description="Column name for metric sorting")


class DistinctValuesRequest(BaseModel):
    config: VisualQueryConfig = Field(
        ..., description="Configuration for constructing base filters, only table and filter conditions needed"
    )
    column: str = Field(..., description="Target column (can be computed column alias)")
    limit: int = Field(12, description="Top-N count")
    order_by: Optional[str] = Field("frequency", description="frequency|metric")
    metric: Optional[DistinctValuesMetric] = None
    base_limit: Optional[int] = Field(None, description="Base sampling row limit, optional")


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
                con = get_db_connection()
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
            # Backward compatibility
            con = get_db_connection()
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
            con = get_db_connection()
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


@router.post("/api/visual-query/distinct-values", tags=["Visual Query"])
async def get_distinct_values(
    req: DistinctValuesRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """Return Top-N distinct values for specified column, sortable by frequency or metric aggregation.

    Security notes:
    - Column names wrapped with _quote_identifier
    - Aggregation function whitelist validation
    - LIMIT uses parameterized values
    Supports query cancellation via X-Request-ID header
    """
    query_id = f"sync:{x_request_id}" if x_request_id else None

    try:
        validation_result = validate_query_config(req.config)
        if not validation_result.is_valid:
            return error_json_response(
                400,
                MessageCode.VALIDATION_ERROR,
                "Query configuration validation failed",
                details={
                    "errors": validation_result.errors,
                    "warnings": validation_result.warnings,
                },
            )

        table = _quote_identifier(req.config.table_name)
        target_col = _quote_identifier(req.column)
        where_clause = _build_where_clause(req.config.filters)

        # Optional base sampling limit
        base_limit_sql = ""
        if req.base_limit and req.base_limit > 0:
            base_limit_sql = f" LIMIT {int(req.base_limit)}"

        base_cte = (
            f"WITH base AS (SELECT * FROM {table} {where_clause}{base_limit_sql})"
        )

        order_by = (req.order_by or "frequency").lower()
        sql = ""
        limit_val = int(req.limit or 12)

        if order_by == "metric" and req.metric:
            agg = (req.metric.agg or "").upper()
            if agg not in ["SUM", "COUNT", "AVG", "MIN", "MAX"]:
                raise APIValidationError("Unsupported aggregation function")
            metric_col = _quote_identifier(req.metric.column)
            sql = (
                f"{base_cte} SELECT {target_col} AS v, COUNT(*) AS c, {agg}({metric_col}) AS m "
                f"FROM base WHERE {target_col} IS NOT NULL GROUP BY 1 ORDER BY m DESC, c DESC LIMIT {limit_val}"
            )
        else:
            sql = (
                f"{base_cte} SELECT {target_col} AS v, COUNT(*) AS c "
                f"FROM base WHERE {target_col} IS NOT NULL GROUP BY 1 ORDER BY c DESC LIMIT {limit_val}"
            )

        # Execute query using interruptible connection
        if query_id:
            with interruptible_connection(query_id, sql) as conn:
                df = conn.execute(sql).fetchdf()

                # distinct_count statistics (in same connection context)
                distinct_sql = f"{base_cte} SELECT COUNT(DISTINCT {target_col}) FROM base WHERE {target_col} IS NOT NULL"
                distinct_df = conn.execute(distinct_sql).fetchdf()
        else:
            # Backward compatibility
            con = get_db_connection()
            df = execute_query(sql, con)

            distinct_sql = f"{base_cte} SELECT COUNT(DISTINCT {target_col}) FROM base WHERE {target_col} IS NOT NULL"
            distinct_df = execute_query(distinct_sql, con)

        values = []
        topN = []
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                values.append(str(row["v"]))
                item = {"value": str(row["v"]), "count": int(row.get("c", 0))}
                if "m" in df.columns:
                    try:
                        item["metric"] = float(row.get("m"))
                    except Exception:
                        item["metric"] = None
                topN.append(item)

        distinct_count = (
            int(distinct_df.iloc[0][0])
            if distinct_df is not None and not distinct_df.empty
            else None
        )

        return create_success_response(
            data={
                "values": values,
                "stats": {"distinct_count": distinct_count, "topN": topN},
                "errors": [],
                "warnings": validation_result.warnings,
            },
            message_code=MessageCode.QUERY_SUCCESS,
        )
    except duckdb.InterruptException:
        logger.info(f"Distinct values query {query_id} was cancelled by user")
        return error_json_response(
            499,
            MessageCode.QUERY_CANCELLED,
            "Query cancelled by client",
            details={"query_id": query_id},
        )
    except BaseAPIException:
        raise
    except Exception as exc:
        logger.error("Failed to get column distinct values: %s", exc, exc_info=True)
        return error_json_response(
            500,
            MessageCode.QUERY_FAILED,
            str(exc),
            details={"errors": [str(exc)]},
        )


@router.get(
    "/api/visual-query/column-stats/{table_name}/{column_name}",
    tags=["Visual Query"],
)
async def get_visual_query_column_stats(table_name: str, column_name: str):
    """Get column statistics"""
    try:
        con = get_db_connection()
        available_tables = con.execute("SHOW TABLES").fetchdf()
        available_names = (
            available_tables["name"].tolist() if not available_tables.empty else []
        )

        if table_name not in available_names:
            raise ResourceNotFoundError("Table", table_name)

        stats = get_column_statistics(table_name, column_name, con)
        stats_dict = (
            stats.model_dump() if hasattr(stats, "model_dump") else stats.dict()
        )

        return create_success_response(
            data={"statistics": stats_dict},
            message_code=MessageCode.QUERY_SUCCESS,
        )

    except BaseAPIException:
        raise
    except Exception as exc:
        logger.error("Failed to get column statistics: %s", exc, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to get column statistics: {str(exc)}",
        )


@router.post("/api/visual-query/validate", tags=["Visual Query"])
async def validate_visual_query_config_endpoint(payload: Dict[str, Any] = Body(...)):
    """Validate visual query configuration"""
    try:
        if isinstance(payload, dict) and "config" in payload:
            request_payload = VisualQueryValidationRequest(**payload)
        else:
            request_payload = VisualQueryValidationRequest(
                config=VisualQueryConfig(**payload),
                column_profiles=[],
                resolved_casts=[],
            )
    except ValidationError as exc:
        logger.error("Failed to parse validation request: %s", exc)
        return error_json_response(
            400,
            MessageCode.VALIDATION_ERROR,
            "Invalid request format",
            details={"errors": ["Invalid request format"]},
        )
    except Exception as exc:
        logger.error("Validation request parsing exception: %s", exc, exc_info=True)
        return error_json_response(
            400,
            MessageCode.VALIDATION_ERROR,
            f"Failed to parse configuration: {str(exc)}",
            details={"errors": [f"Failed to parse configuration: {str(exc)}"]},
        )

    try:
        validation_result = validate_query_config(request_payload.config)

        backend_profiles = _load_backend_column_profiles(
            request_payload.config.table_name
        )
        frontend_profiles = _map_frontend_profiles(request_payload.column_profiles)
        resolved_casts_map = _map_resolved_casts(request_payload.resolved_casts)

        agg_conflicts, suggested_casts = _detect_aggregation_conflicts(
            request_payload.config,
            backend_profiles,
            frontend_profiles,
            resolved_casts_map,
        )

        is_valid = validation_result.is_valid and not agg_conflicts

        return create_success_response(
            data={
                "is_valid": is_valid,
                "errors": validation_result.errors,
                "warnings": validation_result.warnings,
                "complexity_score": validation_result.complexity_score,
                "conflicts": [
                    c.model_dump() if hasattr(c, "model_dump") else c.dict()
                    for c in agg_conflicts
                ],
                "suggested_casts": suggested_casts,
            },
            message_code=MessageCode.VISUAL_QUERY_VALIDATED
            if is_valid
            else MessageCode.VISUAL_QUERY_INVALID,
        )

    except Exception as exc:
        logger.error("Failed to validate visual query configuration: %s", exc, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to validate configuration: {str(exc)}",
            details={"errors": [f"Failed to validate configuration: {str(exc)}"]},
        )
