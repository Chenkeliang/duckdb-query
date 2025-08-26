from fastapi import APIRouter, Body, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from models.query_models import QueryRequest
from core.duckdb_engine import (
    get_db_connection,
    execute_query,
    create_persistent_table,
    create_varchar_table_from_dataframe,
    build_single_table_query,
    generate_improved_column_aliases,
    detect_column_conflicts
)
import pandas as pd
import numpy as np
import io
import os
import time
import traceback
import logging
import re

# 设置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

router = APIRouter()


def get_join_type_sql(join_type):
    """将前端的join类型转换为正确的SQL JOIN语法"""
    join_type = join_type.lower()
    if join_type == "inner":
        return "INNER JOIN"
    elif join_type == "left":
        return "LEFT JOIN"
    elif join_type == "right":
        return "RIGHT JOIN"
    elif join_type == "outer" or join_type == "full_outer":
        return "FULL OUTER JOIN"  # 外连接的正确SQL语法
    elif join_type == "cross":
        return "CROSS JOIN"
    else:
        return "INNER JOIN"  # 默认使用内连接

def ensure_query_has_limit(query: str, default_limit: int = 1000) -> str:
    """确保SQL查询有LIMIT子句，防止返回过多数据。"""
    # 使用正则表达式检查LIMIT子句，更稳健
    if not re.search(r'\sLIMIT\s+\d+\s*($|;)', query, re.IGNORECASE):
        if query.strip().endswith(";"):
            return f"{query[:-1]} LIMIT {default_limit};"
        else:
            return f"{query} LIMIT {default_limit}"
    return query


def safe_alias(table, col):
    import re

    col_safe = re.sub(r"[^a-zA-Z0-9_]", "_", col)
    alias = f"{table}_{col_safe}"
    # 保证别名以字母或下划线开头
    if not re.match(r"^[a-zA-Z_]", alias):
        alias = f"col_{alias}"
    return f'"{alias}"'


def build_multi_table_join_query(query_request, con):
    """
    构建多表JOIN查询
    支持多个数据源的复杂JOIN操作
    增加关联结果列显示JOIN匹配状态
    使用改进的列名生成逻辑
    """
    sources = query_request.sources
    joins = query_request.joins

    if not sources:
        raise ValueError("至少需要一个数据源")

    if len(sources) == 1:
        # 单表查询
        source_id = sources[0].id.strip('"')
        return f'SELECT * FROM "{source_id}"'

    # 验证所有表都已注册
    available_tables = con.execute("SHOW TABLES").fetchdf()
    available_table_names = available_tables["name"].tolist()

    for source in sources:
        table_id = source.id.strip('"')
        if table_id not in available_table_names:
            raise ValueError(
                f"表 '{table_id}' 未注册到DuckDB中。可用表: {', '.join(available_table_names)}"
            )

    # 为每个source添加columns信息（如果还没有的话）
    for source in sources:
        if not hasattr(source, 'columns') or source.columns is None:
            try:
                # 获取表的列信息
                cols_df = con.execute(f"PRAGMA table_info('{source.id}')").fetchdf()
                source.columns = cols_df["name"].tolist()
            except Exception as e:
                logger.error(f"获取表 {source.id} 的列信息失败: {e}")
                source.columns = []

    # 使用改进的列别名生成逻辑
    column_aliases = generate_improved_column_aliases(sources)

    # 构建SELECT子句 - 只为JOIN中涉及的表生成列
    select_fields = []
    
    # 为涉及的表生成列（如果有JOIN）
    if joins:
        involved_tables = set()
        for join in joins:
            involved_tables.add(join.left_source_id.strip('"'))
            involved_tables.add(join.right_source_id.strip('"'))
            
        for source in sources:
            table_id = source.id.strip('"')
            if table_id in involved_tables and source.columns:
                for col in source.columns:
                    alias = column_aliases[source.id][col]
                    select_fields.append(f'"{table_id}"."{col}" AS "{alias}"')
    else:
        # 如果没有JOIN，包含所有表的所有列
        for source in sources:
            table_id = source.id.strip('"')
            if source.columns:
                for col in source.columns:
                    alias = column_aliases[source.id][col]
                    select_fields.append(f'"{table_id}"."{col}" AS "{alias}"')

    # 添加关联结果列
    join_result_fields = []
    if joins:
        # 为简单起见，我们仍然使用字母前缀来生成JOIN结果列名
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

            # 生成关联结果列名
            left_prefix = table_prefixes.get(left_table, left_table)
            right_prefix = table_prefixes.get(right_table, right_table)
            join_result_column = f"join_result_{left_prefix}_{right_prefix}"

            # 根据JOIN类型生成CASE表达式
            join_type = join.join_type.lower()
            if join_type == "inner":
                # INNER JOIN: 只有匹配的记录，都标记为'both'
                join_result_expr = f"'both' AS {join_result_column}"
            elif join_type == "left":
                # LEFT JOIN: 检查右表关键字段是否为NULL
                if join.conditions and len(join.conditions) > 0:
                    right_key_col = (
                        f'"{right_table}"."{join.conditions[0].right_column}"'
                    )
                else:
                    # 如果没有条件，使用第一个列作为检查
                    right_cols = [col for col in sources if col.id.strip('"') == right_table][0].columns if any(col.id.strip('"') == right_table for col in sources) else []
                    right_key_col = (
                        f'"{right_table}"."{right_cols[0]}"'
                        if right_cols
                        else f'"{right_table}".rowid'
                    )
                join_result_expr = f"CASE WHEN {right_key_col} IS NULL THEN 'left' ELSE 'both' END AS {join_result_column}"
            elif join_type == "right":
                # RIGHT JOIN: 检查左表关键字段是否为NULL
                if join.conditions and len(join.conditions) > 0:
                    left_key_col = f'"{left_table}"."{join.conditions[0].left_column}"'
                else:
                    # 如果没有条件，使用第一个列作为检查
                    left_cols = [col for col in sources if col.id.strip('"') == left_table][0].columns if any(col.id.strip('"') == left_table for col in sources) else []
                    left_key_col = (
                        f'"{left_table}"."{left_cols[0]}"'
                        if left_cols
                        else f'"{left_table}".rowid'
                    )
                join_result_expr = f"CASE WHEN {left_key_col} IS NULL THEN 'right' ELSE 'both' END AS {join_result_column}"
            elif join_type in ["full", "full_outer", "outer"]:
                # FULL OUTER JOIN: 检查两边关键字段是否为NULL
                if join.conditions and len(join.conditions) > 0:
                    left_key_col = f'"{left_table}"."{join.conditions[0].left_column}"'
                    right_key_col = (
                        f'"{right_table}"."{join.conditions[0].right_column}"'
                    )
                else:
                    # 如果没有条件，使用第一个列作为检查
                    left_cols = [col for col in sources if col.id.strip('"') == left_table][0].columns if any(col.id.strip('"') == left_table for col in sources) else []
                    right_cols = [col for col in sources if col.id.strip('"') == right_table][0].columns if any(col.id.strip('"') == right_table for col in sources) else []
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
                # 其他类型的JOIN（如CROSS JOIN），默认标记为'both'
                join_result_expr = f"'both' AS {join_result_column}"

            join_result_fields.append(join_result_expr)

    # 合并所有字段
    all_fields = select_fields + join_result_fields
    select_clause = ", ".join(all_fields) if all_fields else "*"

    # 构建FROM和JOIN子句
    if not joins:
        # 没有JOIN条件，使用CROSS JOIN
        first_source_id = sources[0].id.strip('"')
        from_clause = f'"{first_source_id}"'
        for source in sources[1:]:
            source_id = source.id.strip('"')
            from_clause += f' CROSS JOIN "{source_id}"'
    else:
        # 构建JOIN链
        from_clause = build_join_chain(sources, joins, {source.id.strip('"'): source.columns for source in sources})

    query = f"SELECT {select_clause} FROM {from_clause}"

    # 添加LIMIT
    if query_request.limit:
        query += f" LIMIT {query_request.limit}"

    return query


