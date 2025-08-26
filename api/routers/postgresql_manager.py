"""
PostgreSQL连接和查询管理器
提供PostgreSQL连接管理、查询执行等功能
"""

from fastapi import HTTPException
from typing import Dict, Any, List
import pandas as pd
import logging
import traceback
import json
import os
import time
import psycopg2
from sqlalchemy import create_engine

from core.duckdb_engine import (
    get_db_connection,
    create_persistent_table,
    create_varchar_table_from_dataframe,
)
from core.security import security_validator, mask_sensitive_config
from core.config_manager import config_manager
from core.cache_manager import query_cache, cache_manager
from core.exceptions import (
    ResourceNotFoundError,
    DatabaseConnectionError,
    QueryExecutionError,
    ValidationError,
)
from models.query_models import (
    DataSourceType,
    ConnectionTestRequest,
    ConnectionTestResponse,
)

# 设置日志
logger = logging.getLogger(__name__)

class PostgreSQLManager:
    """PostgreSQL连接和查询管理器"""

    def __init__(self):
        self.configs = {}
        self.load_configs()

    def load_configs(self) -> Dict[str, Any]:
        """加载PostgreSQL配置文件"""
        try:
            # 使用统一的配置读取函数
            from routers.postgresql_configs import read_postgresql_configs

            postgresql_configs_list = read_postgresql_configs()

            # 转换为兼容格式
            self.configs = {}
            for config in postgresql_configs_list:
                self.configs[config["id"]] = {
                    "id": config["id"],
                    "name": config.get("name", config["id"]),
                    "params": config["params"],
                }

            logger.info(f"成功加载 {len(self.configs)} 个PostgreSQL配置")
            return self.configs
        except Exception as e:
            logger.error(f"加载PostgreSQL配置失败: {str(e)}")
            return {}

    def get_connection_info(self, connection_id: str) -> Dict[str, Any]:
        """根据连接ID获取PostgreSQL连接信息"""
        if connection_id not in self.configs:
            raise ResourceNotFoundError("PostgreSQL连接配置", connection_id)

        return self.configs[connection_id]

    def test_connection(self, connection_id: str) -> ConnectionTestResponse:
        """测试PostgreSQL连接"""
        try:
            config = self.get_connection_info(connection_id)
            params = config["params"]
            app_config = config_manager.get_app_config()

            # 支持 user 和 username 两种参数名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("缺少用户名参数 (user 或 username)")

            # 测试连接
            connection = psycopg2.connect(
                host=params.get("host"),
                port=params.get("port", 5432),
                user=username,
                password=params.get("password"),
                database=params.get("database"),
                connect_timeout=app_config.query_timeout, # 使用配置的超时
            )

            with connection.cursor() as cursor:
                cursor.execute("SELECT version()")
                version = cursor.fetchone()[0]

            connection.close()

            return ConnectionTestResponse(
                success=True,
                message=f"连接成功，PostgreSQL版本: {version}",
                connection_time=0.0,
                server_info={"version": version},
            )

        except Exception as e:
            logger.error(f"PostgreSQL连接测试失败 {connection_id}: {str(e)}")
            return ConnectionTestResponse(
                success=False, message=f"连接失败: {str(e)}", connection_time=0.0
            )

    def execute_query(
        self, connection_id: str, sql: str, limit: int
    ) -> pd.DataFrame:
        """执行PostgreSQL查询"""
        try:
            # 验证SQL安全性
            validation_result = security_validator.validate_sql_query(
                sql, allow_write_operations=False
            )
            if not validation_result["valid"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"SQL验证失败: {'; '.join(validation_result['errors'])}",
                )

            # 使用验证后的SQL
            safe_sql = validation_result["sanitized_sql"]
            sql_upper = safe_sql.upper().strip()

            # 自动添加LIMIT限制（如果SQL中没有LIMIT）
            if "LIMIT" not in sql_upper and limit > 0:
                safe_sql = f"{safe_sql.rstrip(';')} LIMIT {limit}"

            config = self.get_connection_info(connection_id)
            params = config["params"]
            app_config = config_manager.get_app_config()

            # 检查缓存
            cached_result = query_cache.get_cached_query_result(safe_sql, params)
            if cached_result is not None:
                logger.info(f"使用缓存结果，{len(cached_result)} 行")
                return cached_result

            # 支持 user 和 username 两种参数名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("缺少用户名参数 (user 或 username)")

            # 创建连接字符串
            connection_str = (
                f"postgresql+psycopg2://{username}:{params['password']}"
                f"@{params['host']}:{params.get('port', 5432)}/{params['database']}"
            )

            # 记录安全的连接信息（不包含密码）
            safe_connection_info = f"postgresql://{username}@{params['host']}:{params.get('port', 5432)}/{params['database']}"
            logger.info(f"执行PostgreSQL查询: {safe_connection_info}")

            start_time = time.time()
            engine = create_engine(
                connection_str,
                connect_args={"connect_timeout": app_config.query_timeout}
            )
            df = pd.read_sql(safe_sql, engine)
            execution_time = (time.time() - start_time) * 1000

            # 数据清理
            for col in df.columns:
                if df[col].dtype == "object":
                    df[col] = df[col].fillna("").astype(str)

            # 缓存结果（如果查询时间较长）
            if execution_time > 100:  # 超过100ms的查询才缓存
                cache_ttl = 3600 if execution_time > 1000 else 1800  # 慢查询缓存更久
                query_cache.cache_query_result(safe_sql, df, params, cache_ttl)

            logger.info(f"查询成功，返回 {len(df)} 行数据，耗时 {execution_time:.2f}ms")
            return df

        except Exception as e:
            logger.error(f"PostgreSQL查询执行失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"查询执行失败: {str(e)}")

    def save_query_result_to_duckdb(
        self, connection_id: str, sql: str, table_name: str
    ) -> Dict[str, Any]:
        """执行PostgreSQL查询并保存结果到DuckDB"""
        try:
            app_config = config_manager.get_app_config()
            # 执行查询时使用配置中的行数限制
            df = self.execute_query(connection_id, sql, app_config.max_query_rows)

            # 保存到DuckDB
            duckdb_con = get_db_connection()
            success = create_varchar_table_from_dataframe(table_name, df, duckdb_con)

            if success:
                return {
                    "success": True,
                    "message": f"查询结果已保存到表 {table_name}",
                    "table_name": table_name,
                    "row_count": len(df),
                    "columns": df.columns.tolist(),
                }
            else:
                raise Exception("保存到DuckDB失败")

        except Exception as e:
            logger.error(f"保存查询结果失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


# 全局PostgreSQL管理器实例
postgresql_manager = PostgreSQLManager()