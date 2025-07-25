import duckdb
import logging
import pandas as pd
import time
from typing import List, Dict, Any, Optional, Tuple
import re
from collections import defaultdict

from models.query_models import (
    QueryRequest,
    Join,
    JoinType,
    JoinCondition,
    MultiTableJoin,
    DataSource
)

logger = logging.getLogger(__name__)

# 创建一个全局的DuckDB连接实例，确保在整个应用程序中共享
_global_duckdb_connection = None


def get_db_connection():
    """
    获取DuckDB连接的单例实例
    """
    global _global_duckdb_connection
    if _global_duckdb_connection is None:
        logger.info("创建新的DuckDB连接...")
        # 使用持久化文件而不是内存模式
        db_path = "/app/data/duckdb/main.db"

        # 确保目录存在
        import os
        os.makedirs(os.path.dirname(db_path), exist_ok=True)

        _global_duckdb_connection = duckdb.connect(database=db_path)
        logger.info(f"DuckDB连接到持久化文件: {db_path}")

        # 设置DuckDB优化参数
        _global_duckdb_connection.execute("SET threads=4")
        _global_duckdb_connection.execute("SET memory_limit='2GB'")
    return _global_duckdb_connection


def execute_query(query, con=None):
    """
    在DuckDB中执行查询
    """
    if con is None:
        con = get_db_connection()

    logger.info(f"执行DuckDB查询: {query}")
    start_time = time.time()

    try:
        # 先获取表列表，用于调试
        tables = con.execute("SHOW TABLES").fetchdf()
        logger.info(f"当前DuckDB中的表: {tables.to_string()}")

        # 执行查询
        result = con.execute(query).fetchdf()

        execution_time = (time.time() - start_time) * 1000
        logger.info(f"查询执行完成，耗时: {execution_time:.2f}ms，返回 {len(result)} 行")

        return result
    except Exception as e:
        execution_time = (time.time() - start_time) * 1000
        logger.error(f"DuckDB查询执行失败 (耗时: {execution_time:.2f}ms): {str(e)}")
        raise


def register_dataframe(table_name: str, df: pd.DataFrame, con=None) -> bool:
    """
    将DataFrame注册到DuckDB
    """
    if con is None:
        con = get_db_connection()

    try:
        con.register(table_name, df)
        logger.info(f"成功注册表: {table_name}, 行数: {len(df)}, 列数: {len(df.columns)}")
        return True
    except Exception as e:
        logger.error(f"注册表失败 {table_name}: {str(e)}")
        return False


def get_table_info(table_name: str, con=None) -> Dict[str, Any]:
    """
    获取表的信息
    """
    if con is None:
        con = get_db_connection()

    try:
        # 获取表结构
        schema_query = f"DESCRIBE {table_name}"
        schema_df = con.execute(schema_query).fetchdf()

        # 获取行数
        count_query = f"SELECT COUNT(*) as row_count FROM {table_name}"
        count_result = con.execute(count_query).fetchone()
        row_count = count_result[0] if count_result else 0

        return {
            "table_name": table_name,
            "columns": schema_df.to_dict('records'),
            "row_count": row_count
        }
    except Exception as e:
        logger.error(f"获取表信息失败 {table_name}: {str(e)}")
        return {}


def detect_column_conflicts(sources: List[DataSource]) -> Dict[str, List[str]]:
    """
    检测多个数据源之间的列名冲突
    """
    column_sources = defaultdict(list)

    for source in sources:
        if source.columns:
            for column in source.columns:
                column_sources[column].append(source.id)

    # 找出冲突的列名
    conflicts = {col: source_list for col, source_list in column_sources.items()
                if len(source_list) > 1}

    return conflicts


def generate_column_aliases(sources: List[DataSource]) -> Dict[str, Dict[str, str]]:
    """
    为冲突的列名生成别名
    """
    conflicts = detect_column_conflicts(sources)
    aliases = {}

    for source in sources:
        source_aliases = {}
        if source.columns:
            for column in source.columns:
                if column in conflicts:
                    # 生成别名：table_name_column_name
                    alias = f"{source.id}_{column}"
                    source_aliases[column] = alias
                else:
                    source_aliases[column] = column
        aliases[source.id] = source_aliases

    return aliases


def build_join_query(query_request: QueryRequest) -> str:
    """
    构建复杂的多表JOIN查询
    """
    sources = query_request.sources
    joins = query_request.joins

    if not sources:
        raise ValueError("至少需要一个数据源")

    if len(sources) == 1:
        # 单表查询
        return build_single_table_query(query_request)

    # 多表JOIN查询
    return build_multi_table_join_query(query_request)


