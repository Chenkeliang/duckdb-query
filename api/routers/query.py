# pylint: disable=too-many-lines,no-member,too-many-public-methods,too-many-locals,too-many-statements,too-many-arguments,duplicate-code,broad-exception-caught,logging-fstring-interpolation,import-outside-toplevel,broad-exception-raised,redefined-outer-name,reimported,raise-missing-from,too-many-nested-blocks,no-else-return,unused-variable,import-error,line-too-long,bare-except,consider-using-in,unused-argument,f-string-without-interpolation,using-constant-test,unused-import
import json
import logging
import os
import re
import traceback
import uuid
from datetime import datetime, time
from typing import Any, Dict, List, Optional, Tuple

import duckdb
import pandas as pd
from core.common.timezone_utils import get_current_time
from core.common.utils import normalize_dataframe_output
from core.common.validators import validate_table_name
from core.data.file_datasource_manager import (
    build_table_metadata_snapshot,
    file_datasource_manager,
)
from core.data.file_utils import load_file_to_duckdb
from core.database.database_manager import db_manager
from core.database.duckdb_engine import (
    build_single_table_query,
    create_varchar_table_from_dataframe,
    execute_query,
    generate_improved_column_aliases,
    get_db_connection,
)
from core.database.duckdb_pool import interruptible_connection
from core.services.visual_query_generator import (
    _build_where_clause,
    _quote_identifier,
    estimate_query_performance,
    estimate_set_operation_rows,
    generate_set_operation_sql,
    generate_visual_query_sql,
    get_column_statistics,
    validate_query_config,
)
from fastapi import APIRouter, Body, Header, HTTPException
from models.query_models import QueryRequest
from models.visual_query_models import (
    ColumnProfilePayload,
    ColumnTypeReference,
    PreviewRequest,
    ResolvedTypeCast,
    SetOperationConfig,
    SetOperationExportRequest,
    SetOperationRequest,
    SetOperationType,
    TypeConflictModel,
    UnionOperationRequest,
    VisualQueryConfig,
    VisualQueryRequest,
    VisualQueryValidationRequest,
)
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import create_engine
from utils.response_helpers import (
    MessageCode,
    create_error_response,
    create_list_response,
    create_success_response,
)

# Setup logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
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


def remove_auto_added_limit(sql: str) -> str:
    """
    Intelligently remove system-added LIMIT clause, restore user original SQL

    Save function should use user original SQL intent:
    - If user original SQL has LIMIT, keep it completely
    - If user original SQL has no LIMIT, remove system-added LIMIT

    Args:
        sql: SQL passed from frontend (may have been modified by system)

    Returns:
        User original SQL intent
    """
    from core.common.config_manager import config_manager

    # Get system configured max rows
    try:
        max_rows = config_manager.get_app_config().max_query_rows
    except:
        max_rows = 10000  # Default value

    # Remove trailing semicolons and whitespace
    sql_cleaned = sql.rstrip("; \t\n\r")

    # Only remove system-added LIMIT (equal to configured max_rows)
    # Keep all user original LIMIT (regardless of size)
    limit_pattern = rf"\s+LIMIT\s+{max_rows}$"

    if re.search(limit_pattern, sql_cleaned, re.IGNORECASE):
        # Remove system-added LIMIT, restore user original SQL
        sql_cleaned = re.sub(limit_pattern, "", sql_cleaned, flags=re.IGNORECASE)
        logger.info(f"Removed system-added LIMIT {max_rows}, restored user original SQL")
    else:
        logger.info("Keeping user original SQL LIMIT clause")

    return sql_cleaned.strip()


def get_join_type_sql(join_type):
    """Convert frontend join type to correct SQL JOIN syntax"""
    join_type = join_type.lower()
    if join_type == "inner":
        return "INNER JOIN"
    elif join_type == "left":
        return "LEFT JOIN"
    elif join_type == "right":
        return "RIGHT JOIN"
    elif join_type == "outer" or join_type == "full_outer":
        return "FULL OUTER JOIN"  # Correct SQL syntax for outer join
    elif join_type == "cross":
        return "CROSS JOIN"
    else:
        return "INNER JOIN"  # Default to inner join


