import duckdb
import logging
import pandas as pd

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
        _global_duckdb_connection = duckdb.connect(database=":memory:")
    return _global_duckdb_connection


def execute_query(query, con=None):
    """
    在DuckDB中执行查询
    """
    if con is None:
        con = get_db_connection()

    logger.info(f"执行DuckDB查询: {query}")

    try:
        # 先获取表列表，用于调试
        tables = con.execute("SHOW TABLES").fetchdf()
        logger.info(f"当前DuckDB中的表: {tables.to_string()}")

        # 执行查询
        result = con.execute(query).fetchdf()
        return result
    except Exception as e:
        logger.error(f"DuckDB查询执行失败: {str(e)}")
        raise