def build_single_table_query(query_request: QueryRequest) -> str:
    """
    构建单表查询
    """
    source = query_request.sources[0]
    table_name = f'"{source.id}"'

    # 构建SELECT子句
    if query_request.select_columns:
        select_clause = ", ".join([f'"{col}"' for col in query_request.select_columns])
    else:
        select_clause = "*"

    query = f"SELECT {select_clause} FROM {table_name}"

    # 添加WHERE条件
    if query_request.where_conditions:
        query += f" WHERE {query_request.where_conditions}"

    # 添加ORDER BY
    if query_request.order_by:
        query += f" ORDER BY {query_request.order_by}"

    # 添加LIMIT
    if query_request.limit:
        query += f" LIMIT {query_request.limit}"

    return query


def build_multi_table_join_query(query_request: QueryRequest) -> str:
    """
    构建多表JOIN查询
    """
    sources = query_request.sources
    joins = query_request.joins

    # 生成列别名以处理冲突
    column_aliases = generate_column_aliases(sources)

    # 构建SELECT子句
    select_parts = []
    if query_request.select_columns:
        # 用户指定了要选择的列
        for col in query_request.select_columns:
            # 查找列属于哪个表
            found = False
            for source in sources:
                if source.columns and col in source.columns:
                    table_alias = source.id
                    column_alias = column_aliases[source.id][col]
                    select_parts.append(f'{table_alias}."{col}" AS "{column_alias}"')
                    found = True
                    break
            if not found:
                # 如果没找到，直接使用列名
                select_parts.append(f'"{col}"')
    else:
        # 选择所有列，使用别名避免冲突
        for source in sources:
            if source.columns:
                for col in source.columns:
                    table_alias = source.id
                    column_alias = column_aliases[source.id][col]
                    select_parts.append(f'{table_alias}."{col}" AS "{column_alias}"')

    select_clause = ", ".join(select_parts) if select_parts else "*"

    # 构建FROM子句和JOIN子句
    if not joins:
        # 没有JOIN条件，使用CROSS JOIN
        from_clause = f'"{sources[0].id}"'
        for source in sources[1:]:
            from_clause += f' CROSS JOIN "{source.id}"'
    else:
        # 有JOIN条件，构建JOIN链
        from_clause = build_join_chain(sources, joins)

    query = f"SELECT {select_clause} FROM {from_clause}"

    # 添加WHERE条件
    if query_request.where_conditions:
        query += f" WHERE {query_request.where_conditions}"

    # 添加ORDER BY
    if query_request.order_by:
        query += f" ORDER BY {query_request.order_by}"

    # 添加LIMIT
    if query_request.limit:
        query += f" LIMIT {query_request.limit}"

    return query


def build_join_chain(sources: List[DataSource], joins: List[Join]) -> str:
    """
    构建JOIN链
    """
    if not joins:
        return f'"{sources[0].id}"'

    # 创建表的映射
    source_map = {source.id: source for source in sources}

    # 从第一个JOIN开始构建
    first_join = joins[0]
    left_table = first_join.left_source_id
    right_table = first_join.right_source_id

    # 构建JOIN类型映射
    join_type_map = {
        JoinType.INNER: "INNER JOIN",
        JoinType.LEFT: "LEFT JOIN",
        JoinType.RIGHT: "RIGHT JOIN",
        JoinType.FULL_OUTER: "FULL OUTER JOIN",
        JoinType.CROSS: "CROSS JOIN"
    }

    # 开始构建查询
    from_clause = f'"{left_table}"'

    for join in joins:
        join_type_sql = join_type_map.get(join.join_type, "INNER JOIN")
        right_table = join.right_source_id

        from_clause += f' {join_type_sql} "{right_table}"'

        # 添加JOIN条件
        if join.join_type != JoinType.CROSS and join.conditions:
            conditions = []
            for condition in join.conditions:
                left_col = f'"{join.left_source_id}"."{condition.left_column}"'
                right_col = f'"{join.right_source_id}"."{condition.right_column}"'
                conditions.append(f"{left_col} {condition.operator} {right_col}")

            if conditions:
                from_clause += f" ON {' AND '.join(conditions)}"

    return from_clause


def optimize_query_plan(query: str, con=None) -> str:
    """
    优化查询计划
    """
    if con is None:
        con = get_db_connection()

    try:
        # 获取查询计划
        explain_query = f"EXPLAIN {query}"
        plan = con.execute(explain_query).fetchdf()
        logger.info(f"查询计划:\n{plan.to_string()}")

        # 这里可以添加查询优化逻辑
        # 例如：重新排序JOIN顺序、添加索引提示等

        return query
    except Exception as e:
        logger.warning(f"查询计划分析失败: {str(e)}")
        return query


def validate_query_syntax(query: str, con=None) -> Tuple[bool, str]:
    """
    验证查询语法
    """
    if con is None:
        con = get_db_connection()

    try:
        # 使用EXPLAIN来验证语法
        explain_query = f"EXPLAIN {query}"
        con.execute(explain_query)
        return True, "查询语法正确"
    except Exception as e:
        return False, f"查询语法错误: {str(e)}"
