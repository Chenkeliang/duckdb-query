# pylint: disable=too-many-lines,no-member,too-many-public-methods,too-many-locals,too-many-statements,too-many-arguments,duplicate-code,broad-exception-caught,logging-fstring-interpolation,import-outside-toplevel,broad-exception-raised,redefined-outer-name,reimported,raise-missing-from,too-many-nested-blocks,no-else-return,unused-variable,import-error,line-too-long,bare-except,consider-using-in,unused-argument,f-string-without-interpolation,using-constant-test,unused-import
"""
多表 JOIN 与查询结果入湖（`/api/query`、`/api/save_query_to_duckdb`）。

DuckDB/联邦 SQL 执行见 `duckdb_query.py`；透视 / 集合运算见 `pivot_query.py`、`set_operations.py`。
"""
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
from core.common.exceptions import ValidationError as APIValidationError
from core.common.utils import describe_query_column_types, normalize_dataframe_output
from core.common.validators import validate_table_name
from core.data.file_datasource_manager import (
    build_table_metadata_snapshot,
    file_datasource_manager,
)
from core.data.file_utils import load_file_to_duckdb
from core.database.database_manager import db_manager
from core.database.duckdb_engine import (
    build_single_table_query,
    execute_query,
    generate_improved_column_aliases,
    with_duckdb_connection,
)
from core.database.federated_attach import (
    attach_databases_on_connection,
    detach_databases_on_connection,
    execute_sql_and_persist,
    federated_source_sql_alias,
    format_qualified_table_reference,
    resolve_attach_configs,
)
from core.database.duckdb_pool import interruptible_connection
from fastapi import APIRouter, Body, Header
from models.query_models import QueryRequest
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import create_engine
from core.common.exceptions import (
    BaseAPIException,
    DatabaseConnectionError,
    ResourceNotFoundError,
    ValidationError as APIValidationError,
)
from core.common.paths import get_temp_dir
from utils.response_helpers import (
    MessageCode,
    create_error_response,
    create_list_response,
    create_success_response,
    error_json_response,
)
from routers.query_sql_utils import (
    ensure_query_has_limit,
    get_join_type_sql,
    remove_auto_added_limit,
)

# Setup logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

router = APIRouter()



def safe_alias(table, col):
    col_safe = re.sub(r"[^a-zA-Z0-9_]", "_", col)
    alias = f"{table}_{col_safe}"
    # Ensure alias starts with letter or underscore
    if not re.match(r"^[a-zA-Z_]", alias):
        alias = f"col_{alias}"
    return f'"{alias}"'


def _escaped_col_name(col: Any) -> str:
    """从列(字符串或 {'name':...} 字典)取列名并转义内嵌双引号，供安全拼进带引号
    的标识符。join.conditions[].column 与 source.columns[] 都来自请求体、且
    query_models 里无 schema 校验，必须转义——否则内嵌的 `"` 可跳出标识符注入
    SQL（回归：JOIN 结果标记 CASE 表达式里的键列曾经裸拼，与 columns[].name
    是同一注入面）。"""
    name = col.get("name", str(col)) if isinstance(col, dict) else str(col)
    return name.replace('"', '""')


def load_federated_table_columns(
    con: Any,
    source_id: str,
    attach_aliases: set[str],
) -> List[Dict[str, str]]:
    """ATTACH 后通过 DESCRIBE 拉取列名，供未传 columns 的联邦 JOIN 构建 SELECT。"""
    qualified = format_qualified_table_reference(source_id.strip('"'))
    try:
        cols_df = con.execute(f"DESCRIBE {qualified}").fetchdf()
        if cols_df is None or cols_df.empty:
            return []
        name_col = (
            "column_name"
            if "column_name" in cols_df.columns
            else cols_df.columns[0]
        )
        return [{"name": str(name)} for name in cols_df[name_col].tolist()]
    except Exception as exc:
        logger.warning("DESCRIBE %s failed: %s", qualified, exc)
        return []


