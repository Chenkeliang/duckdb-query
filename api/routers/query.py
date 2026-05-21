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
from core.common.exceptions import (
    BaseAPIException,
    ResourceNotFoundError,
    ValidationError as APIValidationError,
)
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

    if not query_request.sources:
        raise APIValidationError(
            "Query request must contain at least one data source"
        )

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
                            f"DuckDB read_xlsx failed, falling back to pandas: {duckdb_exc}"
                        )
                        df = pd.read_excel(file_path, dtype=str)
                        con.register(source.id, df)
                        logger.info(
                            f"Registered table using pandas.read_excel: {source.id}, shape: {df.shape}"
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
                            "Loaded file via DuckDB native: %s -> Table %s",
                            file_path,
                            source.id,
                        )
                    except Exception as load_error:
                        logger.error(
                            "File %s load failed: %s", file_path, load_error, exc_info=True
                        )
                        raise
                else:
                    logger.warning(f"Unknown file type: {file_extension}, trying pandas read")
                    try:
                        df = pd.read_csv(file_path, dtype=str)
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"Created persistent table using pandas.read_csv: {source.id}, shape: {df.shape}"
                        )
                    except Exception:
                        df = pd.read_excel(file_path, dtype=str)
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"Registered table using pandas.read_excel: {source.id}, shape: {df.shape}"
                        )

            elif source.type in ["mysql", "postgresql", "sqlite"]:
                # 处理数据库数据源 - 支持三种模式：connectionId、数据源名称、直接连接参数
                connection_id = source.params.get("connectionId")
                datasource_name = source.params.get("datasource_name")

                if connection_id:
                    # 模式1：使用预先保存的数据库连接
                    logger.info(
                        f"Processing database datasource: {source.id}, connection_id: {connection_id}"
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
                            f"Created persistent database table: {source.id}, shape: {df.shape}"
                        )

                    except Exception as db_error:
                        logger.error(f"Failed to process database connection: {db_error}")
                        raise ValueError(
                            f"Database connection processing failed: {source.id}, error: {str(db_error)}"
                        )

                elif datasource_name:
                    # 模式2：使用数据源名称（安全模式）- 从配置文件读取连接信息
                    logger.info(
                        f"Processing secure datasource: {source.id}, datasource_name: {datasource_name}"
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
                            f"Registered secure datasource table: {source.id}, shape: {df.shape}"
                        )

                    except Exception as secure_db_error:
                        logger.error(f"Failed to process secure datasource: {secure_db_error}")
                        raise ValueError(
                            f"Secure datasource processing failed: {source.id}, error: {str(secure_db_error)}"
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
                            f"Created persistent direct connection database table: {source.id}, shape: {df.shape}"
                        )

                    except Exception as direct_db_error:
                        logger.error(f"Failed to connect to database directly: {direct_db_error}")
                        raise ValueError(
                            f"Direct database connection failed: {source.id}, error: {str(direct_db_error)}"
                        )

        # 获取当前可用的表
        available_tables = con.execute("SHOW TABLES").fetchdf()
        available_table_names = (
            available_tables["name"].tolist() if not available_tables.empty else []
        )
        logger.info(f"Current tables in DuckDB: {available_tables.to_string()}")

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
                    logger.error(
                        "Table '%s' does not exist. Available: %s",
                        actual_table_name,
                        ", ".join(available_table_names),
                    )
                    raise ResourceNotFoundError("Table", actual_table_name)

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
        raise
    except BaseAPIException:
        raise
    except Exception as e:
        error_message = str(e)
        logger.error("Query failed: %s", error_message)
        logger.error("Stack trace: %s", traceback.format_exc())

        from core.common.error_codes import analyze_error_type, get_http_status_code

        error_code = analyze_error_type(error_message)
        status_code = get_http_status_code(error_code)

        return error_json_response(
            status_code=status_code,
            code=error_code,
            message=error_message,
            details={"sql": getattr(query_request, "sql", None)},
        )