def ensure_query_has_limit(query: str, default_limit: int = 1000) -> str:
    """Ensure SQL query has LIMIT clause to prevent returning too much data.

    Note: The following types of statements should not have LIMIT added:
    - DESCRIBE / DESC statements
    - SHOW statements
    - EXPLAIN statements
    - PRAGMA statements
    - SET statements
    - CREATE / ALTER / DROP and other DDL statements
    """
    # Remove leading/trailing whitespace and convert to uppercase for matching
    query_stripped = query.strip()
    query_upper = query_stripped.upper()

    # Statement types that should not have LIMIT added (using regex for precise matching)
    # Match statements starting with these keywords (case insensitive)
    no_limit_patterns = [
        r"^DESCRIBE\b",  # DESCRIBE statement
        r"^DESC\b",  # DESC statement (abbreviation of DESCRIBE)
        r"^SHOW\b",  # SHOW statement
        r"^EXPLAIN\b",  # EXPLAIN statement
        r"^PRAGMA\b",  # PRAGMA statement
        r"^SET\b",  # SET statement
        r"^CREATE\b",  # CREATE statement
        r"^ALTER\b",  # ALTER statement
        r"^DROP\b",  # DROP statement
        r"^TRUNCATE\b",  # TRUNCATE statement
        r"^INSERT\b",  # INSERT statement
        r"^UPDATE\b",  # UPDATE statement
        r"^DELETE\b",  # DELETE statement
        r"^GRANT\b",  # GRANT statement
        r"^REVOKE\b",  # REVOKE statement
        r"^CALL\b",  # CALL statement
        r"^EXECUTE\b",  # EXECUTE statement
        r"^USE\b",  # USE statement
        r"^BEGIN\b",  # BEGIN statement
        r"^COMMIT\b",  # COMMIT statement
        r"^ROLLBACK\b",  # ROLLBACK statement
    ]

    # Check if this is a statement that should not have LIMIT added
    for pattern in no_limit_patterns:
        if re.match(pattern, query_upper):
            return query

    # Use regex to check LIMIT clause, more robust
    if not re.search(r"\sLIMIT\s+\d+\s*($|;)", query, re.IGNORECASE):
        if query_stripped.endswith(";"):
            return f"{query_stripped[:-1]} LIMIT {default_limit};"
        else:
            return f"{query_stripped} LIMIT {default_limit}"
    return query


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
            return create_error_response(
                code=MessageCode.VISUAL_QUERY_INVALID.value,
                message="Visual query configuration is invalid",
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
        return create_error_response(
            code=MessageCode.OPERATION_FAILED.value,
            message=f"Failed to generate query: {str(exc)}",
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
            return create_error_response(
                code=MessageCode.VISUAL_QUERY_INVALID.value,
                message="Visual query configuration is invalid",
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

        return create_success_response(
            data={
                "data": data,
                "columns": columns,
                "row_count": total_rows,
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
        raise HTTPException(status_code=499, detail="Query cancelled by client")
    except Exception as exc:
        logger.error("Failed to preview visual query: %s", exc, exc_info=True)
        return create_error_response(
            code=MessageCode.OPERATION_FAILED.value,
            message=f"Failed to preview query: {str(exc)}",
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
            return create_error_response(
                code=MessageCode.VALIDATION_ERROR.value,
                message="Query configuration validation failed",
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
                raise HTTPException(status_code=400, detail="Unsupported aggregation function")
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
        raise HTTPException(status_code=499, detail="Query cancelled by client")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to get column distinct values: %s", exc, exc_info=True)
        return create_error_response(
            code=MessageCode.QUERY_FAILED.value,
            message=str(exc),
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
            raise HTTPException(status_code=404, detail=f"Table {table_name} does not exist")

        stats = get_column_statistics(table_name, column_name, con)
        stats_dict = (
            stats.model_dump() if hasattr(stats, "model_dump") else stats.dict()
        )

        return create_success_response(
            data={"statistics": stats_dict},
            message_code=MessageCode.QUERY_SUCCESS,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to get column statistics: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get column statistics: {str(exc)}")


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
        return create_error_response(
            code=MessageCode.VALIDATION_ERROR.value,
            message="Invalid request format",
            details={"errors": ["Invalid request format"]},
        )
    except Exception as exc:
        logger.error("Validation request parsing exception: %s", exc, exc_info=True)
        return create_error_response(
            code=MessageCode.VALIDATION_ERROR.value,
            message=f"Failed to parse configuration: {str(exc)}",
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
        return create_error_response(
            code=MessageCode.VALIDATION_ERROR.value,
            message=f"Failed to validate configuration: {str(exc)}",
            details={"errors": [f"Failed to validate configuration: {str(exc)}"]},
        )


def safe_alias(table, col):
    col_safe = re.sub(r"[^a-zA-Z0-9_]", "_", col)
    alias = f"{table}_{col_safe}"
    # Ensure alias starts with letter or underscore
    if not re.match(r"^[a-zA-Z_]", alias):
        alias = f"col_{alias}"
    return f'"{alias}"'


def build_multi_table_join_query(query_request, con):
    """
    Build multi-table JOIN query
    Support complex JOIN operations for multiple data sources
    Add association result column to display JOIN match status
    Use improved column name generation logic
    """
    sources = query_request.sources
    joins = query_request.joins

    if not sources:
        raise ValueError("At least one data source is required")

    if len(sources) == 1:
        # Single table query
        source_id = sources[0].id.strip('"')
        return f'SELECT * FROM "{source_id}"'

    # Verify all tables are registered
    available_tables = con.execute("SHOW TABLES").fetchdf()
    available_table_names = available_tables["name"].tolist()

    for source in sources:
        table_id = source.id.strip('"')
        if table_id not in available_table_names:
            raise ValueError(
                f"Table '{table_id}' not registered in DuckDB. Available tables: {', '.join(available_table_names)}"
            )

    # Add columns info for each source (if not already present)
    for source in sources:
        if not hasattr(source, "columns") or source.columns is None:
            try:
                # Get table column information
                cols_df = con.execute(f"PRAGMA table_info('{source.id}')").fetchdf()
                source.columns = cols_df["name"].tolist()
            except Exception as e:
                logger.error(f"Failed to get column information for table {source.id}: {e}")
                source.columns = []

    # Use improved column alias generation logic
    column_aliases = generate_improved_column_aliases(sources)

    # Build SELECT clause - only generate columns for tables involved in JOIN
    select_fields = []

    # Generate columns for involved tables (if there are JOINs)
    if joins:
        involved_tables = set()
        for join in joins:
            involved_tables.add(join.left_source_id.strip('"'))
            involved_tables.add(join.right_source_id.strip('"'))

        for source in sources:
            table_id = source.id.strip('"')
            if table_id in involved_tables and source.columns:
                for col in source.columns:
                    # Support two column formats: string or dict containing 'name' key
                    col_name = (
                        col.get("name", str(col)) if isinstance(col, dict) else str(col)
                    )
                    alias = column_aliases[source.id].get(col_name, col_name)
                    select_fields.append(f'"{table_id}"."{col_name}" AS "{alias}"')
    else:
        # If no JOIN, include all columns from all tables
        for source in sources:
            table_id = source.id.strip('"')
            if source.columns:
                for col in source.columns:
                    # Support two column formats: string or dict containing 'name' key
                    col_name = (
                        col.get("name", str(col)) if isinstance(col, dict) else str(col)
                    )
                    alias = column_aliases[source.id].get(col_name, col_name)
                    select_fields.append(f'"{table_id}"."{col_name}" AS "{alias}"')

    # Add association result columns
    join_result_fields = []
    if joins:
        # For simplicity, we still use letter prefixes to generate JOIN result column names
        table_prefixes = {}
        prefix_index = 0
        for source in sources:
            table_id = source.id.strip('"')
            prefix = chr(65 + prefix_index)  # A=65, B=66, C=67...
            table_prefixes[table_id] = prefix
            prefix_index += 1

        for i, join in enumerate(joins):
            left_table = join.left_source_id.strip('"')
            right_table = join.right_source_id.strip('"')

            # Generate association result column name
            left_prefix = table_prefixes.get(left_table, left_table)
            right_prefix = table_prefixes.get(right_table, right_table)
            join_result_column = f"join_result_{left_prefix}_{right_prefix}"

            # Generate CASE expression based on JOIN type
            join_type = join.join_type.lower()
            if join_type == "inner":
                # INNER JOIN: only matched records, all marked as 'both'
                join_result_expr = f"'both' AS {join_result_column}"
            elif join_type == "left":
                # LEFT JOIN: check if right table key field is NULL
                if join.conditions and len(join.conditions) > 0:
                    right_key_col = (
                        f'"{right_table}"."{join.conditions[0].right_column}"'
                    )
                else:
                    # If no conditions, use first column for check
                    right_cols = (
                        [col for col in sources if col.id.strip('"') == right_table][
                            0
                        ].columns
                        if any(col.id.strip('"') == right_table for col in sources)
                        else []
                    )
                    right_key_col = (
                        f'"{right_table}"."{right_cols[0]}"'
                        if right_cols
                        else f'"{right_table}".rowid'
                    )
                join_result_expr = f"CASE WHEN {right_key_col} IS NULL THEN 'left' ELSE 'both' END AS {join_result_column}"
            elif join_type == "right":
                # RIGHT JOIN: check if left table key field is NULL
                if join.conditions and len(join.conditions) > 0:
                    left_key_col = f'"{left_table}"."{join.conditions[0].left_column}"'
                else:
                    # If no conditions, use first column for check
                    left_cols = (
                        [col for col in sources if col.id.strip('"') == left_table][
                            0
                        ].columns
                        if any(col.id.strip('"') == left_table for col in sources)
                        else []
                    )
                    left_key_col = (
                        f'"{left_table}"."{left_cols[0]}"'
                        if left_cols
                        else f'"{left_table}".rowid'
                    )
                join_result_expr = f"CASE WHEN {left_key_col} IS NULL THEN 'right' ELSE 'both' END AS {join_result_column}"
            elif join_type in ["full", "full_outer", "outer"]:
                # FULL OUTER JOIN: check if both sides key fields are NULL
                if join.conditions and len(join.conditions) > 0:
                    left_key_col = f'"{left_table}"."{join.conditions[0].left_column}"'
                    right_key_col = (
                        f'"{right_table}"."{join.conditions[0].right_column}"'
                    )
                else:
                    # If no conditions, use first column for check
                    left_cols = (
                        [col for col in sources if col.id.strip('"') == left_table][
                            0
                        ].columns
                        if any(col.id.strip('"') == left_table for col in sources)
                        else []
                    )
                    right_cols = (
                        [col for col in sources if col.id.strip('"') == right_table][
                            0
                        ].columns
                        if any(col.id.strip('"') == right_table for col in sources)
                        else []
                    )
                    left_key_col = (
                        f'"{left_table}"."{left_cols[0]}"'
                        if left_cols
                        else f'"{left_table}".rowid'
                    )
                    right_key_col = (
                        f'"{right_table}"."{right_cols[0]}"'
                        if right_cols
                        else f'"{right_table}".rowid'
                    )
                join_result_expr = f"""CASE
                    WHEN {left_key_col} IS NULL THEN 'right'
                    WHEN {right_key_col} IS NULL THEN 'left'
                    ELSE 'both'
                END AS {join_result_column}"""
            else:
                # Other types of JOIN (like CROSS JOIN), default mark as 'both'
                join_result_expr = f"'both' AS {join_result_column}"

            join_result_fields.append(join_result_expr)

    # Merge all fields
    all_fields = select_fields + join_result_fields
    select_clause = ", ".join(all_fields) if all_fields else "*"

    # Build FROM and JOIN clauses
    if not joins:
        # No JOIN conditions, use CROSS JOIN
        first_source_id = sources[0].id.strip('"')
        from_clause = f'"{first_source_id}"'
        for source in sources[1:]:
            source_id = source.id.strip('"')
            from_clause += f' CROSS JOIN "{source_id}"'
    else:
        # Build JOIN chain
        from_clause = build_join_chain(
            sources, joins, {source.id.strip('"'): source.columns for source in sources}
        )

    query = f"SELECT {select_clause} FROM {from_clause}"

    # Add LIMIT
    if query_request.limit:
        query += f" LIMIT {query_request.limit}"

    return query


def build_join_chain(sources, joins, table_columns):
    """
    Build JOIN chain, support multi-table connections and multi-field associations
    """
    if not joins:
        first_source_id = sources[0].id.strip('"')
        return f'"{first_source_id}"'

    # Create table mapping
    source_map = {source.id.strip('"'): source for source in sources}

    # Track tables already joined in query
    joined_tables = set()

    # Start building from first JOIN
    first_join = joins[0]
    left_table = first_join.left_source_id.strip('"')
    right_table = first_join.right_source_id.strip('"')

    # Start building query
    from_clause = f'"{left_table}"'
    joined_tables.add(left_table)

    # Collect JOIN conditions for all same table pairs
    join_conditions_map = {}

    for join in joins:
        left_id = join.left_source_id.strip('"')
        right_id = join.right_source_id.strip('"')

        # Create JOIN key for merging JOIN conditions of same table pairs
        join_key = tuple(sorted([left_id, right_id]))

        if join_key not in join_conditions_map:
            join_conditions_map[join_key] = {
                "left_table": left_id,
                "right_table": right_id,
                "join_type": join.join_type,
                "conditions": [],
            }

        # Add conditions to corresponding JOIN
        if join.conditions:
            join_conditions_map[join_key]["conditions"].extend(join.conditions)

    # Process all JOINs (now each table pair is processed only once)
    for join_key, join_info in join_conditions_map.items():
        left_id = join_info["left_table"]
        right_id = join_info["right_table"]
        join_type = join_info["join_type"]
        all_conditions = join_info["conditions"]

        # Determine which table needs to be JOINed in
        if left_id in joined_tables and right_id not in joined_tables:
            # Right table needs to be JOINed in
            table_to_join = right_id
        elif right_id in joined_tables and left_id not in joined_tables:
            # Left table needs to be JOINed in
            table_to_join = left_id
        elif left_id not in joined_tables and right_id not in joined_tables:
            # Both tables not in query, JOIN right table
            table_to_join = right_id
        else:
            # Both tables already in query, skip this JOIN
            continue

        join_type_sql = get_join_type_sql(join_type)
        from_clause += f' {join_type_sql} "{table_to_join}"'

        # Add all JOIN conditions (including multi-field associations)
        if join_type.lower() != "cross" and all_conditions:
            conditions = []
            for condition in all_conditions:
                left_table_id = left_id
                right_table_id = right_id

                # Intelligent data type conversion and cleaning
                base_left_col = f'"{left_table_id}"."{condition.left_column}"'
                base_right_col = f'"{right_table_id}"."{condition.right_column}"'

                left_col = base_left_col
                right_col = base_right_col

                # Check if data cleaning is needed (for JSON or complex strings)
                # If left column contains complex data, try to extract numeric part
                if condition.left_column == "uid" and left_table_id in ["0711", "0702"]:
                    # Use regex to extract numeric part
                    left_col = (
                        f"CAST(REGEXP_EXTRACT({left_col}, '^([0-9]+)', 1) AS VARCHAR)"
                    )

                # If right column is numeric type, ensure type matching
                if condition.right_column in [
                    "iget_uid",
                    "buyer_id",
                ] and right_table_id.startswith("query_result"):
                    # Ensure right column is also string type for comparison
                    right_col = f"CAST({right_col} AS VARCHAR)"

                if condition.left_cast:
                    left_col = f"TRY_CAST({left_col} AS {condition.left_cast})"
                if condition.right_cast:
                    right_col = f"TRY_CAST({right_col} AS {condition.right_cast})"

                conditions.append(f"{left_col} {condition.operator} {right_col}")

            if conditions:
                from_clause += f" ON {' AND '.join(conditions)}"

        joined_tables.add(table_to_join)

    return from_clause


@router.post("/api/query", tags=["Query"])
async def perform_query(
    query_request: QueryRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """Performs a join query on the specified data sources."""
    query_id = f"sync:{x_request_id}" if x_request_id else None
    if query_id:
        logger.info(f"Query with request ID: {x_request_id}")

    # Always get valid connection
    # TODO: Use interruptible_connection to wrap query execution for cancellation support
    con = get_db_connection()

    try:
        # 确保文件存在并可访问
        for source in query_request.sources:
            if source.type == "file":
                original_path = source.params["path"]

                # 标准化文件路径，支持多种路径格式
                possible_paths = [
                    original_path,  # 原始路径
                    os.path.join(
                        "api", "temp_files", os.path.basename(original_path)
                    ),  # api/temp_files/filename
                    os.path.join(
                        os.path.dirname(os.path.dirname(__file__)),
                        "temp_files",
                        os.path.basename(original_path),
                    ),  # 绝对路径
                ]

                # 如果是相对路径，尝试不同的基础路径
                if original_path.startswith("temp_files/"):
                    filename = original_path.replace("temp_files/", "")
                    possible_paths.extend(
                        [
                            os.path.join("api", "temp_files", filename),
                            os.path.join(
                                os.path.dirname(os.path.dirname(__file__)),
                                "temp_files",
                                filename,
                            ),
                        ]
                    )

                # 找到实际存在的文件路径
                file_path = None
                for path in possible_paths:
                    if os.path.exists(path):
                        file_path = path
                        break

                if not file_path:
                    logger.error(f"File does not exist, attempted paths: {possible_paths}")
                    raise ValueError(f"File does not exist: {original_path}")

                # 更新source中的路径为实际找到的路径
                source.params["path"] = file_path

                logger.info(f"Registering datasource: {source.id}, path: {file_path}")

                # 根据文件扩展名选择合适的读取方法
                file_extension = file_path.lower().split(".")[-1]

                if file_extension in ["xlsx", "xls"]:
                    # Excel文件处理
                    try:
                        con.execute("INSTALL excel;")
                        con.execute("LOAD excel;")
                        duckdb_query = f"SELECT * FROM read_xlsx('{file_path}') LIMIT 1"
                        con.execute(duckdb_query).fetchdf()
                        # 先创建临时表
                        temp_table = f"temp_{source.id}_{int(time.time())}"
                        con.execute(
                            f"CREATE TABLE \"{temp_table}\" AS SELECT * FROM read_xlsx('{file_path}')"
                        )

                        # 获取列信息并转换为VARCHAR
                        columns_info = con.execute(
                            f'DESCRIBE "{temp_table}"'
                        ).fetchall()
                        cast_columns = []
                        for col_name, col_type, *_ in columns_info:
                            cast_columns.append(
                                f'CAST("{col_name}" AS VARCHAR) AS "{col_name}"'
                            )

                        cast_sql = ", ".join(cast_columns)

                        # 创建最终的VARCHAR表
                        con.execute(f'DROP TABLE IF EXISTS "{source.id}"')
                        con.execute(
                            f'CREATE TABLE "{source.id}" AS SELECT {cast_sql} FROM "{temp_table}"'
                        )

                        # 删除临时表
                        con.execute(f'DROP TABLE "{temp_table}"')
                        logger.info(f"Registered Excel table using DuckDB read_xlsx: {source.id}")
                    except Exception as duckdb_exc:
                        logger.warning(
                            f"DuckDB read_xlsx 读取失败，降级为pandas: {duckdb_exc}"
                        )
                        df = pd.read_excel(file_path, dtype=str)
                        con.register(source.id, df)
                        logger.info(
                            f"已用pandas.read_excel注册表: {source.id}, shape: {df.shape}"
                        )

                elif file_extension in {"csv", "json", "jsonl", "parquet", "pq"}:
                    try:
                        normalized_ext = (
                            "parquet" if file_extension == "pq" else file_extension
                        )
                        load_file_to_duckdb(
                            con,
                            source.id,
                            file_path,
                            normalized_ext,
                        )
                        logger.info(
                            "已通过DuckDB原生加载文件 %s -> Table %s",
                            file_path,
                            source.id,
                        )
                    except Exception as load_error:
                        logger.error(
                            "文件 %s 加载失败: %s", file_path, load_error, exc_info=True
                        )
                        raise
                else:
                    logger.warning(f"Unknown file type: {file_extension}, trying pandas read")
                    try:
                        df = pd.read_csv(file_path, dtype=str)
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"已用pandas.read_csv创建持久化表: {source.id}, shape: {df.shape}"
                        )
                    except Exception:
                        df = pd.read_excel(file_path, dtype=str)
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"已用pandas.read_excel注册表: {source.id}, shape: {df.shape}"
                        )

            elif source.type in ["mysql", "postgresql", "sqlite"]:
                # 处理数据库数据源 - 支持三种模式：connectionId、数据源名称、直接连接参数
                connection_id = source.params.get("connectionId")
                datasource_name = source.params.get("datasource_name")

                if connection_id:
                    # 模式1：使用预先保存的数据库连接
                    logger.info(
                        f"处理数据库数据源: {source.id}, 连接ID: {connection_id}"
                    )

                    try:
                        db_connection = db_manager.get_connection(connection_id)
                        if not db_connection:
                            raise ValueError(f"Database connection not found: {connection_id}")

                        if hasattr(db_connection.params, "query"):
                            query = db_connection.params.get(
                                "query", "SELECT * FROM dy_order LIMIT 1000"
                            )
                        else:
                            query = "SELECT * FROM dy_order LIMIT 1000"

                        df = db_manager.execute_query(connection_id, query)
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"已创建持久化数据库表: {source.id}, shape: {df.shape}"
                        )

                    except Exception as db_error:
                        logger.error(f"Failed to process database connection: {db_error}")
                        raise ValueError(
                            f"数据库连接处理失败: {source.id}, 错误: {str(db_error)}"
                        )

                elif datasource_name:
                    # 模式2：使用数据源名称（安全模式）- 从配置文件读取连接信息
                    logger.info(
                        f"处理安全数据源: {source.id}, 数据源名称: {datasource_name}"
                    )

                    try:
                        # 读取MySQL配置文件
                        mysql_config_file = os.path.join(
                            os.path.dirname(os.path.dirname(__file__)),
                            "config/mysql-configs.json",
                        )
                        if not os.path.exists(mysql_config_file):
                            raise ValueError("MySQL config file does not exist")

                        with open(mysql_config_file, "r", encoding="utf-8") as f:
                            configs = json.load(f)

                        # 查找对应的配置
                        mysql_config = None
                        for config in configs:
                            if config["id"] == datasource_name:
                                mysql_config = config["params"]
                                break

                        if not mysql_config:
                            raise ValueError(f"Datasource configuration not found: {datasource_name}")

                        # 获取查询语句
                        query = source.params.get(
                            "query",
                            mysql_config.get(
                                "query", "SELECT * FROM dy_order LIMIT 1000"
                            ),
                        )

                        # 创建连接字符串
                        connection_str = f"mysql+pymysql://{mysql_config['user']}:{mysql_config['password']}@{mysql_config['host']}:{mysql_config['port']}/{mysql_config['database']}?charset=utf8mb4"

                        # 执行查询
                        engine = create_engine(connection_str)
                        df = pd.read_sql(query, engine)

                        # 注册到DuckDB
                        con.register(source.id, df)
                        logger.info(
                            f"已注册安全数据源表: {source.id}, shape: {df.shape}"
                        )

                    except Exception as secure_db_error:
                        logger.error(f"Failed to process secure datasource: {secure_db_error}")
                        raise ValueError(
                            f"安全数据源处理失败: {source.id}, 错误: {str(secure_db_error)}"
                        )
                else:
                    # 模式3：直接使用连接参数（兼容旧版本，但不推荐）
                    logger.warning(f"Using direct connection parameter mode (not recommended): {source.id}")

                    try:
                        # 获取连接参数
                        host = source.params.get("host", "localhost")
                        port = source.params.get(
                            "port", 3306 if source.type == "mysql" else 5432
                        )
                        user = source.params.get("user", "")
                        password = source.params.get("password", "")
                        database = source.params.get("database", "")
                        query = source.params.get("query", "SELECT 1 as test")

                        if not all([host, user, database, query]):
                            raise ValueError(f"Incomplete database connection parameters: {source.id}")

                        # 创建连接字符串
                        if source.type == "mysql":
                            connection_str = f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"
                        elif source.type == "postgresql":
                            connection_str = f"postgresql://{user}:{password}@{host}:{port}/{database}"
                        elif source.type == "sqlite":
                            connection_str = f"sqlite:///{database}"
                        else:
                            raise ValueError(f"Unsupported database type: {source.type}")

                        # 创建引擎并执行查询
                        engine = create_engine(connection_str)
                        df = pd.read_sql(query, engine)

                        # 创建持久化表到DuckDB
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"已创建持久化直接连接数据库表: {source.id}, shape: {df.shape}"
                        )

                    except Exception as direct_db_error:
                        logger.error(f"Failed to connect to database directly: {direct_db_error}")
                        raise ValueError(
                            f"直接Database connection failed: {source.id}, 错误: {str(direct_db_error)}"
                        )

        # 获取当前可用的表
        available_tables = con.execute("SHOW TABLES").fetchdf()
        available_table_names = (
            available_tables["name"].tolist() if not available_tables.empty else []
        )
        logger.info(f"Current tables in DuckDB: {available_tables.to_string()}")

        # 验证是否有数据源
        if not query_request.sources:
            raise HTTPException(
                status_code=422, detail="Query request must contain at least one data source"
            )

        # 构建查询 - 确保表名使用双引号括起来
        if len(query_request.joins) > 0:
            # 多表JOIN查询 - 使用改进的多表JOIN支持
            query = build_multi_table_join_query(query_request, con)
        else:
            # Single table query - 使用build_single_table_query来处理表名
            query = build_single_table_query(query_request)

            # 验证表是否存在（从查询中提取实际表名）

            table_match = re.search(r'FROM "([^"]+)"', query)
            if table_match:
                actual_table_name = table_match.group(1)
                if actual_table_name not in available_table_names:
                    error_msg = f"无法执行查询，Table '{actual_table_name}' does not exist。可用的表: {', '.join(available_table_names)}"
                    logger.error(error_msg)
                    raise ValueError(error_msg)

        # 根据is_preview标志决定是否添加LIMIT
        if query_request.is_preview:
            from core.common.config_manager import config_manager

            limit = config_manager.get_app_config().max_query_rows
            query = ensure_query_has_limit(query, limit)
            logger.info(f"Preview mode, applied LIMIT {limit}")

        logger.info(f"Executing query: {query}")

        # 执行查询
        result_df = execute_query(query, con)
        logger.info(f"Query completed, result shape: {result_df.shape}")

        data_records = normalize_dataframe_output(result_df)
        columns_list = [str(col) for col in result_df.columns.tolist()]

        return create_success_response(
            data={
                "data": data_records,
                "columns": columns_list,
                "index": result_df.index.tolist(),
                "sql": query,
                "row_count": len(data_records),
            },
            message_code=MessageCode.QUERY_SUCCESS,
        )
    except HTTPException:
        # 重新抛出HTTPException，保持原始状态码
        raise
    except Exception as e:
        error_message = str(e)
        logger.error(f"Query failed: {error_message}")
        logger.error(f"Stack trace: {traceback.format_exc()}")

        # 使用统一的错误代码系统
        from core.common.error_codes import (
            analyze_error_type,
            get_http_status_code,
        )

        original_error = str(e)
        error_code = analyze_error_type(original_error)
        status_code = get_http_status_code(error_code)

        # 创建标准化的错误响应
        error_response = create_error_response(
            code=error_code,
            message=original_error,
            details={"sql": getattr(query_request, "sql", None)},
        )

        # 返回详细的错误响应
        raise HTTPException(status_code=status_code, detail=error_response)


@router.post("/api/execute_sql", tags=["Query"])
async def execute_sql(request: dict = Body(...)):
    """直接执行SQL查询语句，主要用于调试和验证数据源"""
    con = get_db_connection()
    sql_query = request.get("sql", "")
    datasource = request.get("datasource", {})
    is_preview = request.get("is_preview", True)  # 默认为预览模式

    try:
        # 如果是预览模式，则强制添加LIMIT
        if is_preview:
            from core.common.config_manager import config_manager

            limit = config_manager.get_app_config().max_query_rows
            sql_query = ensure_query_has_limit(sql_query, limit)
            logger.info(f"Preview mode, applied LIMIT {limit} to SQL: {sql_query}")

        logger.info(f"=== EXECUTE_SQL function started ===")
        logger.info(f"request type: {type(request)}, content: {request}")
        # 兼容 dict、Pydantic/BaseModel、FormData
        if isinstance(request, dict):
            sql_query = request.get("sql", "")
            datasource = request.get("datasource", {})
        else:
            sql_query = getattr(request, "sql", "")
            datasource = getattr(request, "datasource", {})
        logger.info(f"sql_query: {sql_query}, datasource: {datasource}")
        logger.info(
            f"datasource type: {getattr(datasource, 'type', None) if not isinstance(datasource, dict) else datasource.get('type')}"
        )
        logger.info(
            f"datasource id: {getattr(datasource, 'id', None) if not isinstance(datasource, dict) else datasource.get('id')}"
        )
        logger.info(
            f"datasource params: {getattr(datasource, 'params', None) if not isinstance(datasource, dict) else datasource.get('params')}"
        )

        # 检查数据源类型判断
        datasource_type = (
            datasource.get("type") if isinstance(datasource, dict) else None
        )
        logger.info(f"Checking datasource type: {datasource_type}")
        logger.info(f"Is dictionary: {isinstance(datasource, dict)}")
        logger.info(
            f"类型检查结果: {datasource_type in ['mysql', 'postgresql', 'sqlite', 'duckdb']}"
        )
        logger.info(
            f"完整条件判断: {isinstance(datasource, dict) and datasource.get('type') in ['mysql', 'postgresql', 'sqlite', 'duckdb']}"
        )
        # 支持 file 类型数据源
        if isinstance(datasource, dict) and datasource.get("type") == "file":
            # 支持多种参数格式
            if "params" in datasource and "path" in datasource["params"]:
                file_path = datasource["params"]["path"]
            elif "path" in datasource:
                file_path = datasource["path"]
            else:
                # 如果没有指定路径，尝试从temp_files目录查找
                filename = datasource.get("filename") or datasource.get("id", "")
                if filename:
                    temp_dir = os.path.join(
                        os.path.dirname(os.path.dirname(__file__)), "temp_files"
                    )
                    file_path = os.path.join(temp_dir, filename)
                else:
                    raise ValueError("Missing file path parameter")

            table_id = datasource.get("id", "temp_table")

            # 检查文件是否存在
            if not os.path.exists(file_path):
                raise ValueError(f"File does not exist: {file_path}")

            normalized_ext = file_path.split(".")[-1].lower()
            if normalized_ext == "pq":
                normalized_ext = "parquet"
            load_file_to_duckdb(
                con,
                table_id,
                file_path,
                normalized_ext,
            )

        # 如果是数据库类型的数据源，需要先执行SQL获取数据，然后可选择保存到DuckDB
        elif isinstance(datasource, dict) and datasource.get("type") in [
            "mysql",
            "postgresql",
            "sqlite",
            "duckdb",
        ]:
            # 数据库类型的数据源需要用户提供自定义SQL查询
            if not sql_query.strip():
                raise HTTPException(
                    status_code=400,
                    detail="Database type datasource requires custom SQL query statement",
                )

            # 使用数据库管理器执行查询

            datasource_id = datasource.get("id")
            if not datasource_id:
                raise HTTPException(status_code=400, detail="Missing datasource ID")

            # 确保数据库连接存在，如果does not exist则创建
            try:
                existing_conn = db_manager.get_connection(datasource_id)
                if not existing_conn:
                    logger.info(f"Connection {datasource_id} does not exist, attempting to create...")
                    # 读取配置文件并创建连接
                    from models.query_models import DatabaseConnection, DataSourceType

                    config_path = os.path.join(
                        os.path.dirname(os.path.dirname(__file__)),
                        "config/mysql-configs.json",
                    )
                    with open(config_path, "r", encoding="utf-8") as f:
                        configs = json.load(f)

                    config = None
                    for cfg in configs:
                        if cfg["id"] == datasource_id:
                            config = cfg
                            break

                    if not config:
                        raise HTTPException(
                            status_code=404, detail=f"Datasource configuration not found: {datasource_id}"
                        )

                    # 创建连接
                    db_connection = DatabaseConnection(
                        id=config["id"],
                        name=config.get("name", config["id"]),
                        type=DataSourceType.MYSQL,
                        params=config["params"],
                        created_at=get_current_time(),
                    )

                    success = db_manager.add_connection(db_connection)
                    if not success:
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to create database connection: {datasource_id}",
                        )

                    logger.info(f"Successfully created database connection: {datasource_id}")

            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Failed to create database connection: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")

            # 在原始数据库上执行SQL查询
            try:
                logger.info(
                    f"开始执rows据库查询: datasource_id={datasource_id}, sql={sql_query}"
                )
                result_df = db_manager.execute_query(datasource_id, sql_query)
                logger.info(f"Database query execution completed, result shape: {result_df.shape}")

                # 处理编码问题：安全地转换为字符串
                for col in result_df.columns:
                    if result_df[col].dtype == "object":
                        # 安全地处理可能的编码问题
                        def safe_str_convert(x):
                            if x is None or pd.isna(x):
                                return None
                            try:
                                if isinstance(x, bytes):
                                    # 尝试多种编码方式
                                    for encoding in [
                                        "utf-8",
                                        "gbk",
                                        "gb2312",
                                        "latin1",
                                    ]:
                                        try:
                                            return x.decode(encoding)
                                        except UnicodeDecodeError:
                                            continue
                                    # 如果所有编码都失败，使用错误处理
                                    return x.decode("utf-8", errors="replace")
                                else:
                                    return str(x)
                            except Exception:
                                return str(x) if x is not None else None

                        result_df[col] = result_df[col].apply(safe_str_convert)

                data_records = normalize_dataframe_output(result_df)
                columns_list = [str(col) for col in result_df.columns.tolist()]

                logger.info(f"Preparing to return database query result, rows: {len(result_df)}")
                return create_success_response(
                    data={
                        "data": data_records,
                        "columns": columns_list,
                        "rowCount": len(result_df),
                        "source_type": "database",
                        "source_id": datasource_id,
                        "sql_query": sql_query,
                        "can_save_to_duckdb": True,
                    },
                    message_code=MessageCode.QUERY_SUCCESS,
                )

            except Exception as db_error:
                logger.error(f"Database query failed: {str(db_error)}")
                raise HTTPException(
                    status_code=500, detail=f"Database query failed: {str(db_error)}"
                )

        # 如果不是数据库类型，则在DuckDB中执行查询
        else:
            # 执行SQL查询
            result_df = execute_query(sql_query, con)
            logger.info(f"SQL query execution completed, result shape: {result_df.shape}")

            data_records = normalize_dataframe_output(result_df)

            # 确保所有列名是字符串类型
            columns_list = [str(col) for col in result_df.columns.tolist()]

            return create_success_response(
                data={
                    "data": data_records,
                    "columns": columns_list,
                    "rowCount": len(result_df),
                },
                message_code=MessageCode.QUERY_SUCCESS,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"SQL execution failed: {str(e)}")
        logger.error(f"Stack trace: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"SQL execution failed: {str(e)}")


@router.post("/api/save_query_to_duckdb", tags=["Query"])
async def save_query_to_duckdb(request: dict = Body(...)):
    """将数据库查询结果保存到DuckDB作为新的数据源"""
    try:
        logger.info(f"Save query to DuckDB request: {request}")

        # 获取请求参数，支持多种格式，确保安全处理None值
        datasource = (
            request.get("datasource") or request.get("originalDatasource") or {}
        )
        sql_query = request.get("sql") or request.get("sqlQuery", "")
        table_alias = request.get("table_alias") or request.get("tableAlias", "")
        query_data = request.get("query_data")  # 直接传递的查询结果数据

        # 确保datasource是字典类型
        if not isinstance(datasource, dict):
            datasource = {}

        # 参数验证
        if not table_alias or not table_alias.strip():
            raise HTTPException(status_code=400, detail="Please provide DuckDB table alias")

        if not sql_query or not sql_query.strip():
            raise HTTPException(status_code=400, detail="Please provide SQL query statement")

        # 验证数据源，提供默认值防止None错误
        datasource_id = datasource.get("id", "duckdb_internal")
        datasource_type = datasource.get("type", "duckdb")

        logger.info(
            f"解析参数: datasource_id={datasource_id}, datasource_type={datasource_type}, table_alias={table_alias}"
        )

        logger.info(
            f"开始保存查询结果: datasource_id={datasource_id}, datasource_type={datasource_type}, table_alias={table_alias}"
        )

        # 根据数据源类型处理
        result_df = None

        # 对于保存功能，始终重新执行SQL以确保数据完整性
        # 智能移除系统自动添加的LIMIT，保留用户原始的所有SQL逻辑
        logger.info("Re-executing SQL to get complete data, intelligently handling LIMIT")

        # 判断数据源类型
        if datasource_type in ["mysql"] and datasource_id != "duckdb_internal":
            # 处理MySQL等外部数据库
            try:
                logger.info(f"Executing external database query: {datasource_id}")

                # 确保数据库连接存在
                existing_conn = db_manager.get_connection(datasource_id)
                if not existing_conn:
                    logger.info(f"Connection {datasource_id} does not exist, attempting to create from config...")
                    # 尝试从配置文件创建连接
                    from models.query_models import (
                        DatabaseConnection,
                        DataSourceType,
                    )

                    try:
                        raise Exception(f"Datasource configuration not found: {datasource_id}")
                    except Exception as config_error:
                        logger.error(f"Failed to create database connection: {str(config_error)}")
                        raise Exception(f"Database connection failed: {str(config_error)}")

                # 智能清理SQL，移除系统自动添加的LIMIT，保留所有用户条件
                clean_sql = remove_auto_added_limit(sql_query)
                if clean_sql != sql_query.strip():
                    logger.info(
                        f"MySQL查询移除了系统自动添加的LIMIT: {sql_query} -> {clean_sql}"
                    )

                # 执行查询获取完整数据（保留所有WHERE条件和用户逻辑）
                result_df = db_manager.execute_query(datasource_id, clean_sql)
                logger.info(f"External database query execution completed, result shape: {result_df.shape}")

            except Exception as db_error:
                logger.error(f"External database query failed: {str(db_error)}")
                raise HTTPException(
                    status_code=500, detail=f"External database query failed: {str(db_error)}"
                )
        else:
            # 处理DuckDB内部查询
            try:
                con = get_db_connection()

                # 智能清理SQL：移除系统自动添加的LIMIT，保留所有用户条件和逻辑
                clean_sql = sql_query.strip()
                logger.info(f"Original SQL: {clean_sql}")

                # 智能检测并移除系统自动添加的LIMIT（保留用户原始LIMIT和所有WHERE/JOIN/ORDER BY等条件）
                clean_sql = remove_auto_added_limit(clean_sql)

                if clean_sql != sql_query.strip():
                    logger.info(
                        f"DuckDB查询移除了系统自动添加的LIMIT，保留所有用户条件: {clean_sql}"
                    )
                else:
                    logger.info(f"SQL needs no cleaning or contains user original LIMIT: {clean_sql}")

                logger.info(f"Executing complete query in DuckDB: {clean_sql}")
                result_df = execute_query(clean_sql, con)
                logger.info(f"DuckDB query execution completed, result shape: {result_df.shape}")

            except Exception as duckdb_error:
                logger.error(f"DuckDB query failed: {str(duckdb_error)}")
                raise HTTPException(
                    status_code=500, detail=f"DuckDB query failed: {str(duckdb_error)}"
                )

        # 验证查询结果
        if result_df is None or result_df.empty:
            raise HTTPException(status_code=400, detail="Query result is empty, cannot save")

        # 获取DuckDB连接并创建持久化表
        try:
            con = get_db_connection()

            # 检查表名是否already exists
            existing_tables = con.execute("SHOW TABLES").fetchdf()
            existing_table_names = (
                existing_tables["name"].tolist() if not existing_tables.empty else []
            )

            if table_alias in existing_table_names:
                logger.warning(f"Table {table_alias} already exists, will be overwritten")
                con.execute(f'DROP TABLE IF EXISTS "{table_alias}"')

            # 使用改进的函数创建表
            success = create_varchar_table_from_dataframe(table_alias, result_df, con)

            if not success:
                raise Exception("Failed to persist query result to DuckDB")

            logger.info(f"Data has been persisted to DuckDB table: {table_alias}")

            # 验证表是否成功创建
            try:
                verification_result = con.execute(
                    f'SELECT COUNT(*) as count FROM "{table_alias}"'
                ).fetchdf()
                actual_count = verification_result.iloc[0]["count"]
                logger.info(f"Table {table_alias} verification successful, rows: {actual_count}")
            except Exception as verify_error:
                logger.warning(f"Table verification failed: {str(verify_error)}")

            # 使用统一的时区配置
            try:
                from core.common.timezone_utils import get_current_time_iso
                from core.data.file_datasource_manager import file_datasource_manager

                file_info = {
                    "source_id": table_alias,
                    "filename": f"{table_alias}_query_result",
                    "file_path": f"query_result_{table_alias}",  # 虚拟路径，实际数据在DuckDB中
                    "file_type": "duckdb_table",
                    "created_at": get_current_time_iso(),  # 使用统一的时区配置
                    "columns": result_df.columns.tolist(),
                    "row_count": len(result_df),
                    "column_count": len(result_df.columns),
                    "source_sql": sql_query,
                    "source_datasource": datasource_id,
                }

                # 保存到文件数据源管理器
                file_datasource_manager.save_file_datasource(file_info)
                logger.info(f"Created file datasource configuration for query result table: {table_alias}")

            except Exception as config_error:
                logger.warning(f"Failed to create file datasource configuration: {str(config_error)}")

            return create_success_response(
                data={
                    "table_alias": table_alias,
                    "row_count": len(result_df),
                    "columns": result_df.columns.tolist(),
                    "source_sql": sql_query,
                    "source_datasource": datasource_id,
                    "created_at": get_current_time_iso(),
                    "datasource": {
                        "id": table_alias,
                        "name": table_alias,
                        "type": "duckdb",
                        "table_name": table_alias,
                        "row_count": len(result_df),
                        "column_count": len(result_df.columns),
                        "created_at": get_current_time_iso(),
                        "updated_at": get_current_time_iso(),
                    },
                },
                message_code=MessageCode.TABLE_CREATED,
                message=f"Query result has been saved as DuckDB table: {table_alias}",
            )

        except Exception as duckdb_error:
            logger.error(f"DuckDB operation failed: {str(duckdb_error)}")
            raise HTTPException(
                status_code=500, detail=f"DuckDB operation failed: {str(duckdb_error)}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save to DuckDB: {str(e)}")
        logger.error(f"Stack trace: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to save to DuckDB: {str(e)}")


@router.get("/api/duckdb_tables", tags=["Query"])
async def list_duckdb_tables():
    """列出DuckDB中的所有可用表"""
    try:
        con = get_db_connection()
        tables_df = con.execute("SHOW TABLES").fetchdf()

        # 获取文件数据源管理器实例
        from core.data.file_datasource_manager import file_datasource_manager

        file_datasources = file_datasource_manager.list_file_datasources()
        # 创建source_id到创建时间的映射
        datasource_timestamps = {}
        for datasource in file_datasources:
            source_id = datasource.get("source_id")
            created_at = datasource.get("created_at")
            if source_id and created_at:
                datasource_timestamps[source_id] = created_at

        # 获取所有数据库连接的ID，用于标识数据库连接的表
        db_connection_ids = set()
        try:
            db_connections = db_manager.list_connections()
            for db_conn in db_connections:
                db_connection_ids.add(db_conn.id)
        except Exception as e:
            logger.warning(f"Failed to get database connection list: {str(e)}")

        tables_info = []
        for _, row in tables_df.iterrows():
            table_name = row["name"]
            if table_name.lower().startswith("system_"):
                continue
            # 获取表的基本信息
            try:
                # 对表名进行引号包围以处理特殊字符
                quoted_table_name = f'"{table_name}"'
                count_result = con.execute(
                    f"SELECT COUNT(*) as count FROM {quoted_table_name}"
                ).fetchdf()
                row_count = count_result.iloc[0]["count"]

                columns_result = con.execute(f"DESCRIBE {quoted_table_name}").fetchdf()
                columns = columns_result["column_name"].tolist()

                # 判断表的来源类型
                # 1. 如果表名在 file_datasources 中，使用文件数据源的创建时间
                # 2. 如果表名匹配数据库连接ID，标记为 database 类型
                # 3. 否则默认为 file 类型
                created_at = datasource_timestamps.get(table_name)
                source_type = "file"  # 默认为文件类型

                # 检查是否是数据库连接的表（表名通常包含连接ID）
                for db_conn_id in db_connection_ids:
                    if (
                        table_name.startswith(f"{db_conn_id}_")
                        or table_name == db_conn_id
                    ):
                        source_type = "database"
                        break

                tables_info.append(
                    {
                        "table_name": table_name,
                        "row_count": int(row_count),
                        "columns": columns,
                        "column_count": len(columns),
                        "created_at": created_at,
                        "source_type": source_type,
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to get table {table_name} information: {str(e)}")
                tables_info.append(
                    {
                        "table_name": table_name,
                        "row_count": 0,
                        "columns": [],
                        "column_count": 0,
                        "error": str(e),
                    }
                )

        # 按创建时间倒序排序，没有创建时间的表排在最后
        from dateutil import parser as date_parser

        def get_sort_key(table):
            created_at = table.get("created_at")
            table_name = table.get("table_name", "")

            if not created_at:
                # 没有创建时间的表排在最后，按表名排序
                return (0, table_name)

            # 如果是字符串，转换为 datetime
            if isinstance(created_at, str):
                try:
                    # 使用 dateutil.parser 更健壮地解析日期
                    parsed = date_parser.parse(created_at)
                    # 移除时区信息以便比较
                    ts = parsed.replace(tzinfo=None).timestamp()
                    return (1, ts)
                except Exception:
                    return (0, table_name)

            # 如果已经是 datetime
            if hasattr(created_at, "timestamp"):
                ts = (
                    created_at.replace(tzinfo=None).timestamp()
                    if created_at.tzinfo
                    else created_at.timestamp()
                )
                return (1, ts)

            return (0, table_name)

        # 先按是否有创建时间分组（有的在前），再按时间戳倒序
        tables_info.sort(key=get_sort_key, reverse=True)

        return create_list_response(
            items=tables_info,
            total=len(tables_info),
            message_code=MessageCode.TABLES_RETRIEVED,
        )

    except Exception as e:
        logger.error(f"Failed to get DuckDB table list: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get table list: {str(e)}")


@router.delete("/api/duckdb_tables/{table_name}", tags=["Query"])
async def delete_duckdb_table(table_name: str):
    """删除DuckDB中的指定表，同时删除对应的源文件"""
    # 系统表保护：禁止删除 system_ 前缀或保护 Schema 中的表
    validate_table_name(table_name)

    try:
        con = get_db_connection()

        # 检查表是否存在
        tables_df = con.execute("SHOW TABLES").fetchdf()
        existing_tables = tables_df["name"].tolist() if not tables_df.empty else []

        if table_name not in existing_tables:
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' does not exist")

        # 尝试查找并删除对应的源文件
        deleted_files = []
        try:
            # 查找可能的文件路径
            temp_dir = os.path.join(
                os.path.dirname(os.path.dirname(__file__)), "temp_files"
            )

            # 可能的文件名模式
            possible_filenames = [
                f"{table_name}.csv",
                f"{table_name}.xlsx",
                f"{table_name}.xls",
                f"{table_name}.json",
                f"{table_name}.parquet",
                f"{table_name}.pq",
            ]

            # 查找并删除匹配的文件
            if os.path.exists(temp_dir):
                for filename in os.listdir(temp_dir):
                    # 检查文件名是否匹配表名（去掉扩展名）
                    file_base_name = os.path.splitext(filename)[0]
                    if file_base_name == table_name or filename in possible_filenames:
                        file_path = os.path.join(temp_dir, filename)
                        try:
                            os.remove(file_path)
                            deleted_files.append(filename)
                            logger.info(f"Deleted source file: {filename}")
                        except Exception as file_e:
                            logger.warning(f"Failed to delete source file {filename}: {str(file_e)}")

            # 从文件数据源配置中删除记录
            try:
                from core.data.file_datasource_manager import file_datasource_manager

                file_datasource_manager.remove_file_datasource(table_name)
            except Exception as config_e:
                logger.warning(f"Failed to delete file datasource configuration: {str(config_e)}")

        except Exception as cleanup_e:
            logger.warning(f"Error cleaning up source files: {str(cleanup_e)}")

        # 删除DuckDB中的表或视图
        try:
            drop_query = f'DROP TABLE IF EXISTS "{table_name}"'
            con.execute(drop_query)
        except Exception as e:
            if "is of type View" in str(e):
                # 如果是视图，则删除视图
                drop_query = f'DROP VIEW IF EXISTS "{table_name}"'
                con.execute(drop_query)
            else:
                raise e

        logger.info(f"Successfully deleted DuckDB table: {table_name}")

        # 构建返回消息
        message = f"Table '{table_name}' 已成功删除"
        if deleted_files:
            message += f"，同时删除了源文件: {', '.join(deleted_files)}"

        return create_success_response(
            data={"deleted_files": deleted_files, "table_name": table_name},
            message_code=MessageCode.TABLE_DELETED,
            message=message,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete DuckDB table: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete table: {str(e)}")


# ==================== 集合操作API端点 ====================


# ==================== 集合操作API端点 ====================


@router.post("/api/set-operations/generate", tags=["Set Operations"])
async def generate_set_operation_query(request: SetOperationRequest):
    """
    生成集合操作SQL查询

    支持UNION, UNION ALL, EXCEPT, INTERSECT等集合操作
    支持BY NAME模式进行列名映射
    """
    try:
        config = request.config

        # 生成SQL查询
        sql = generate_set_operation_sql(config)

        # 估算结果rows
        con = get_db_connection()
        estimated_rows = estimate_set_operation_rows(config, con)

        # 构建元数据
        metadata = {
            "operation_type": config.operation_type,
            "table_count": len(config.tables),
            "use_by_name": config.use_by_name,
            "estimated_rows": estimated_rows,
            "tables": [
                {
                    "table_name": table.table_name,
                    "selected_columns": table.selected_columns,
                    "alias": table.alias,
                }
                for table in config.tables
            ],
        }

        return create_success_response(
            data={
                "sql": sql,
                "errors": [],
                "warnings": [],
                "metadata": metadata if request.include_metadata else None,
                "estimated_rows": estimated_rows,
            },
            message_code=MessageCode.SET_OPERATION_GENERATED,
        )

    except ValueError as e:
        logger.warning(f"Failed to generate set operation query: {str(e)}")
        return create_error_response(
            code=MessageCode.VALIDATION_ERROR.value,
            message=str(e),
            details={"errors": [str(e)]},
        )
    except Exception as e:
        logger.error(f"Failed to generate set operation query: {str(e)}")
        return create_error_response(
            code=MessageCode.OPERATION_FAILED.value,
            message=f"Failed to generate query: {str(e)}",
            details={"errors": [f"Failed to generate query: {str(e)}"]},
        )


@router.post("/api/set-operations/preview", tags=["Set Operations"])
async def preview_set_operation(request: SetOperationRequest):
    """
    预览集合操作结果

    执行集合操作查询并返回前几rows据
    """
    try:
        config = request.config

        # 生成SQL查询
        sql = generate_set_operation_sql(config)

        # Add LIMIT进行预览
        preview_sql = f"{sql} LIMIT 100"

        # 执行预览查询
        con = get_db_connection()
        result_df = con.execute(preview_sql).fetchdf()

        preview_data = normalize_dataframe_output(result_df)

        # 获取总rows估算
        estimated_rows = estimate_set_operation_rows(config, con)

        return create_success_response(
            data={
                "data": preview_data,
                "row_count": len(preview_data),
                "estimated_total_rows": estimated_rows,
                "sql": preview_sql,
                "errors": [],
                "warnings": [],
            },
            message_code=MessageCode.SET_OPERATION_PREVIEWED,
        )

    except ValueError as e:
        logger.warning(f"Failed to preview set operation: {str(e)}")
        return create_error_response(
            code=MessageCode.VALIDATION_ERROR.value,
            message=str(e),
            details={"errors": [str(e)]},
        )
    except Exception as e:
        logger.error(f"Failed to preview set operation: {str(e)}")
        return create_error_response(
            code=MessageCode.OPERATION_FAILED.value,
            message=f"Failed to preview: {str(e)}",
            details={"errors": [f"Failed to preview: {str(e)}"]},
        )


@router.post("/api/set-operations/validate", tags=["Set Operations"])
async def validate_set_operation(request: SetOperationRequest):
    """
    验证集合操作配置

    检查表是否存在、列是否兼容等
    """
    try:
        config = request.config
        con = get_db_connection()

        errors = []
        warnings = []

        # 检查所有表是否存在
        for table in config.tables:
            try:
                # 检查表是否存在
                check_sql = f'SELECT COUNT(*) FROM "{table.table_name}"'
                con.execute(check_sql).fetchone()
            except Exception as e:
                errors.append(f"Table {table.table_name} does not exist或无法访问: {str(e)}")

        # 检查列兼容性
        if not config.use_by_name:
            # 位置模式：检查列数量是否匹配
            if len(config.tables) >= 2:
                first_table = config.tables[0]
                first_columns = first_table.selected_columns or []

                for i, table in enumerate(config.tables[1:], 1):
                    table_columns = table.selected_columns or []
                    if len(first_columns) != len(table_columns):
                        errors.append(
                            f"Table {table.table_name} 的列数量({len(table_columns)}) "
                            f"与第一个Table {first_table.table_name} 的列数量({len(first_columns)})不匹配"
                        )

        # BY NAME模式验证
        if config.use_by_name:
            # DuckDB的BY NAME模式会自动按列名匹配，不需要手动列映射
            pass

        # 检查操作类型支持
        if config.use_by_name and config.operation_type not in [
            SetOperationType.UNION,
            SetOperationType.UNION_ALL,
        ]:
            errors.append("只有UNION和UNION ALL支持BY NAME模式")

        # 性能警告
        if len(config.tables) > 5:
            warnings.append("表数量较多，查询性能可能较慢")

        is_valid = len(errors) == 0
        return create_success_response(
            data={
                "is_valid": is_valid,
                "errors": errors,
                "warnings": warnings,
                "table_count": len(config.tables),
                "operation_type": config.operation_type,
                "use_by_name": config.use_by_name,
            },
            message_code=MessageCode.SET_OPERATION_VALIDATED
            if is_valid
            else MessageCode.VALIDATION_ERROR,
        )

    except Exception as e:
        logger.error(f"Failed to validate set operation: {str(e)}")
        return create_error_response(
            code=MessageCode.VALIDATION_ERROR.value,
            message=f"Failed to validate: {str(e)}",
            details={"errors": [f"Failed to validate: {str(e)}"]},
        )


@router.post("/api/set-operations/execute", tags=["Set Operations"])
async def execute_set_operation(request: SetOperationRequest):
    """
    执行集合操作查询

    执行完整的集合操作并返回结果
    """
    try:
        config = request.config

        # 生成SQL查询，根据模式决定是否应用子查询限制
        if request.preview or (not request.save_as_table):
            # 预览模式或默认执行：在子查询级别应用限制，避免大数据集内存问题
            from core.common.config_manager import config_manager

            limit = config_manager.get_app_config().max_query_rows
            sql = generate_set_operation_sql(config, preview_limit=limit)
        else:
            # 保存到表模式：生成完整查询
            sql = generate_set_operation_sql(config)

        # 执行查询
        con = get_db_connection()

        if request.preview:
            # 预览模式：使用配置的max_query_rows限制
            from core.common.config_manager import config_manager

            limit = config_manager.get_app_config().max_query_rows
            preview_sql = f"{sql} LIMIT {limit}"
            result_df = con.execute(preview_sql).fetchdf()
            columns = [
                {"name": col, "type": str(result_df[col].dtype)}
                for col in result_df.columns
            ]
            data = normalize_dataframe_output(result_df)

            return create_success_response(
                data={
                    "data": data,
                    "row_count": len(data),
                    "column_count": len(columns),
                    "columns": columns,
                    "sql": sql,
                    "sqlQuery": sql,
                    "originalDatasource": {
                        "type": "set_operation",
                        "operation": config.operation_type,
                        "tables": [source.table_name for source in config.tables],
                    },
                    "isSetOperation": True,
                    "setOperationConfig": config.model_dump()
                    if hasattr(config, "model_dump")
                    else config.dict(),
                    "errors": [],
                    "warnings": [],
                },
                message_code=MessageCode.SET_OPERATION_PREVIEWED,
            )
        elif request.save_as_table:
            # 保存到表模式：直接创建表，不使用fetchdf避免内存溢出
            table_name = request.save_as_table.strip()
            logger.info(f"Starting to save set operation result to table: {table_name}")

            # 检查表名是否already exists
            existing_tables = con.execute("SHOW TABLES").fetchdf()
            existing_table_names = (
                existing_tables["name"].tolist() if not existing_tables.empty else []
            )

            if table_name in existing_table_names:
                logger.warning(f"Table {table_name} already exists，will be replaced")

            # 直接创建表，不使用fetchdf
            create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({sql})'
            logger.info(f"Executing create table SQL: {create_sql}")
            con.execute(create_sql)

            # 获取统计信息（不使用fetchdf）
            row_count_result = con.execute(
                f'SELECT COUNT(*) FROM "{table_name}"'
            ).fetchone()
            row_count = row_count_result[0] if row_count_result else 0

            # 获取列信息（使用LIMIT 1避免大数据集问题）
            sample_sql = f'SELECT * FROM "{table_name}" LIMIT 1'
            sample_df = con.execute(sample_sql).fetchdf()
            columns = [
                {"name": col, "type": str(sample_df[col].dtype)}
                for col in sample_df.columns
            ]

            logger.info(f"Table {table_name} created successfully，rows: {row_count}")

            return create_success_response(
                data={
                    "saved_table": table_name,
                    "table_alias": table_name,
                    "row_count": row_count,
                    "column_count": len(columns),
                    "columns": columns,
                    "sql": sql,
                    "sqlQuery": sql,
                    "originalDatasource": {
                        "type": "set_operation",
                        "operation": config.operation_type,
                        "tables": [source.table_name for source in config.tables],
                    },
                    "isSetOperation": True,
                    "setOperationConfig": config.model_dump()
                    if hasattr(config, "model_dump")
                    else config.dict(),
                    "errors": [],
                    "warnings": [],
                },
                message_code=MessageCode.SET_OPERATION_EXECUTED,
                message=f"Set operation result has been saved to table: {table_name}, total {row_count:,} rows.",
            )
        else:
            # 默认行为：执行集合操作预览，使用配置的max_query_rows限制
            from core.common.config_manager import config_manager

            limit = config_manager.get_app_config().max_query_rows
            preview_sql = f"{sql} LIMIT {limit}"
            result_df = con.execute(preview_sql).fetchdf()
            columns = [
                {"name": col, "type": str(result_df[col].dtype)}
                for col in result_df.columns
            ]
            data = normalize_dataframe_output(result_df)

            return create_success_response(
                data={
                    "data": data,
                    "row_count": len(data),
                    "column_count": len(columns),
                    "columns": columns,
                    "sql": sql,
                    "sqlQuery": sql,
                    "originalDatasource": {
                        "type": "set_operation",
                        "operation": config.operation_type,
                        "tables": [source.table_name for source in config.tables],
                    },
                    "isSetOperation": True,
                    "setOperationConfig": config.model_dump()
                    if hasattr(config, "model_dump")
                    else config.dict(),
                    "errors": [],
                    "warnings": [],
                },
                message_code=MessageCode.SET_OPERATION_EXECUTED,
            )

    except ValueError as e:
        logger.warning(f"Failed to execute set operation: {str(e)}")
        return create_error_response(
            code=MessageCode.VALIDATION_ERROR.value,
            message=str(e),
            details={"errors": [str(e)]},
        )
    except Exception as e:
        logger.error(f"Failed to execute set operation: {str(e)}")
        return create_error_response(
            code=MessageCode.OPERATION_FAILED.value,
            message=f"Failed to execute: {str(e)}",
            details={"errors": [f"Failed to execute: {str(e)}"]},
        )


@router.post("/api/set-operations/simple-union", tags=["Set Operations"])
async def simple_union_operation(request: UnionOperationRequest):
    """
    简化的UNION操作

    提供简化的UNION操作接口，只需要表名列表
    """
    try:
        tables = request.tables
        operation_type = request.operation_type
        use_by_name = request.use_by_name
        column_mappings = request.column_mappings

        # 构建简化的配置
        table_configs = []
        for table_name in tables:
            table_config = {
                "table_name": table_name,
                "selected_columns": [],  # 使用所有列
                "alias": None,
            }

            # 如果有列映射，添加到配置中
            if use_by_name and column_mappings and table_name in column_mappings:
                table_config["column_mappings"] = column_mappings[table_name]

            table_configs.append(table_config)

        # 创建集合操作配置
        config = SetOperationConfig(
            operation_type=operation_type, tables=table_configs, use_by_name=use_by_name
        )

        # 生成SQL查询
        sql = generate_set_operation_sql(config)

        # 估算结果rows
        con = get_db_connection()
        estimated_rows = estimate_set_operation_rows(config, con)

        return create_success_response(
            data={
                "sql": sql,
                "estimated_rows": estimated_rows,
                "table_count": len(tables),
                "operation_type": operation_type,
                "use_by_name": use_by_name,
                "errors": [],
                "warnings": [],
            },
            message_code=MessageCode.SET_OPERATION_GENERATED,
        )

    except ValueError as e:
        logger.warning(f"Failed to simplify UNION operation: {str(e)}")
        return create_error_response(
            code=MessageCode.VALIDATION_ERROR.value,
            message=str(e),
            details={"errors": [str(e)]},
        )
    except Exception as e:
        logger.error(f"Failed to simplify UNION operation: {str(e)}")
        return create_error_response(
            code=MessageCode.OPERATION_FAILED.value,
            message=f"Failed to operate: {str(e)}",
            details={"errors": [f"Failed to operate: {str(e)}"]},
        )


@router.post("/api/set-operations/export", tags=["Set Operations"])
async def export_set_operation(request: SetOperationExportRequest):
    """
    集合操作异步导出 - 使用DuckDB COPY命令

    支持Excel、CSV、Parquet格式，使用DuckDB COPY命令直接导出完整数据，
    避免内存限制问题。
    """
    from concurrent.futures import ThreadPoolExecutor

    from core.services.task_manager import task_manager

    try:
        config = request.config
        export_format = request.format
        custom_filename = request.filename

        logger.info(
            f"开始集合操作导出: 格式={export_format}, 操作类型={config.operation_type}"
        )

        # 生成完整SQL（无LIMIT）
        sql = generate_set_operation_sql(config)
        logger.info(f"Generated complete SQL: {sql}")

        # 创建异步Export task
        task_id = str(uuid.uuid4())

        # 生成文件名
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if custom_filename:
            base_filename = custom_filename
        else:
            operation_name = config.operation_type.replace(" ", "_").lower()
            base_filename = f"set_operation_{operation_name}_{timestamp}"

        # 根据格式确定文件扩展名和DuckDB COPY格式
        if export_format == "csv":
            file_extension = "csv"
            copy_format = "CSV"
            copy_options = "HEADER"
        elif export_format == "parquet":
            file_extension = "parquet"
            copy_format = "PARQUET"
            copy_options = ""
        elif export_format == "excel":
            file_extension = "xlsx"
            copy_format = "CSV"  # 先导出为CSV，然后转换为Excel
            copy_options = "HEADER"
        else:
            raise ValueError(f"Unsupported export format: {export_format}")

        # 构建文件路径
        filename = f"{base_filename}.{file_extension}"
        file_path = f"/app/exports/{filename}"

        # 创建任务记录
        task_info = {
            "task_id": task_id,
            "type": "set_operation_export",
            "status": "running",
            "created_at": datetime.now().isoformat(),
            "config": config.dict(),
            "format": export_format,
            "filename": filename,
            "file_path": file_path,
            "progress": 0,
            "message": "正在准备导出...",
        }

        # 注册任务
        task_manager.add_task(task_id, task_info)

        # 在后台线程中执行Export task
        def export_task():
            try:
                # 更新任务状态
                task_manager.update_task(
                    task_id,
                    {
                        "status": "running",
                        "progress": 10,
                        "message": "正在连接数据库...",
                    },
                )

                # 获取数据库连接
                con = get_db_connection()

                # 更新任务状态
                task_manager.update_task(
                    task_id, {"progress": 30, "message": "正在执行查询..."}
                )

                if export_format == "excel":
                    # Excel需要特殊处理：先导出为CSV，然后转换为Excel
                    csv_path = file_path.replace(".xlsx", ".csv")
                    copy_sql = f"COPY ({sql}) TO '{csv_path}' (FORMAT {copy_format}, {copy_options})"

                    logger.info(f"Executing CSV export: {copy_sql}")
                    con.execute(copy_sql)

                    # 更新任务状态
                    task_manager.update_task(
                        task_id, {"progress": 70, "message": "正在转换为Excel格式..."}
                    )

                    # 将CSV转换为Excel

                    df = pd.read_csv(csv_path)
                    df.to_excel(file_path, index=False)

                    # 删除临时CSV文件

                    os.remove(csv_path)

                else:
                    # 直接使用DuckDB COPY命令
                    copy_sql = f"COPY ({sql}) TO '{file_path}' (FORMAT {copy_format}, {copy_options})"

                    logger.info(f"Executing export: {copy_sql}")
                    con.execute(copy_sql)

                # 检查文件是否created successfully

                if not os.path.exists(file_path):
                    raise Exception("Export file not created")

                file_size = os.path.getsize(file_path)

                # 更新任务状态为完成
                task_manager.update_task(
                    task_id,
                    {
                        "status": "completed",
                        "progress": 100,
                        "message": f"导出完成，文件size: {file_size / 1024 / 1024:.2f} MB",
                        "file_size": file_size,
                        "download_url": f"/api/async-tasks/{task_id}/download",
                    },
                )

                logger.info(f"Set operation export completed: {filename}, size: {file_size} bytes")

            except Exception as e:
                logger.error(f"Export taskFailed to execute: {str(e)}")
                task_manager.update_task(
                    task_id,
                    {
                        "status": "failed",
                        "progress": 0,
                        "message": f"导出失败: {str(e)}",
                        "error": str(e),
                    },
                )

        # 在后台线程中执行Export task
        executor = ThreadPoolExecutor(max_workers=1)
        executor.submit(export_task)

        return create_success_response(
            data={
                "task_id": task_id,
                "filename": filename,
                "format": export_format,
            },
            message_code=MessageCode.SET_OPERATION_EXPORTED,
            message="Export task created, please check async task list later",
        )

    except Exception as e:
        logger.error(f"Failed to export set operation: {str(e)}")
        return create_error_response(
            code=MessageCode.OPERATION_FAILED.value,
            message=f"Failed to create export task: {str(e)}",
            details={"error": str(e)},
        )