def build_join_chain(sources, joins, table_columns):
    """
    构建JOIN链，支持多表连接
    """
    if not joins:
        first_source_id = sources[0].id.strip('"')
        return f'"{first_source_id}"'

    # 创建表的映射
    source_map = {source.id.strip('"'): source for source in sources}

    # 跟踪已经加入查询的表
    joined_tables = set()

    # 从第一个JOIN开始构建
    first_join = joins[0]
    left_table = first_join.left_source_id.strip('"')
    right_table = first_join.right_source_id.strip('"')

    # 开始构建查询
    from_clause = f'"{left_table}"'
    joined_tables.add(left_table)

    # 处理所有JOIN
    for join in joins:
        left_id = join.left_source_id.strip('"')
        right_id = join.right_source_id.strip('"')

        # 确定哪个表需要被JOIN进来
        if left_id in joined_tables and right_id not in joined_tables:
            # 右表需要被JOIN进来
            table_to_join = right_id
        elif right_id in joined_tables and left_id not in joined_tables:
            # 左表需要被JOIN进来
            table_to_join = left_id
        elif left_id not in joined_tables and right_id not in joined_tables:
            # 两个表都不在查询中，JOIN右表
            table_to_join = right_id
        else:
            # 两个表都已经在查询中，跳过这个JOIN
            continue

        join_type_sql = get_join_type_sql(join.join_type)
        from_clause += f' {join_type_sql} "{table_to_join}"'

        # 添加JOIN条件
        if join.join_type.lower() != "cross" and join.conditions:
            conditions = []
            for condition in join.conditions:
                left_table_id = join.left_source_id.strip('"')
                right_table_id = join.right_source_id.strip('"')

                # 智能数据类型转换和清洗
                left_col = f'"{left_table_id}"."{condition.left_column}"'
                right_col = f'"{right_table_id}"."{condition.right_column}"'

                # 检查是否需要数据清洗（针对包含JSON或复杂字符串的情况）
                # 如果左列包含复杂数据，尝试提取数字部分
                if condition.left_column == "uid" and left_table_id in ["0711", "0702"]:
                    # 使用正则表达式提取数字部分
                    left_col = (
                        f"CAST(REGEXP_EXTRACT({left_col}, '^([0-9]+)', 1) AS VARCHAR)"
                    )

                # 如果右列是数字类型，确保类型匹配
                if condition.right_column in [
                    "iget_uid",
                    "buyer_id",
                ] and right_table_id.startswith("query_result"):
                    # 确保右列也是字符串类型进行比较
                    right_col = f"CAST({right_col} AS VARCHAR)"

                conditions.append(f"{left_col} {condition.operator} {right_col}")

            if conditions:
                from_clause += f" ON {' AND '.join(conditions)}"

        joined_tables.add(table_to_join)

    return from_clause