def _should_proxy_execute_sql_to_duckdb(request: dict) -> bool:
    """仅 DuckDB 本地 SQL（无 file/外部库）时代理到 canonical 端点。"""
    if not isinstance(request, dict):
        return False
    if not str(request.get("sql", "")).strip():
        return False
    datasource = request.get("datasource") or {}
    if not isinstance(datasource, dict):
        return False
    ds_type = datasource.get("type")
    if ds_type in ("mysql", "postgresql", "sqlite"):
        return False
    if ds_type == "file":
        return False
    return True


@router.post("/api/execute_sql", tags=["Query"], deprecated=True)
async def execute_sql(
    request: dict = Body(...),
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """
    [已废弃] 直接执行 SQL，主要用于历史调试。

    请使用 ``POST /api/duckdb/execute`` 或 ``POST /api/duckdb/federated-query``。
    """
    logger.warning(
        "DEPRECATED: POST /api/execute_sql — use /api/duckdb/execute or "
        "/api/duckdb/federated-query"
    )

    if _should_proxy_execute_sql_to_duckdb(request):
        from routers.duckdb_query import DuckDBQueryRequest, execute_duckdb_sql

        return await execute_duckdb_sql(
            DuckDBQueryRequest(
                sql=request.get("sql", ""),
                is_preview=request.get("is_preview", True),
                save_as_table=request.get("save_as_table")
                or request.get("saveAsTable"),
            ),
            x_request_id,
        )

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
            f"Type check result: {datasource_type in ['mysql', 'postgresql', 'sqlite', 'duckdb']}"
        )
        logger.info(
            f"Full condition check: {isinstance(datasource, dict) and datasource.get('type') in ['mysql', 'postgresql', 'sqlite', 'duckdb']}"
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
                    f"Starting database query: datasource_id={datasource_id}, sql={sql_query}"
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
                row_count = len(result_df)
                return create_success_response(
                    data={
                        "data": data_records,
                        "columns": columns_list,
                        "row_count": row_count,
                        "rowCount": row_count,
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

            row_count = len(result_df)
            return create_success_response(
                data={
                    "data": data_records,
                    "columns": columns_list,
                    "row_count": row_count,
                    "rowCount": row_count,
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
            f"Parsed params: datasource_id={datasource_id}, datasource_type={datasource_type}, table_alias={table_alias}"
        )

        logger.info(
            f"Starting to save query result: datasource_id={datasource_id}, datasource_type={datasource_type}, table_alias={table_alias}"
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
                        f"MySQL query removed auto-added LIMIT: {sql_query} -> {clean_sql}"
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
                        f"DuckDB query removed auto-added LIMIT, kept all user conditions: {clean_sql}"
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


@router.get("/api/duckdb_tables", tags=["Query"], deprecated=True)
async def list_duckdb_tables():
    """[已废弃] 请使用 ``GET /api/duckdb/tables``。"""
    logger.warning("DEPRECATED: GET /api/duckdb_tables — use GET /api/duckdb/tables")
    from routers.duckdb_query import list_duckdb_tables_summary

    return await list_duckdb_tables_summary()


@router.delete("/api/duckdb_tables/{table_name}", tags=["Query"], deprecated=True)
async def delete_duckdb_table_legacy(table_name: str):
    """[已废弃] 请使用 ``DELETE /api/duckdb/tables/{table_name}``。"""
    logger.warning(
        "DEPRECATED: DELETE /api/duckdb_tables/%s — use DELETE /api/duckdb/tables/{name}",
        table_name,
    )
    from routers.duckdb_query import delete_duckdb_table

    return await delete_duckdb_table(table_name)


# ==================== 集合操作API端点 ====================


# ==================== 集合操作API端点 ====================



# Visual / set-operation routes (paths unchanged)
from routers.set_operations import router as set_operations_router
from routers.visual_query import router as visual_query_router

router.include_router(visual_query_router)
router.include_router(set_operations_router)
