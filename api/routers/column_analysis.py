"""列 cast 数据感知推断。

在(可筛选的)真实数据上刻画一列作为数值 cast 目标的安全性,供透视文本聚合 / JOIN
类型冲突做「安全推荐 + 可手填」。DECIMAL 标度取自实际最大小数位,而非固定常量,从根上
避免舍入假匹配(Codex 复审)。路由负责持连接→ATTACH→采样,分析函数不自开连接。
"""
import logging
from contextlib import contextmanager
from typing import List, Optional

import duckdb
from fastapi import APIRouter
from pydantic import BaseModel, Field

from core.common.sql_identifiers import quote_identifier
from core.data.ingestion_precision import analyze_numeric_cast
from core.database.duckdb_engine import with_duckdb_connection
from core.database.doris_source import doris_relation_columns
from core.database.federated_execution import federated_execution_scope, inspect_federated_pushdown
from core.database.federated_attach import (
    attach_databases_on_connection,
    duckdb_attach_configs,
    detach_databases_on_connection,
    format_qualified_table_reference,
    resolve_attach_configs,
)
from core.services.pivot_query_sql_common import _build_where_clause
from models.pivot_query_models import FilterConfig
from models.query_models import AttachDatabase
from utils.response_helpers import MessageCode, create_success_response
from utils.response_helpers import error_json_response
from models.column_insights_models import InsightTableRequest, JsonPathsRequest, InsightQueryRequest
from core.services.column_insights import (
    column_insight, discover_json_paths, generate_insight_sql, SAMPLE_LIMIT, JSON_BYTE_LIMIT,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class InferCastRequest(BaseModel):
    table_name: str = Field(..., min_length=1)
    column: str = Field(..., min_length=1)
    filters: List[FilterConfig] = Field(default_factory=list)
    attach_databases: Optional[List[AttachDatabase]] = None


def _table_ref(table_name: str) -> str:
    ref = (table_name or "").strip()
    if "." in ref:
        return format_qualified_table_reference(ref)
    return quote_identifier(ref.strip('"'))


@router.post("/api/columns/infer-cast", tags=["Columns"])
def infer_column_cast(request: InferCastRequest):
    """返回该列(在给定筛选下)作为数值 cast 目标的安全推荐 + 统计:
    {recommended: 'BIGINT'|'DECIMAL(38,s)'|None, total, numeric, non_numeric,
     max_int_digits, max_frac_digits, safe_decimal_cast, reason}。
    reason ∈ None|empty|non_numeric|binary_float|scientific|overflow(不安全原因)。"""
    qcol = quote_identifier(request.column)
    where = _build_where_clause(request.filters or [])
    select_sql = f"SELECT {qcol} FROM {_table_ref(request.table_name)} {where}"

    attach_list = request.attach_databases or None
    configs = resolve_attach_configs(attach_list) if attach_list else []
    native = duckdb_attach_configs(configs)
    with with_duckdb_connection() as con:
        attached = []
        try:
            if native:
                attached = attach_databases_on_connection(
                    con, native, cleanup_on_failure=True
                )
            if len(native) != len(configs):
                with federated_execution_scope(con, select_sql, configs) as execution:
                    result = analyze_numeric_cast(con, f"({execution.sql})", request.column)
            else:
                result = analyze_numeric_cast(con, f"({select_sql})", request.column)
        finally:
            detach_databases_on_connection(con, attached)

    return create_success_response(data=result, message_code=MessageCode.OPERATION_SUCCESS)


@contextmanager
def _insight_context(request: InsightTableRequest):
    """Lease and clean up one table's attachments for metadata-only operations."""
    with with_duckdb_connection() as connection:
        attached = []
        try:
            configs = resolve_attach_configs(request.attach_databases) if request.attach_databases else []
            native = duckdb_attach_configs(configs)
            if native:
                attached = attach_databases_on_connection(
                    connection, native, cleanup_on_failure=True
                )
            reference = _table_ref(request.table_name)
            columns = doris_relation_columns(reference, configs)
            schema = {column["name"]: column["type"] for column in columns} if columns is not None else {
                str(row[0]): str(row[1]) for row in connection.execute(
                    f"DESCRIBE SELECT * FROM {reference}"
                ).fetchall()
            }
            yield connection, reference, schema
        finally:
            detach_databases_on_connection(connection, attached)


@router.post("/api/columns/insights", tags=["Columns"])
def get_column_insights(request: InsightTableRequest):
    """Recommend operations from actual column types without scanning rows."""
    try:
        with _insight_context(request) as (_, _reference, schema):
            result = {"columns": [column_insight(name, kind) for name, kind in schema.items()]}
        return create_success_response(data=result, message_code=MessageCode.OPERATION_SUCCESS)
    except (ValueError, duckdb.Error) as error:
        return error_json_response(status_code=400, code="VALIDATION_ERROR", message=str(error))


@router.post("/api/columns/json-paths", tags=["Columns"])
def get_json_paths(request: JsonPathsRequest):
    """Discover bounded JSON paths from a sample; never imply a complete schema."""
    try:
        with _insight_context(request) as (connection, reference, schema):
            if request.column not in schema or not column_insight(
                request.column, schema[request.column]
            )["json_candidate"]:
                raise ValueError("Choose a JSON-compatible column")
            column = quote_identifier(request.column)
            for condition in request.filters:
                if condition.column not in schema:
                    raise ValueError("Filter column does not exist")
            where = _build_where_clause(request.filters)
            sql = (
                f"SELECT CASE WHEN octet_length(encode(CAST({column} AS VARCHAR))) <= {JSON_BYTE_LIMIT} "
                f"THEN CAST(TRY_CAST({column} AS JSON) AS VARCHAR) END "
                f"FROM {reference} {where} LIMIT {SAMPLE_LIMIT}"
            )
            configs = resolve_attach_configs(request.attach_databases)
            with federated_execution_scope(
                connection, sql, configs, stream_candidates=True, doris_sample_limit=SAMPLE_LIMIT,
            ) as execution:
                rows = connection.execute(execution.sql).fetchall()
            result = discover_json_paths([row[0] for row in rows])
        return create_success_response(data=result, message_code=MessageCode.OPERATION_SUCCESS)
    except (ValueError, duckdb.Error) as error:
        return error_json_response(status_code=400, code="VALIDATION_ERROR", message=str(error))


@router.post("/api/columns/insight-query", tags=["Columns"])
def generate_column_insight_query(request: InsightQueryRequest):
    """Generate a validated read-only query; execution uses existing query APIs."""
    try:
        with _insight_context(request) as (connection, reference, schema):
            sql = generate_insight_sql(request, reference, schema)
            pushdown = inspect_federated_pushdown(connection, sql, resolve_attach_configs(request.attach_databases))
        outputs = request.metrics or request.extractions
        return create_success_response(data={
            "sql": sql, "kind": "metrics" if request.metrics else "json",
            "columns": [output.alias for output in outputs],
            "pushdown": pushdown,
        }, message_code=MessageCode.OPERATION_SUCCESS)
    except (ValueError, duckdb.Error) as error:
        return error_json_response(status_code=400, code="VALIDATION_ERROR", message=str(error))