@router.post("/api/query", tags=["Query"])
async def perform_query(query_request: QueryRequest):
    """Performs a join query on the specified data sources."""
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
                    logger.error(f"文件不存在，尝试的路径: {possible_paths}")
                    raise ValueError(f"文件不存在: {original_path}")

                # 更新source中的路径为实际找到的路径
                source.params["path"] = file_path

                logger.info(f"注册数据源: {source.id}, 路径: {file_path}")

                # 根据文件扩展名选择合适的读取方法
                file_extension = file_path.lower().split(".")[-1]

                if file_extension in ["xlsx", "xls"]:
                    # Excel文件处理
                    try:
                        con.execute("INSTALL excel;")
                        con.execute("LOAD excel;")
                        duckdb_query = (
                            f"SELECT * FROM EXCEL_SCAN('{file_path}') LIMIT 1"
                        )
                        con.execute(duckdb_query).fetchdf()
                        # 先创建临时表
                        temp_table = f"temp_{source.id}_{int(time.time())}"
                        con.execute(
                            f"CREATE TABLE \"{temp_table}\" AS SELECT * FROM EXCEL_SCAN('{file_path}')"
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
                        logger.info(f"使用duckdb EXCEL_SCAN 注册Excel表: {source.id}")
                    except Exception as duckdb_exc:
                        logger.warning(
                            f"duckdb EXCEL_SCAN 读取失败，降级为pandas: {duckdb_exc}"
                        )
                        df = pd.read_excel(file_path, dtype=str)
                        con.register(source.id, df)
                        logger.info(
                            f"已用pandas.read_excel注册表: {source.id}, shape: {df.shape}"
                        )

                elif file_extension == "csv":
                    # CSV文件处理，优先使用DuckDB原生功能
                    try:
                        # 使用DuckDB读取CSV，然后转换所有列为VARCHAR
                        temp_table = f"temp_{source.id}_{int(time.time())}"

                        # 先用DuckDB读取到临时表
                        con.execute(
                            f"CREATE TABLE \"{temp_table}\" AS SELECT * FROM read_csv_auto('{file_path}')"
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

                        # 创建最终表，所有列都是VARCHAR
                        con.execute(f'DROP TABLE IF EXISTS "{source.id}"')
                        con.execute(
                            f'CREATE TABLE "{source.id}" AS SELECT {cast_sql} FROM "{temp_table}"'
                        )

                        # 删除临时表
                        con.execute(f'DROP TABLE "{temp_table}"')

                        logger.info(
                            f"使用DuckDB read_csv_auto创建VARCHAR表: {source.id}"
                        )

                    except Exception as duckdb_exc:
                        logger.warning(f"DuckDB读取CSV失败，降级为pandas: {duckdb_exc}")
                        # 降级为pandas方案
                        df = pd.read_csv(file_path, dtype=str)
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"已用pandas.read_csv创建持久化表: {source.id}, shape: {df.shape}"
                        )

                else:
                    # 其他文件类型，尝试pandas通用读取
                    logger.warning(f"未知文件类型: {file_extension}，尝试pandas读取")
                    try:
                        df = pd.read_csv(file_path, dtype=str)  # 默认尝试CSV
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"已用pandas.read_csv创建持久化表: {source.id}, shape: {df.shape}"
                        )
                    except Exception:
                        df = pd.read_excel(file_path, dtype=str)  # 再尝试Excel
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

                    from core.database_manager import db_manager

                    try:
                        db_connection = db_manager.get_connection(connection_id)
                        if not db_connection:
                            raise ValueError(f"未找到数据库连接: {connection_id}")

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
                        logger.error(f"数据库连接处理失败: {db_error}")
                        raise ValueError(
                            f"数据库连接处理失败: {source.id}, 错误: {str(db_error)}"
                        )

                elif datasource_name:
                    # 模式2：使用数据源名称（安全模式）- 从配置文件读取连接信息
                    logger.info(
                        f"处理安全数据源: {source.id}, 数据源名称: {datasource_name}"
                    )

                    try:
                        import json
                        from sqlalchemy import create_engine

                        # 读取MySQL配置文件
                        mysql_config_file = os.path.join(
                            os.path.dirname(os.path.dirname(__file__)),
                            "config/mysql-configs.json",
                        )
                        if not os.path.exists(mysql_config_file):
                            raise ValueError("MySQL配置文件不存在")

                        with open(mysql_config_file, "r", encoding="utf-8") as f:
                            configs = json.load(f)

                        # 查找对应的配置
                        mysql_config = None
                        for config in configs:
                            if config["id"] == datasource_name:
                                mysql_config = config["params"]
                                break

                        if not mysql_config:
                            raise ValueError(f"未找到数据源配置: {datasource_name}")

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
                        logger.error(f"安全数据源处理失败: {secure_db_error}")
                        raise ValueError(
                            f"安全数据源处理失败: {source.id}, 错误: {str(secure_db_error)}"
                        )
                else:
                    # 模式3：直接使用连接参数（兼容旧版本，但不推荐）
                    logger.warning(f"使用直接连接参数模式（不推荐）: {source.id}")

                    try:
                        from sqlalchemy import create_engine

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
                            raise ValueError(f"数据库连接参数不完整: {source.id}")

                        # 创建连接字符串
                        if source.type == "mysql":
                            connection_str = f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"
                        elif source.type == "postgresql":
                            connection_str = f"postgresql://{user}:{password}@{host}:{port}/{database}"
                        elif source.type == "sqlite":
                            connection_str = f"sqlite:///{database}"
                        else:
                            raise ValueError(f"不支持的数据库类型: {source.type}")

                        # 创建引擎并执行查询
                        engine = create_engine(connection_str)
                        df = pd.read_sql(query, engine)

                        # 创建持久化表到DuckDB
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"已创建持久化直接连接数据库表: {source.id}, shape: {df.shape}"
                        )

                    except Exception as direct_db_error:
                        logger.error(f"直接数据库连接失败: {direct_db_error}")
                        raise ValueError(
                            f"直接数据库连接失败: {source.id}, 错误: {str(direct_db_error)}"
                        )

        # 获取当前可用的表
        available_tables = con.execute("SHOW TABLES").fetchdf()
        available_table_names = (
            available_tables["name"].tolist() if not available_tables.empty else []
        )
        logger.info(f"当前DuckDB中的表: {available_tables.to_string()}")

        # 验证是否有数据源
        if not query_request.sources:
            raise HTTPException(
                status_code=422, detail="查询请求必须包含至少一个数据源"
            )

        # 构建查询 - 确保表名使用双引号括起来
        if len(query_request.joins) > 0:
            # 多表JOIN查询 - 使用改进的多表JOIN支持
            query = build_multi_table_join_query(query_request, con)
        else:
            # 单表查询 - 使用build_single_table_query来处理表名
            query = build_single_table_query(query_request)

            # 验证表是否存在（从查询中提取实际表名）
            import re

            table_match = re.search(r'FROM "([^"]+)"', query)
            if table_match:
                actual_table_name = table_match.group(1)
                if actual_table_name not in available_table_names:
                    error_msg = f"无法执行查询，表 '{actual_table_name}' 不存在。可用的表: {', '.join(available_table_names)}"
                    logger.error(error_msg)
                    raise ValueError(error_msg)

        # 根据is_preview标志决定是否添加LIMIT
        if query_request.is_preview:
            from core.config_manager import config_manager
            limit = config_manager.get_app_config().max_query_rows
            query = ensure_query_has_limit(query, limit)
            logger.info(f"预览模式，已应用LIMIT {limit}")

        logger.info(f"执行查询: {query}")

        # 执行查询
        result_df = execute_query(query, con)
        logger.info(f"查询完成，结果形状: {result_df.shape}")

        # Replace NaN/inf with None, which is JSON serializable to null
        result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        # 更彻底地将所有NaN转为None，防止JSON序列化报错
        result_df = result_df.astype(object).where(pd.notnull(result_df), None)

        # Convert non-serializable types to strings
        for col in result_df.columns:
            if result_df[col].dtype == "object":
                result_df[col] = result_df[col].astype(str)

        result = {
            "data": result_df.to_dict(orient="records"),
            "columns": result_df.columns.tolist(),
            "index": result_df.index.tolist(),
            "sql": query,  # 返回完整SQL
        }

        return jsonable_encoder(result)
    except HTTPException:
        # 重新抛出HTTPException，保持原始状态码
        raise
    except Exception as e:
        error_message = str(e)
        logger.error(f"查询失败: {error_message}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")

        # 检查是否是表不存在的错误
        if (
            "不存在" in error_message
            or "does not exist" in error_message.lower()
            or "table" in error_message.lower()
        ):
            # 获取当前可用的表列表
            try:
                available_tables = con.execute("SHOW TABLES").fetchdf()["name"].tolist()
                table_list = ", ".join(available_tables) if available_tables else "无"

                # 提取表名（如果可能）
                import re

                table_match = re.search(
                    r"表\s*['\"]?([^'\"]+)['\"]?\s*不存在", error_message
                )
                if not table_match:
                    table_match = re.search(
                        r"Table\s*['\"]?([^'\"]+)['\"]?.*does not exist",
                        error_message,
                        re.IGNORECASE,
                    )

                missing_table = table_match.group(1) if table_match else "未知表"

                friendly_message = (
                    f"无法执行查询，表 '{missing_table}' 不存在。可用的表: {table_list}"
                )

                return {
                    "success": False,
                    "error": friendly_message,
                    "error_type": "table_not_found",
                    "missing_table": missing_table,
                    "available_tables": available_tables,
                    "data": [],
                    "columns": [],
                    "row_count": 0,
                }
            except Exception:
                # 如果获取表列表失败，返回基本错误信息
                return {
                    "success": False,
                    "error": f"无法执行查询: {error_message}",
                    "error_type": "query_error",
                    "data": [],
                    "columns": [],
                    "row_count": 0,
                }
        else:
            # 其他类型的错误，返回友好的错误信息而不是抛出500
            return {
                "success": False,
                "error": f"查询执行失败: {error_message}",
                "error_type": "execution_error",
                "data": [],
                "columns": [],
                "row_count": 0,
            }