def build_multi_table_join_query(
    query_request,
    con,
    *,
    federated_attach: bool = False,
    attach_aliases: Optional[set[str]] = None,
):
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

    attach_alias_set = attach_aliases if federated_attach and attach_aliases else None

    def table_ref_id(source_id: str) -> str:
        sid = source_id.strip('"')
        if attach_alias_set:
            return federated_source_sql_alias(sid, attach_alias_set)
        return sid

    if len(sources) == 1:
        # Single table query
        source_id = sources[0].id.strip('"')
        return f'SELECT * FROM "{source_id}"'

    # 所有表都显式传了空列表(用户在每张表都取消勾选全部列)时，与预览生成器
    # buildJoinPreviewSql 的兜底语义保持一致：视为未做列裁剪，走全列，
    # 而不是让最终 SELECT 只剩 join_result_ 标记列
    all_explicit_empty = all(
        getattr(source, "columns", None) == [] for source in sources
    )

    if not federated_attach:
        available_tables = con.execute("SHOW TABLES").fetchdf()
        available_table_names = available_tables["name"].tolist()

        for source in sources:
            table_id = source.id.strip('"')
            if table_id not in available_table_names:
                raise ValueError(
                    f"Table '{table_id}' not registered in DuckDB. Available tables: {', '.join(available_table_names)}"
                )

        for source in sources:
            if not hasattr(source, "columns") or source.columns is None or all_explicit_empty:
                try:
                    cols_df = con.execute(f"PRAGMA table_info('{source.id}')").fetchdf()
                    source.columns = cols_df["name"].tolist()
                except Exception as e:
                    logger.error(f"Failed to get column information for table {source.id}: {e}")
                    source.columns = []
    else:
        for source in sources:
            if all_explicit_empty and attach_alias_set:
                source.columns = load_federated_table_columns(
                    con, source.id, attach_alias_set
                )
            elif not hasattr(source, "columns") or source.columns is None:
                source.columns = []

    # Use improved column alias generation logic
    column_aliases = generate_improved_column_aliases(sources)

    def _select_field(source, ref_id: str, col) -> str:
        # Support two column formats: string or dict containing 'name' key.
        # col_name/alias can come straight from the request body (query_models.py's
        # DataSource.columns has no schema validation), so both must be escaped the
        # same way _join_column_ref already escapes join-condition columns below —
        # otherwise an embedded '"' breaks out of the quoted identifier and injects
        # arbitrary SQL into the SELECT list.
        col_name = col.get("name", str(col)) if isinstance(col, dict) else str(col)
        alias = column_aliases[source.id].get(col_name, col_name)
        safe_col = col_name.replace('"', '""')
        safe_alias = alias.replace('"', '""')
        return f'"{ref_id}"."{safe_col}" AS "{safe_alias}"'

    # Build SELECT clause - only generate columns for tables involved in JOIN
    select_fields = []

    # Generate columns for involved tables (if there are JOINs)
    if joins:
        involved_tables = set()
        for join in joins:
            involved_tables.add(table_ref_id(join.left_source_id))
            involved_tables.add(table_ref_id(join.right_source_id))

        for source in sources:
            ref_id = table_ref_id(source.id)
            if ref_id in involved_tables and source.columns:
                for col in source.columns:
                    select_fields.append(_select_field(source, ref_id, col))
    else:
        # If no JOIN, include all columns from all tables
        for source in sources:
            ref_id = table_ref_id(source.id)
            if source.columns:
                for col in source.columns:
                    select_fields.append(_select_field(source, ref_id, col))

    # Add association result columns
    join_result_fields = []
    if joins:
        # For simplicity, we still use letter prefixes to generate JOIN result column names
        table_prefixes = {}
        prefix_index = 0
        for source in sources:
            ref_id = table_ref_id(source.id)
            prefix = chr(65 + prefix_index)  # A=65, B=66, C=67...
            table_prefixes[ref_id] = prefix
            prefix_index += 1

        for i, join in enumerate(joins):
            left_table = table_ref_id(join.left_source_id)
            right_table = table_ref_id(join.right_source_id)

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
                        f'"{right_table}"."{_escaped_col_name(join.conditions[0].right_column)}"'
                    )
                else:
                    # If no conditions, use first column for check
                    right_cols = (
                        [
                            col
                            for col in sources
                            if table_ref_id(col.id) == right_table
                        ][0].columns
                        if any(table_ref_id(col.id) == right_table for col in sources)
                        else []
                    )
                    right_key_col = (
                        f'"{right_table}"."{_escaped_col_name(right_cols[0])}"'
                        if right_cols
                        else f'"{right_table}".rowid'
                    )
                join_result_expr = f"CASE WHEN {right_key_col} IS NULL THEN 'left' ELSE 'both' END AS {join_result_column}"
            elif join_type == "right":
                # RIGHT JOIN: check if left table key field is NULL
                if join.conditions and len(join.conditions) > 0:
                    left_key_col = f'"{left_table}"."{_escaped_col_name(join.conditions[0].left_column)}"'
                else:
                    # If no conditions, use first column for check
                    left_cols = (
                        [
                            col
                            for col in sources
                            if table_ref_id(col.id) == left_table
                        ][0].columns
                        if any(table_ref_id(col.id) == left_table for col in sources)
                        else []
                    )
                    left_key_col = (
                        f'"{left_table}"."{_escaped_col_name(left_cols[0])}"'
                        if left_cols
                        else f'"{left_table}".rowid'
                    )
                join_result_expr = f"CASE WHEN {left_key_col} IS NULL THEN 'right' ELSE 'both' END AS {join_result_column}"
            elif join_type in ["full", "full_outer", "outer"]:
                # FULL OUTER JOIN: check if both sides key fields are NULL
                if join.conditions and len(join.conditions) > 0:
                    left_key_col = f'"{left_table}"."{_escaped_col_name(join.conditions[0].left_column)}"'
                    right_key_col = (
                        f'"{right_table}"."{_escaped_col_name(join.conditions[0].right_column)}"'
                    )
                else:
                    # If no conditions, use first column for check
                    left_cols = (
                        [
                            col
                            for col in sources
                            if table_ref_id(col.id) == left_table
                        ][0].columns
                        if any(table_ref_id(col.id) == left_table for col in sources)
                        else []
                    )
                    right_cols = (
                        [
                            col
                            for col in sources
                            if table_ref_id(col.id) == right_table
                        ][0].columns
                        if any(table_ref_id(col.id) == right_table for col in sources)
                        else []
                    )
                    left_key_col = (
                        f'"{left_table}"."{_escaped_col_name(left_cols[0])}"'
                        if left_cols
                        else f'"{left_table}".rowid'
                    )
                    right_key_col = (
                        f'"{right_table}"."{_escaped_col_name(right_cols[0])}"'
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
        from_clause = _source_table_sql(
            sources[0].id,
            attach_alias_set,
            source=sources[0],
            joins=joins,
        )
        for source in sources[1:]:
            from_clause += (
                f" CROSS JOIN {_source_table_sql(source.id, attach_alias_set, source=source, joins=joins)}"
            )
    else:
        # Build JOIN chain
        from_clause = build_join_chain(
            sources,
            joins,
            {source.id.strip('"'): source.columns for source in sources},
            attach_alias_set,
        )

    query = f"SELECT {select_clause} FROM {from_clause}"

    if query_request.where_conditions:
        _assert_safe_predicate(query_request.where_conditions, field="where_conditions")
        query += f" WHERE {query_request.where_conditions}"

    # Add LIMIT
    if query_request.limit:
        query += f" LIMIT {query_request.limit}"

    return query


def _assert_safe_predicate(predicate: str, *, field: str) -> None:
    """确保谓词片段是单条 SELECT 的 WHERE 表达式，阻止语句堆叠注入。

    用 DuckDB 解析器判定 `SELECT 1 WHERE <predicate>` 是否仍是单条 SELECT；
    解析器正确处理字符串字面量，故谓词内合法的 ';' 不会误判。
    """
    parser = duckdb.connect()
    try:
        statements = parser.extract_statements(f"SELECT 1 WHERE {predicate}")
    except Exception as exc:
        raise APIValidationError(f"Invalid {field} predicate: {exc}")
    finally:
        parser.close()
    if len(statements) != 1 or statements[0].type != duckdb.StatementType.SELECT:
        raise APIValidationError(
            f"Invalid {field}: only a single boolean expression is allowed"
        )


def _source_pushdown_where(source: Any) -> Optional[str]:
    """联邦 JOIN：单表 ON 筛选下推到子查询 WHERE（来自 params.pushdown_where）。"""
    if source is None or not getattr(source, "params", None):
        return None
    raw = source.params.get("pushdown_where")
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def _source_ids_match(
    source_id: str, other_id: str, attach_aliases: Optional[set[str]]
) -> bool:
    left = source_id.strip('"')
    right = other_id.strip('"')
    if left == right:
        return True
    if attach_aliases:
        return federated_source_sql_alias(left, attach_aliases) == federated_source_sql_alias(
            right, attach_aliases
        )
    return False


def _federated_subquery_select_list(
    source: Any,
    source_id: str,
    joins: Optional[List[Any]],
    attach_aliases: set[str],
) -> str:
    """子查询只拉取选中列 + JOIN 键，避免 SELECT * 从 MySQL 拖全表列。"""
    column_names: set[str] = set()
    if source is not None and getattr(source, "columns", None):
        for col in source.columns:
            if isinstance(col, dict):
                name = col.get("name") or col.get("column_name")
            else:
                name = str(col)
            if name:
                column_names.add(str(name))

    if joins:
        for join in joins:
            if _source_ids_match(source_id, join.left_source_id, attach_aliases):
                for condition in join.conditions or []:
                    column_names.add(condition.left_column)
            if _source_ids_match(source_id, join.right_source_id, attach_aliases):
                for condition in join.conditions or []:
                    column_names.add(condition.right_column)

    if not column_names:
        return "*"
    return ", ".join(
        f'"{name.replace(chr(34), chr(34) * 2)}"' for name in sorted(column_names)
    )


def _source_table_sql(
    source_id: str,
    attach_aliases: Optional[set[str]] = None,
    *,
    source: Any = None,
    pushdown_where: Optional[str] = None,
    joins: Optional[List[Any]] = None,
) -> str:
    qualified = format_qualified_table_reference(source_id.strip('"'))
    predicate = pushdown_where if pushdown_where is not None else _source_pushdown_where(source)
    if predicate:
        _assert_safe_predicate(predicate, field="pushdown_where")
    if attach_aliases:
        alias = federated_source_sql_alias(source_id, attach_aliases)
        safe_alias = alias.replace('"', '""')
        select_list = _federated_subquery_select_list(
            source, source_id, joins, attach_aliases
        )
        if predicate:
            return (
                f"(SELECT {select_list} FROM {qualified} WHERE {predicate}) "
                f'AS "{safe_alias}"'
            )
        if select_list != "*":
            return (
                f"(SELECT {select_list} FROM {qualified}) "
                f'AS "{safe_alias}"'
            )
        return f'{qualified} AS "{safe_alias}"'
    return qualified


def _join_column_ref(
    table_id: str, column: str, attach_aliases: Optional[set[str]] = None
) -> str:
    safe_col = column.replace(chr(34), chr(34) * 2)
    if attach_aliases:
        alias = federated_source_sql_alias(table_id, attach_aliases)
        safe_alias = alias.replace('"', '""')
        return f'"{safe_alias}"."{safe_col}"'
    return f'{_source_table_sql(table_id)}."{safe_col}"'


def build_join_chain(sources, joins, table_columns, attach_aliases=None):
    """
    Build JOIN chain, support multi-table connections and multi-field associations
    """
    if not joins:
        return _source_table_sql(
            sources[0].id, attach_aliases, source=sources[0], joins=joins
        )

    def ref_id(source_id: str) -> str:
        sid = source_id.strip('"')
        if attach_aliases:
            return federated_source_sql_alias(sid, attach_aliases)
        return sid

    # Create table mapping
    source_map = {source.id.strip('"'): source for source in sources}

    # Track tables already joined in query
    joined_tables = set()

    # Start building from first JOIN
    first_join = joins[0]
    left_table = ref_id(first_join.left_source_id)
    right_table = ref_id(first_join.right_source_id)

    from_clause = _source_table_sql(
        first_join.left_source_id,
        attach_aliases,
        source=source_map.get(first_join.left_source_id.strip('"')),
        joins=joins,
    )
    joined_tables.add(left_table)

    # Collect JOIN conditions for all same table pairs
    join_conditions_map = {}

    for join in joins:
        left_id = ref_id(join.left_source_id)
        right_id = ref_id(join.right_source_id)
        left_source_id = join.left_source_id.strip('"')
        right_source_id = join.right_source_id.strip('"')

        # Create JOIN key for merging JOIN conditions of same table pairs
        join_key = tuple(sorted([left_id, right_id]))

        if join_key not in join_conditions_map:
            join_conditions_map[join_key] = {
                "left_table": left_id,
                "right_table": right_id,
                "left_source_id": left_source_id,
                "right_source_id": right_source_id,
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
        table_to_join_source = (
            join_info["right_source_id"]
            if table_to_join == right_id
            else join_info["left_source_id"]
        )
        join_source = source_map.get(table_to_join_source.strip('"'))
        from_clause += (
            f" {join_type_sql} {_source_table_sql(table_to_join_source, attach_aliases, source=join_source, joins=joins)}"
        )

        # Add all JOIN conditions (including multi-field associations)
        if join_type.lower() != "cross" and all_conditions:
            conditions = []
            for condition in all_conditions:
                left_table_id = join_info["left_source_id"]
                right_table_id = join_info["right_source_id"]

                base_left_col = _join_column_ref(
                    left_table_id, condition.left_column, attach_aliases
                )
                base_right_col = _join_column_ref(
                    right_table_id, condition.right_column, attach_aliases
                )

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
def perform_query(
    query_request: QueryRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """Performs a join query on the specified data sources."""
    query_id = f"sync:{x_request_id}" if x_request_id else None
    if query_id:
        logger.info(f"Query with request ID: {x_request_id}")

    if not query_request.sources:
        raise APIValidationError(
            "Query request must contain at least one data source"
        )

    federated_attach = bool(query_request.attach_databases)
    conn_ctx = (
        interruptible_connection(query_id, "")
        if query_id
        else with_duckdb_connection()
    )
    with conn_ctx as con:
        attached_aliases: List[str] = []
        try:
            if federated_attach:
                attach_configs = resolve_attach_configs(query_request.attach_databases)
                attached_aliases = attach_databases_on_connection(con, attach_configs)

            available_table_names: List[str] = []
            if not federated_attach:
                available_tables = con.execute("SHOW TABLES").fetchdf()
                available_table_names = (
                    available_tables["name"].tolist()
                    if not available_tables.empty
                    else []
                )
                logger.info(
                    "Current tables in DuckDB: %s",
                    available_tables.to_string(),
                )
            else:
                for source in query_request.sources:
                    pushdown = _source_pushdown_where(source)
                    if pushdown:
                        logger.info(
                            "Federated pushdown for %s: %s",
                            source.id,
                            pushdown[:200],
                        )
                    else:
                        logger.warning(
                            "Federated source %s has no pushdown_where; "
                            "full table scan may be slow",
                            source.id,
                        )

            # 构建查询 - 确保表名使用双引号括起来
            attach_alias_set = None
            if federated_attach and query_request.attach_databases:
                attach_alias_set = {
                    db.alias.strip()
                    for db in query_request.attach_databases
                    if getattr(db, "alias", None)
                }

            if federated_attach and attach_alias_set:
                for source in query_request.sources:
                    # 仅在未管理过列选择(None)时才补全全部列；
                    # 显式传空列表([])代表用户取消勾选了该表全部列，不能当作"全部"处理
                    if source.columns is None:
                        source.columns = load_federated_table_columns(
                            con, source.id, attach_alias_set
                        )

            if len(query_request.joins) > 0:
                query = build_multi_table_join_query(
                    query_request,
                    con,
                    federated_attach=federated_attach,
                    attach_aliases=attach_alias_set,
                )
            else:
                # 单表查询 - 使用 build_single_table_query 来处理表名
                query = build_single_table_query(query_request)

                # 验证表是否存在（从查询中提取实际表名）

                table_match = re.search(r'FROM "([^"]+)"', query)
                if table_match and not federated_attach:
                    actual_table_name = table_match.group(1)
                    if actual_table_name not in available_table_names:
                        logger.error(
                            "Table '%s' does not exist. Available: %s",
                            actual_table_name,
                            ", ".join(available_table_names),
                        )
                        raise ResourceNotFoundError("Table", actual_table_name)

            from core.common.config_manager import config_manager

            max_rows = config_manager.get_app_config().max_query_rows
            if query_request.is_preview:
                query = ensure_query_has_limit(query, max_rows)
                logger.info(f"Preview mode, applied LIMIT {max_rows}")
            elif federated_attach and " LIMIT " not in query.upper():
                query = ensure_query_has_limit(query, max_rows)
                logger.info(
                    "Federated join without LIMIT, applied max_query_rows=%s",
                    max_rows,
                )

            logger.info(f"Executing query: {query}")

            # 执行查询
            result_df = execute_query(query, con)
            logger.info(f"Query completed, result shape: {result_df.shape}")

            data_records = normalize_dataframe_output(result_df)
            columns_list = [str(col) for col in result_df.columns.tolist()]
            column_types = describe_query_column_types(con, query, result_df)

            return create_success_response(
                data={
                    "data": data_records,
                    "columns": columns_list,
                    "column_types": column_types,
                    "index": result_df.index.tolist(),
                    "sql": query,
                    "row_count": len(data_records),
                },
                message_code=MessageCode.QUERY_SUCCESS,
            )
        except duckdb.InterruptException as e:
            logger.info("Join query %s cancelled by user", query_id)
            return error_json_response(
                499,
                MessageCode.QUERY_CANCELLED,
                "Query cancelled",
                details={"query_id": query_id, "error": str(e)},
            )
        except BaseAPIException:
            raise
        except Exception as e:
            error_message = str(e)
            logger.error("Query failed: %s", error_message)
            logger.error("Stack trace: %s", traceback.format_exc())

            from core.common.error_codes import classify_exception

            error_code, status_code = classify_exception(error_message)

            return error_json_response(
                status_code=status_code,
                code=error_code,
                message=error_message,
                details={"sql": getattr(query_request, "sql", None)},
            )
        finally:
            if attached_aliases:
                detach_databases_on_connection(con, attached_aliases)


@router.post("/api/save_query_to_duckdb", tags=["Query"])
def save_query_to_duckdb(request: dict = Body(...)):
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
            raise APIValidationError("Please provide DuckDB table alias")

        if not sql_query or not sql_query.strip():
            raise APIValidationError("Please provide SQL query statement")

        # 验证数据源，提供默认值防止None错误
        datasource_id = datasource.get("id", "duckdb_internal")
        datasource_type = datasource.get("type", "duckdb")

        logger.info(
            f"Parsed params: datasource_id={datasource_id}, datasource_type={datasource_type}, table_alias={table_alias}"
        )

        logger.info(
            f"Starting to save query result: datasource_id={datasource_id}, datasource_type={datasource_type}, table_alias={table_alias}"
        )

        # 联邦查询支持：显式 attach_databases 优先；为空时按 mysql/sqlite/duckdb/postgresql
        # 四种类型统一自动推导（四种均可 ATTACH，async_tasks.py 的异步任务端点早已如此）。
        # duckdb_internal 是"本地查询、无外部数据源"的哨兵值，传给推导 helper 前先排除，
        # 否则会被当成真实连接 ID 而报连接不存在。
        from core.common.connection_alias import resolve_attach_databases_for_async

        try:
            attach_list, _ = resolve_attach_databases_for_async(
                request.get("attach_databases"),
                datasource if datasource_id != "duckdb_internal" else None,
            )
        except ValueError as derive_error:
            # 连接已删除/改名等推导失败:错误契约与下方执行失败保持一致
            # (QUERY_FAILED + details),不能落到外层通用 OPERATION_FAILED
            logger.error(f"Deriving attach databases failed: {derive_error}")
            return error_json_response(
                500,
                MessageCode.QUERY_FAILED,
                f"Federated query failed: {derive_error}",
                details={"sql": sql_query, "datasource_id": datasource_id},
            )

        if attach_list:
            from models.query_models import AttachDatabase
            from routers.async_tasks import validate_attach_databases

            validate_attach_databases(
                [
                    AttachDatabase(alias=item["alias"], connection_id=item["connection_id"])
                    for item in attach_list
                ]
            )

        # 对于保存功能，始终重新执行SQL以确保数据完整性
        # 智能移除系统自动添加的LIMIT，保留用户原始的所有SQL逻辑
        logger.info("Re-executing SQL to get complete data, intelligently handling LIMIT")

        try:
            # reject_empty=True: 空结果只清理内部临时表、绝不触碰 table_alias 下
            # 已有的数据——同名重存(overwrite)时新查询意外返回 0 行,不能把旧的
            # 有效数据换成空表再删掉,必须让旧数据原封不动地留在原地。
            metadata_snapshot = execute_sql_and_persist(
                remove_auto_added_limit(sql_query), table_alias, attach_list,
                reject_empty=True,
            )
        except Exception as exec_error:
            logger.error(f"Query execution/persist failed: {str(exec_error)}")
            return error_json_response(
                500,
                MessageCode.QUERY_FAILED,
                (
                    f"Federated query failed: {exec_error}"
                    if attach_list
                    else f"DuckDB query failed: {exec_error}"
                ),
                details={"sql": sql_query, "attach_databases": attach_list},
            )

        row_count = metadata_snapshot["row_count"]
        if row_count == 0:
            # execute_sql_and_persist 已保证 table_alias 未被触碰(见其 docstring),
            # 这里只需要报错,不需要(也不能)再对 table_alias 做任何清理动作。
            raise APIValidationError("Query result is empty, cannot save")

        logger.info(f"Data has been persisted to DuckDB table: {table_alias}, rows: {row_count}")

        from core.common.timezone_utils import get_current_time_iso

        try:
            file_info = {
                "source_id": table_alias,
                "filename": f"{table_alias}_query_result",
                "file_path": f"query_result_{table_alias}",
                "file_type": "duckdb_table",
                "created_at": get_current_time_iso(),
                "source_sql": sql_query,
                "source_datasource": datasource_id,
                **metadata_snapshot,
            }

            file_datasource_manager.save_file_datasource(file_info)
            logger.info(
                f"Created file datasource configuration for query result table: {table_alias}"
            )

        except Exception as config_error:
            logger.warning(
                f"Failed to create file datasource configuration: {str(config_error)}"
            )

        return create_success_response(
            data={
                "table_alias": table_alias,
                "row_count": row_count,
                "columns": metadata_snapshot["columns"],
                "source_sql": sql_query,
                "source_datasource": datasource_id,
                "created_at": get_current_time_iso(),
                "datasource": {
                    "id": table_alias,
                    "name": table_alias,
                    "type": "duckdb",
                    "table_name": table_alias,
                    "row_count": row_count,
                    "column_count": metadata_snapshot["column_count"],
                    "created_at": get_current_time_iso(),
                    "updated_at": get_current_time_iso(),
                },
            },
            message_code=MessageCode.TABLE_CREATED,
            message=f"Query result has been saved as DuckDB table: {table_alias}",
        )

    except BaseAPIException:
        raise
    except Exception as e:
        logger.error(f"Failed to save to DuckDB: {str(e)}")
        logger.error(f"Stack trace: {traceback.format_exc()}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to save to DuckDB: {str(e)}",
        )