@router.post("/api/download", tags=["Query"])
async def download_results(query_request: QueryRequest):
    """Performs a query and returns the results as an Excel file."""
    logger.info("开始执行下载请求")
    
    # 获取应用配置，包括下载超时设置
    from core.config_manager import config_manager
    app_config = config_manager.get_app_config()
    download_timeout = app_config.download_timeout
    
    logger.info(f"使用下载超时设置: {download_timeout}秒")
    con = get_db_connection()

    try:
        # Register all data sources with DuckDB - 使用与查询端点相同的逻辑
        logger.info(f"注册数据源，共 {len(query_request.sources)} 个源")
        for source in query_request.sources:
            if source.type == "file":
                logger.info(f"注册数据源: {source.id}, 路径: {source.params['path']}")
                file_path = source.params["path"]
                if not os.path.exists(file_path):
                    raise ValueError(f"文件不存在: {file_path}")

                # 优先尝试用duckdb的EXCEL扩展直接读取
                try:
                    con.execute("INSTALL excel;")
                except Exception:
                    pass
                try:
                    con.execute("LOAD excel;")
                except Exception:
                    pass
                try:
                    duckdb_query = f"SELECT * FROM EXCEL_SCAN('{file_path}') LIMIT 1"
                    con.execute(duckdb_query).fetchdf()
                    con.execute(
                        f"CREATE OR REPLACE TABLE \"{source.id}\" AS SELECT * FROM EXCEL_SCAN('{file_path}')"
                    )
                    logger.info(f"使用duckdb EXCEL_SCAN 注册表: {source.id}")
                except Exception as duckdb_exc:
                    logger.warning(
                        f"duckdb EXCEL_SCAN 读取失败，降级为pandas: {duckdb_exc}"
                    )
                    df = pd.read_excel(file_path, dtype=str)
                    con.register(source.id, df)
                    logger.info(
                        f"已用pandas.read_excel注册表: {source.id}, shape: {df.shape}"
                    )
            elif source.type == "duckdb":
                # DuckDB表数据源 - 表已存在，无需注册
                table_name = source.params.get("table_name") or source.id
                logger.info(f"使用现有DuckDB表: {table_name}")

                # 验证表是否存在
                try:
                    tables_df = con.execute("SHOW TABLES").fetchdf()
                    existing_tables = (
                        tables_df["name"].tolist() if not tables_df.empty else []
                    )

                    if table_name not in existing_tables:
                        raise ValueError(
                            f"DuckDB表 '{table_name}' 不存在。可用表: {', '.join(existing_tables)}"
                        )

                    logger.info(f"已验证DuckDB表存在: {table_name}")
                except Exception as e:
                    logger.error(f"验证DuckDB表失败: {str(e)}")
                    raise ValueError(f"无法访问DuckDB表 '{table_name}': {str(e)}")

            elif source.type == "mysql":
                # MySQL数据源处理
                if "params" in source.params and isinstance(
                    source.params["params"], dict
                ):
                    # 使用嵌套的params
                    mysql_params = source.params["params"]
                else:
                    # 直接使用params
                    mysql_params = source.params

                logger.warning(f"使用直接连接参数模式（不推荐）: {source.id}")

                # 构建MySQL连接字符串
                connection_string = f"mysql://{mysql_params['user']}:{mysql_params['password']}@{mysql_params['host']}:{mysql_params['port']}/{mysql_params['database']}"

                # 执行查询并注册到DuckDB
                import pymysql

                connection = pymysql.connect(
                    host=mysql_params["host"],
                    port=mysql_params["port"],
                    user=mysql_params["user"],
                    password=mysql_params["password"],
                    database=mysql_params["database"],
                )

                query = mysql_params.get("query", f"SELECT * FROM {source.id}")
                df = pd.read_sql(query, connection)
                connection.close()

                # 注册到DuckDB
                con.register(source.id, df)
                logger.info(f"已注册直接连接数据库表: {source.id}, shape: {df.shape}")

        # 验证是否有数据源
        if not query_request.sources:
            raise HTTPException(
                status_code=422, detail="查询请求必须包含至少一个数据源"
            )

        # Build query - 使用与查询端点相同的多表JOIN逻辑
        logger.info("开始构建查询语句")
        if len(query_request.joins) > 0:
            # 多表JOIN查询 - 使用改进的多表JOIN支持
            query = build_multi_table_join_query(query_request, con)
        else:
            # 单表查询
            source_id = query_request.sources[0].id.strip('"')
            query = f'SELECT * FROM "{source_id}"'

        # 先查询数据量，决定导出格式
        count_query = f"SELECT COUNT(*) as row_count FROM ({query}) AS subquery"
        logger.info(f"执行数据量查询: {count_query}")
        count_result = con.execute(count_query).fetchone()
        row_count = count_result[0] if count_result else 0
        
        logger.info(f"查询结果行数: {row_count}")
        
        # 根据数据量决定导出格式
        use_csv_format = row_count > 100000  # 超过10万行使用CSV格式
        if use_csv_format:
            logger.info(f"数据量较大({row_count}行)，将使用CSV格式导出")
        else:
            logger.info(f"数据量适中({row_count}行)，将使用Excel格式导出")

        # Execute query
        logger.info(f"执行下载查询: {query}")
        result_df = execute_query(query, con)
        
        # 验证查询结果
        if result_df is None:
            logger.warning("查询结果为None")
            raise ValueError("查询结果为空")
            
        if result_df.empty:
            logger.warning("查询结果为空")
            raise ValueError("查询结果为空")

        logger.info(f"查询结果: {len(result_df)} 行, {len(result_df.columns)} 列")
        logger.info(f"列名: {list(result_df.columns)}")

        # Replace NaN/inf with None, which is JSON serializable to null
        logger.info("开始处理数据中的NaN和inf值")
        result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        result_df = result_df.where(pd.notnull(result_df), None)

        # Convert to file with appropriate format
        logger.info("开始生成下载文件")
        output = io.BytesIO()
        filename = "query_results.csv" if use_csv_format else "query_results.xlsx"
        content_type = "text/csv" if use_csv_format else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        
        try:
            if use_csv_format:
                # 生成CSV格式数据
                logger.info("使用CSV格式导出数据")
                result_df.to_csv(output, index=False)
            else:
                # 生成Excel格式数据
                logger.info("使用Excel格式导出数据")
                with pd.ExcelWriter(output, engine="openpyxl") as writer:
                    result_df.to_excel(writer, index=False, sheet_name="QueryResults")
            
            output.seek(0)
            
            # 验证生成的文件
            if output.getvalue() == b"":
                raise ValueError("生成的文件为空")

            logger.info(f"文件生成成功，大小: {len(output.getvalue())} bytes, 格式: {filename.split('.')[-1]}")

        except Exception as e:
            logger.error(f"文件生成失败: {str(e)}")
            raise ValueError(f"文件生成失败: {str(e)}")

        # Return as downloadable file
        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": content_type,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
        logger.info("准备返回下载响应")
        return StreamingResponse(
            output,
            media_type=content_type,
            headers=headers,
        )
    except HTTPException:
        # 重新抛出HTTPException，保持原始状态码
        raise
    except Exception as e:
        logger.error(f"下载失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"下载处理失败: {str(e)}")


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
            from core.config_manager import config_manager
            limit = config_manager.get_app_config().max_query_rows
            sql_query = ensure_query_has_limit(sql_query, limit)
            logger.info(f"预览模式，已应用LIMIT {limit} 到SQL: {sql_query}")

        logger.info(f"=== EXECUTE_SQL 函数开始执行 ===")
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
        logger.info(f"检查数据源类型: {datasource_type}")
        logger.info(f"是否为字典: {isinstance(datasource, dict)}")
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
                    raise ValueError("缺少文件路径参数")

            table_id = datasource.get("id", "temp_table")

            # 检查文件是否存在
            if not os.path.exists(file_path):
                raise ValueError(f"文件不存在: {file_path}")

            # 读取文件并注册到 DuckDB
            if file_path.endswith(".csv"):
                df = pd.read_csv(file_path)
            elif file_path.endswith((".xls", ".xlsx")):
                df = pd.read_excel(file_path)
            else:
                raise ValueError("不支持的文件类型")
            con.register(table_id, df)

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
                    detail="数据库类型的数据源需要提供自定义SQL查询语句",
                )

            # 使用数据库管理器执行查询
            from core.database_manager import db_manager

            datasource_id = datasource.get("id")
            if not datasource_id:
                raise HTTPException(status_code=400, detail="缺少数据源ID")

            # 确保数据库连接存在，如果不存在则创建
            try:
                existing_conn = db_manager.get_connection(datasource_id)
                if not existing_conn:
                    logger.info(f"连接 {datasource_id} 不存在，尝试创建...")
                    # 读取配置文件并创建连接
                    import json
                    from datetime import datetime
                    from models.query_models import DatabaseConnection, DataSourceType

                    config_path = os.path.join(
                        os.path.dirname(os.path.dirname(__file__)), "config/mysql-configs.json"
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
                            status_code=404, detail=f"未找到数据源配置: {datasource_id}"
                        )

                    # 创建连接
                    db_connection = DatabaseConnection(
                        id=config["id"],
                        name=config.get("name", config["id"]),
                        type=DataSourceType.MYSQL,
                        params=config["params"],
                        created_at=datetime.now(),
                    )

                    success = db_manager.add_connection(db_connection)
                    if not success:
                        raise HTTPException(
                            status_code=500,
                            detail=f"创建数据库连接失败: {datasource_id}",
                        )

                    logger.info(f"成功创建数据库连接: {datasource_id}")

            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"创建数据库连接失败: {str(e)}")
                raise HTTPException(status_code=500, detail=f"数据库连接失败: {str(e)}")

            # 在原始数据库上执行SQL查询
            try:
                logger.info(
                    f"开始执行数据库查询: datasource_id={datasource_id}, sql={sql_query}"
                )
                result_df = db_manager.execute_query(datasource_id, sql_query)
                logger.info(f"数据库查询执行完成，结果形状: {result_df.shape}")

                # 处理数据类型和编码问题
                result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
                result_df = result_df.astype(object).where(pd.notnull(result_df), None)

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

                data_records = result_df.to_dict(orient="records")
                columns_list = [str(col) for col in result_df.columns.tolist()]

                logger.info(f"准备返回数据库查询结果，行数: {len(result_df)}")
                return {
                    "success": True,
                    "data": data_records,
                    "columns": columns_list,
                    "rowCount": len(result_df),
                    "source_type": "database",
                    "source_id": datasource_id,
                    "sql_query": sql_query,
                    "can_save_to_duckdb": True,  # 标识可以保存到DuckDB
                }

            except Exception as db_error:
                logger.error(f"数据库查询失败: {str(db_error)}")
                raise HTTPException(
                    status_code=500, detail=f"数据库查询失败: {str(db_error)}"
                )

        # 如果不是数据库类型，则在DuckDB中执行查询
        else:
            # 执行SQL查询
            result_df = execute_query(sql_query, con)
            logger.info(f"SQL查询执行完成，结果形状: {result_df.shape}")

            # Replace NaN/inf with None, which is JSON serializable to null
            result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
            # 更彻底地将所有NaN转为None，防止JSON序列化报错
            result_df = result_df.astype(object).where(pd.notnull(result_df), None)

            # 将所有不可序列化的数据类型转换为字符串
            for col in result_df.columns:
                # 检查是否有不可序列化的对象类型列
                if result_df[col].dtype == "object":
                    # 将可能不可序列化的对象转换为字符串
                    result_df[col] = result_df[col].astype(str)

            # 使用to_dict方法，确保所有数据都是可JSON序列化的
            data_records = result_df.to_dict(orient="records")

            # 确保所有列名是字符串类型
            columns_list = [str(col) for col in result_df.columns.tolist()]

            # 返回结果 - 只使用简单的数据结构
            result = {
                "success": True,
                "data": data_records,
                "columns": columns_list,
                "rowCount": len(result_df),
            }

            return result
    except Exception as e:
        logger.error(f"SQL执行失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"SQL执行失败: {str(e)}")


@router.post("/api/save_query_to_duckdb", tags=["Query"])
async def save_query_to_duckdb(request: dict = Body(...)):
    """将数据库查询结果保存到DuckDB作为新的数据源"""
    try:
        logger.info(f"保存查询到DuckDB请求: {request}")

        # 获取请求参数，支持多种格式，确保安全处理None值
        datasource = (
            request.get("datasource") or request.get("originalDatasource") or {}
        )
        sql_query = request.get("sql") or request.get("sqlQuery", "")
        table_alias = request.get("table_alias") or request.get("tableAlias", "")

        # 确保datasource是字典类型
        if not isinstance(datasource, dict):
            datasource = {}

        # 参数验证
        if not table_alias or not table_alias.strip():
            raise HTTPException(status_code=400, detail="请提供DuckDB表别名")

        if not sql_query or not sql_query.strip():
            raise HTTPException(status_code=400, detail="请提供SQL查询语句")

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

        # 优先处理DuckDB内部查询（大多数情况）
        try:
            con = get_db_connection()
            logger.info(f"在DuckDB中执行查询: {sql_query}")
            result_df = execute_query(sql_query, con)
            logger.info(f"DuckDB查询执行完成，结果形状: {result_df.shape}")
        except Exception as duckdb_error:
            logger.error(f"DuckDB查询失败: {str(duckdb_error)}")

            # 如果DuckDB查询失败且是外部数据库，尝试外部数据库查询
            if datasource_type not in ["duckdb"] and datasource_id != "duckdb_internal":
                try:
                    logger.info(f"尝试外部数据库查询: {datasource_id}")
                    from core.database_manager import db_manager

                    # 确保数据库连接存在
                    existing_conn = db_manager.get_connection(datasource_id)
                    if not existing_conn:
                        logger.info(f"连接 {datasource_id} 不存在，尝试从配置创建...")
                        # 尝试从配置文件创建连接
                        import json
                        from datetime import datetime
                        from models.query_models import (
                            DatabaseConnection,
                            DataSourceType,
                        )

                        try:
                            config_path = os.path.join(
                                os.path.dirname(os.path.dirname(__file__)),
                                "config/mysql-configs.json",
                            )
                            if os.path.exists(config_path):
                                with open(config_path, "r", encoding="utf-8") as f:
                                    configs = json.load(f)

                                config = None
                                for cfg in configs:
                                    if cfg["id"] == datasource_id:
                                        config = cfg
                                        break

                                if config:
                                    db_connection = DatabaseConnection(
                                        id=config["id"],
                                        name=config.get("name", config["id"]),
                                        type=DataSourceType.MYSQL,
                                        params=config["params"],
                                        created_at=datetime.now(),
                                    )
                                    db_manager.add_connection(db_connection)
                                    logger.info(f"成功创建数据库连接: {datasource_id}")
                                else:
                                    raise Exception(
                                        f"未找到数据源配置: {datasource_id}"
                                    )
                            else:
                                raise Exception(f"配置文件不存在: {config_path}")

                        except Exception as config_error:
                            logger.error(f"创建数据库连接失败: {str(config_error)}")
                            raise Exception(f"数据库连接失败: {str(config_error)}")

                    # 执行查询获取数据
                    result_df = db_manager.execute_query(datasource_id, sql_query)
                    logger.info(
                        f"外部数据库查询执行完成，准备保存到DuckDB: {result_df.shape}"
                    )

                except Exception as db_error:
                    logger.error(f"数据库查询失败: {str(db_error)}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"查询执行失败: {str(duckdb_error)} | 外部数据库查询也失败: {str(db_error)}",
                    )
            else:
                raise HTTPException(
                    status_code=500, detail=f"DuckDB查询失败: {str(duckdb_error)}"
                )

        # 验证查询结果
        if result_df is None or result_df.empty:
            raise HTTPException(status_code=400, detail="查询结果为空，无法保存")

        # 获取DuckDB连接并创建持久化表
        try:
            con = get_db_connection()

            # 检查表名是否已存在
            existing_tables = con.execute("SHOW TABLES").fetchdf()
            existing_table_names = (
                existing_tables["name"].tolist() if not existing_tables.empty else []
            )

            if table_alias in existing_table_names:
                logger.warning(f"表 {table_alias} 已存在，将被覆盖")
                con.execute(f'DROP TABLE IF EXISTS "{table_alias}"')

            # 使用改进的函数创建表
            success = create_varchar_table_from_dataframe(table_alias, result_df, con)

            if not success:
                raise Exception("查询结果持久化到DuckDB失败")

            logger.info(f"数据已持久化保存到DuckDB表: {table_alias}")

            # 验证表是否成功创建
            try:
                verification_result = con.execute(
                    f'SELECT COUNT(*) as count FROM "{table_alias}"'
                ).fetchdf()
                actual_count = verification_result.iloc[0]["count"]
                logger.info(f"表 {table_alias} 验证成功，行数: {actual_count}")
            except Exception as verify_error:
                logger.warning(f"表验证失败: {str(verify_error)}")

            return {
                "success": True,
                "message": f"查询结果已保存为DuckDB表: {table_alias}",
                "table_alias": table_alias,
                "row_count": len(result_df),
                "columns": result_df.columns.tolist(),
                "source_sql": sql_query,
                "source_datasource": datasource_id,
            }

        except Exception as duckdb_error:
            logger.error(f"DuckDB操作失败: {str(duckdb_error)}")
            raise HTTPException(
                status_code=500, detail=f"DuckDB操作失败: {str(duckdb_error)}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"保存到DuckDB失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"保存到DuckDB失败: {str(e)}")


@router.get("/api/duckdb_tables", tags=["Query"])
async def list_duckdb_tables():
    """列出DuckDB中的所有可用表"""
    try:
        con = get_db_connection()
        tables_df = con.execute("SHOW TABLES").fetchdf()

        # 获取文件数据源管理器实例
        from core.file_datasource_manager import file_datasource_manager
        file_datasources = file_datasource_manager.list_file_datasources()
        # 创建source_id到上传时间的映射（统一使用 created_at 字段）
        datasource_timestamps = {}
        for datasource in file_datasources:
            source_id = datasource.get("source_id")
            created_at = datasource.get("created_at")  # 只使用标准的 created_at 字段
            if source_id and created_at:
                datasource_timestamps[source_id] = created_at

        tables_info = []
        for _, row in tables_df.iterrows():
            table_name = row["name"]
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

                # 获取创建时间（如果有的话）
                created_at = datasource_timestamps.get(table_name)

                tables_info.append(
                    {
                        "table_name": table_name,
                        "row_count": int(row_count),
                        "columns": columns,
                        "column_count": len(columns),
                        "created_at": created_at
                    }
                )
            except Exception as e:
                logger.warning(f"获取表 {table_name} 信息失败: {str(e)}")
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
        tables_info.sort(key=lambda x: x.get("created_at") or "1900-01-01", reverse=True)

        return {
            "success": True,
            "tables": tables_info,
            "total_tables": len(tables_info),
        }

    except Exception as e:
        logger.error(f"获取DuckDB表列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表列表失败: {str(e)}")


@router.delete("/api/duckdb_tables/{table_name}", tags=["Query"])
async def delete_duckdb_table(table_name: str):
    """删除DuckDB中的指定表，同时删除对应的源文件"""
    try:
        con = get_db_connection()

        # 检查表是否存在
        tables_df = con.execute("SHOW TABLES").fetchdf()
        existing_tables = tables_df["name"].tolist() if not tables_df.empty else []

        if table_name not in existing_tables:
            raise HTTPException(status_code=404, detail=f"表 '{table_name}' 不存在")

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
                            logger.info(f"已删除源文件: {filename}")
                        except Exception as file_e:
                            logger.warning(f"删除源文件失败 {filename}: {str(file_e)}")

            # 从文件数据源配置中删除记录
            try:
                from core.file_datasource_manager import file_datasource_manager

                file_datasource_manager.remove_file_datasource(table_name)
            except Exception as config_e:
                logger.warning(f"删除文件数据源配置失败: {str(config_e)}")

        except Exception as cleanup_e:
            logger.warning(f"清理源文件时出错: {str(cleanup_e)}")

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

        logger.info(f"成功删除DuckDB表: {table_name}")

        # 构建返回消息
        message = f"表 '{table_name}' 已成功删除"
        if deleted_files:
            message += f"，同时删除了源文件: {', '.join(deleted_files)}"

        return {"success": True, "message": message, "deleted_files": deleted_files}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除DuckDB表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除表失败: {str(e)}")


@router.post("/api/execute_simple_sql", tags=["Query"])
async def execute_simple_sql(request: dict = Body(...)):
    """简化的SQL执行，支持对已上传文件的查询"""
    con = get_db_connection()
    sql_query = request.get("sql", "")
    filename = request.get("filename", "")

    try:
        logger.info(f"执行简单SQL: {sql_query}, 文件: {filename}")

        # 验证SQL查询不为空
        if not sql_query or sql_query.strip() == "":
            raise ValueError("SQL查询不能为空")

        if filename:
            # 构建文件路径
            temp_dir = os.path.join(
                os.path.dirname(os.path.dirname(__file__)), "temp_files"
            )
            file_path = os.path.join(temp_dir, filename)

            if not os.path.exists(file_path):
                raise ValueError(f"文件不存在: {filename}")

            # 读取文件并注册到 DuckDB
            table_name = filename.split(".")[0]  # 使用文件名作为表名

            if file_path.endswith(".csv"):
                df = pd.read_csv(file_path)
            elif file_path.endswith((".xls", ".xlsx")):
                df = pd.read_excel(file_path)
            else:
                raise ValueError("不支持的文件类型")

            con.register(table_name, df)
            logger.info(f"已注册表: {table_name}, 行数: {len(df)}")

        # 执行SQL查询
        result_df = execute_query(sql_query, con)
        logger.info(f"SQL查询执行完成，结果形状: {result_df.shape}")

        # 处理数据类型
        result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        result_df = result_df.astype(object).where(pd.notnull(result_df), None)

        for col in result_df.columns:
            if result_df[col].dtype == "object":
                result_df[col] = result_df[col].astype(str)

        data_records = result_df.to_dict(orient="records")
        columns_list = [str(col) for col in result_df.columns.tolist()]

        result = {
            "success": True,
            "data": data_records,
            "columns": columns_list,
            "rowCount": len(result_df),
        }

        return result
    except Exception as e:
        logger.error(f"简单SQL执行失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"简单SQL执行失败: {str(e)}")


@router.post("/api/multi_table_query", tags=["Query"])
async def multi_table_query(request: dict = Body(...)):
    """多表查询API，支持JOIN操作"""
    con = get_db_connection()

    try:
        files = request.get("files", [])
        sql_query = request.get("sql", "")

        logger.info(f"多表查询: {sql_query}")
        logger.info(f"涉及文件: {files}")

        # 注册所有文件到DuckDB
        temp_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "temp_files"
        )

        for filename in files:
            file_path = os.path.join(temp_dir, filename)
            if not os.path.exists(file_path):
                raise ValueError(f"文件不存在: {filename}")

            table_name = filename.split(".")[0]  # 使用文件名作为表名

            if file_path.endswith(".csv"):
                df = pd.read_csv(file_path)
            elif file_path.endswith((".xls", ".xlsx")):
                df = pd.read_excel(file_path)
            else:
                raise ValueError(f"不支持的文件类型: {filename}")

            con.register(table_name, df)
            logger.info(f"已注册表: {table_name}, 行数: {len(df)}")

        # 执行SQL查询
        result_df = execute_query(sql_query, con)
        logger.info(f"多表查询执行完成，结果形状: {result_df.shape}")

        # 处理数据类型
        result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        result_df = result_df.astype(object).where(pd.notnull(result_df), None)

        for col in result_df.columns:
            if result_df[col].dtype == "object":
                result_df[col] = result_df[col].astype(str)

        data_records = result_df.to_dict(orient="records")
        columns_list = [str(col) for col in result_df.columns.tolist()]

        result = {
            "success": True,
            "data": data_records,
            "columns": columns_list,
            "rowCount": len(result_df),
        }

        return result
    except Exception as e:
        logger.error(f"多表查询失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"多表查询失败: {str(e)}")


@router.post("/api/export_simple", tags=["Query"])
async def export_simple(request: dict = Body(...)):
    """简化的数据导出API"""
    con = get_db_connection()

    try:
        filename = request.get("filename", "")
        sql_query = request.get("sql", "SELECT * FROM table_name LIMIT 100")
        export_format = request.get("format", "excel")  # excel, csv

        if not filename:
            raise ValueError("缺少文件名参数")

        if not sql_query or sql_query.strip() == "":
            raise ValueError("SQL查询不能为空")

        # 注册文件到DuckDB
        temp_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "temp_files"
        )
        file_path = os.path.join(temp_dir, filename)

        if not os.path.exists(file_path):
            raise ValueError(f"文件不存在: {filename}")

        table_name = filename.split(".")[0]

        if file_path.endswith(".csv"):
            df = pd.read_csv(file_path)
        elif file_path.endswith((".xls", ".xlsx")):
            df = pd.read_excel(file_path)
        else:
            raise ValueError(f"不支持的文件类型: {filename}")

        con.register(table_name, df)

        # 执行查询
        result_df = execute_query(sql_query, con)

        # 导出数据
        if export_format.lower() == "excel":
            try:
                output = io.BytesIO()
                with pd.ExcelWriter(output, engine="openpyxl") as writer:
                    result_df.to_excel(writer, index=False, sheet_name="Data")
                output.seek(0)

                return StreamingResponse(
                    io.BytesIO(output.read()),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={
                        "Content-Disposition": f"attachment; filename=export_{table_name}.xlsx"
                    },
                )
            except Exception as excel_error:
                logger.warning(f"Excel导出失败，降级为JSON: {excel_error}")
                # 如果Excel导出失败，降级为JSON格式
                return {
                    "success": True,
                    "data": result_df.to_dict(orient="records"),
                    "columns": result_df.columns.tolist(),
                    "rowCount": len(result_df),
                    "message": f"Excel导出失败，已转为JSON格式: {str(excel_error)}",
                }

        elif export_format.lower() == "csv":
            output = io.StringIO()
            result_df.to_csv(output, index=False)
            output.seek(0)

            return StreamingResponse(
                io.BytesIO(output.getvalue().encode("utf-8")),
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename=export_{table_name}.csv"
                },
            )

        else:
            return {
                "success": True,
                "data": result_df.to_dict(orient="records"),
                "columns": result_df.columns.tolist(),
                "rowCount": len(result_df),
                "message": "数据导出成功（JSON格式）",
            }

    except Exception as e:
        logger.error(f"数据导出失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"数据导出失败: {str(e)}")


@router.post("/api/save_query_result_as_datasource", tags=["Query"])
async def save_query_result_as_datasource(request: dict = Body(...)):
    """将SQL查询结果保存为新的数据源"""
    con = get_db_connection()
    sql_query = request.get("sql", "")
    datasource_name = request.get("datasource_name", "")
    original_datasource = request.get("datasource", {})

    try:
        logger.info(f"保存查询结果为数据源: {datasource_name}")

        # 验证输入参数
        if not sql_query or sql_query.strip() == "":
            raise ValueError("SQL查询不能为空")

        if not datasource_name or datasource_name.strip() == "":
            raise ValueError("数据源名称不能为空")

        # 首先注册原始数据源（如果需要）
        if original_datasource:
            await register_datasource_for_query(con, original_datasource)

        # 执行SQL查询获取结果
        result_df = execute_query(sql_query, con)

        if result_df.empty:
            raise ValueError("查询结果为空，无法保存为数据源")

        # 生成唯一的数据源ID
        import uuid

        datasource_id = f"query_result_{uuid.uuid4().hex[:8]}"

        # 将查询结果注册为新的数据源
        con.register(datasource_id, result_df)

        # 保存到临时文件以便持久化
        temp_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "temp_files"
        )
        os.makedirs(temp_dir, exist_ok=True)

        # 保存为CSV文件
        csv_filename = f"{datasource_id}.csv"
        csv_path = os.path.join(temp_dir, csv_filename)
        result_df.to_csv(csv_path, index=False)

        logger.info(f"查询结果已保存为数据源: {datasource_id}, 文件: {csv_filename}")

        return {
            "success": True,
            "message": f"查询结果已保存为数据源: {datasource_name}",
            "datasource_id": datasource_id,
            "datasource_name": datasource_name,
            "filename": csv_filename,
            "rowCount": len(result_df),
            "columns": result_df.columns.tolist(),
            "datasource": {
                "id": datasource_id,
                "name": datasource_name,
                "type": "file",
                "filename": csv_filename,
                "status": "active",
            },
        }

    except Exception as e:
        logger.error(f"保存查询结果失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"保存查询结果失败: {str(e)}")


async def register_datasource_for_query(con, datasource):
    """为查询注册数据源的辅助函数"""
    try:
        if datasource.get("type") == "file":
            # 处理文件数据源
            filename = datasource.get("filename", "")
            if filename:
                temp_dir = os.path.join(
                    os.path.dirname(os.path.dirname(__file__)), "temp_files"
                )
                file_path = os.path.join(temp_dir, filename)

                if os.path.exists(file_path):
                    if file_path.endswith(".csv"):
                        df = pd.read_csv(file_path)
                    elif file_path.endswith((".xls", ".xlsx")):
                        df = pd.read_excel(file_path)
                    else:
                        raise ValueError("不支持的文件类型")

                    con.register(datasource["id"], df)
                    logger.info(f"已注册文件数据源: {datasource['id']}")

        elif datasource.get("type") == "database":
            # 处理数据库数据源
            from core.database_manager import db_manager

            connection_id = datasource.get("connection_id")
            if connection_id:
                query = datasource.get("query", "SELECT * FROM table LIMIT 1000")
                df = db_manager.execute_query(connection_id, query)
                create_varchar_table_from_dataframe(datasource["id"], df, con)
                logger.info(f"已创建持久化数据库数据源: {datasource['id']}")

    except Exception as e:
        logger.error(f"注册数据源失败: {str(e)}")
        raise


@router.get("/api/available_tables", tags=["Query"])
async def get_available_tables():
    """获取当前可用的表名列表，用于SQL查询提示"""
    con = get_db_connection()

    try:
        # 获取DuckDB中当前注册的所有表
        tables_df = con.execute("SHOW TABLES").fetchdf()
        table_names = tables_df["name"].tolist() if not tables_df.empty else []

        logger.info(f"当前可用表: {table_names}")

        return {"success": True, "tables": table_names, "count": len(table_names)}

    except Exception as e:
        logger.error(f"获取表列表失败: {str(e)}")
        return {"success": False, "tables": [], "count": 0, "error": str(e)}


@router.post("/api/export/quick", tags=["Query"])
async def quick_export(request: dict = Body(...)):
    """快速导出查询结果为Excel文件"""
    try:
        logger.info(f"快速导出请求: {request}")

        # 获取请求参数
        data = request.get("data", [])
        columns = request.get("columns", [])
        filename = request.get("filename", "export_data")

        if not data:
            raise HTTPException(status_code=400, detail="没有数据可导出")

        if not columns:
            raise HTTPException(status_code=400, detail="缺少列信息")

        # 将数据转换为DataFrame
        import pandas as pd

        df = pd.DataFrame(data, columns=columns)

        # 处理数据类型和空值
        df.replace([np.inf, -np.inf], np.nan, inplace=True)
        df = df.where(pd.notnull(df), None)

        # 生成Excel文件
        output = io.BytesIO()
        try:
            # 处理字符编码问题：确保所有文本列都是UTF-8编码
            def safe_encode_text(x):
                if x is None or pd.isna(x):
                    return None
                try:
                    if isinstance(x, bytes):
                        # 如果是bytes，尝试解码为unicode
                        for encoding in ["utf-8", "gbk", "gb2312", "latin1"]:
                            try:
                                return x.decode(encoding)
                            except UnicodeDecodeError:
                                continue
                        # 如果所有编码都失败，使用错误处理
                        return x.decode("utf-8", errors="replace")
                    else:
                        # 确保是字符串，并替换不可打印字符
                        text = str(x)
                        # 移除或替换控制字符和不可见字符
                        import re

                        text = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", text)
                        return text
                except Exception:
                    return str(x) if x is not None else None

            # 对所有object类型的列应用编码修复
            for col in df.columns:
                if df[col].dtype == "object":
                    df[col] = df[col].apply(safe_encode_text)

            with pd.ExcelWriter(output, engine="openpyxl") as writer:
                df.to_excel(writer, index=False, sheet_name="Data")
            output.seek(0)

            # 验证生成的Excel文件
            if output.getvalue() == b"":
                raise ValueError("生成的Excel文件为空")

            logger.info(f"Excel文件生成成功，大小: {len(output.getvalue())} bytes")

        except Exception as e:
            logger.error(f"Excel文件生成失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Excel文件生成失败: {str(e)}")

        # 生成安全的文件名，确保只包含ASCII字符
        import re
        import urllib.parse

        # 移除或替换非ASCII字符
        safe_filename = re.sub(r"[^\w\-_.]", "_", filename)
        # 确保文件名只包含ASCII字符
        safe_filename = safe_filename.encode("ascii", "ignore").decode("ascii")
        if not safe_filename.endswith(".xlsx"):
            safe_filename += ".xlsx"

        # 如果文件名为空或只有扩展名，使用默认名称
        if not safe_filename or safe_filename == ".xlsx":
            safe_filename = "export_data.xlsx"

        # 使用RFC 6266标准的文件名编码
        encoded_filename = urllib.parse.quote(safe_filename)

        # 返回文件流
        headers = {
            "Content-Disposition": f"attachment; filename=\"{safe_filename}\"; filename*=UTF-8''{encoded_filename}",
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }

        return StreamingResponse(
            io.BytesIO(output.getvalue()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"快速导出失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"快速导出失败: {str(e)}")
