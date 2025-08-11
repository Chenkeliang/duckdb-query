"""
统一的MySQL路由模块
合并了原有的多个MySQL路由模块功能，提供统一的MySQL数据源管理和查询接口
"""

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, Any, List, Optional
import pandas as pd
import logging
import traceback
import json
import os
import time
from typing import Dict, Any, List, Optional
from sqlalchemy import create_engine
import pymysql
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

router = APIRouter()


class MySQLManager:
    """MySQL连接和查询管理器"""

    def __init__(self):
        self.configs = {}
        self.load_configs()

    def load_configs(self) -> Dict[str, Any]:
        """加载MySQL配置文件"""
        try:
            # 使用统一的配置读取函数（包含解密逻辑）
            from routers.data_sources import read_mysql_configs

            mysql_configs_list = read_mysql_configs()

            # 转换为兼容格式
            self.configs = {}
            for config in mysql_configs_list:
                self.configs[config["id"]] = {
                    "id": config["id"],
                    "name": config.get("name", config["id"]),
                    "params": config["params"],
                }

            logger.info(f"成功加载 {len(self.configs)} 个MySQL配置")
            return self.configs
        except Exception as e:
            logger.error(f"加载MySQL配置失败: {str(e)}")
            return {}

    def get_connection_info(self, connection_id: str) -> Dict[str, Any]:
        """根据连接ID获取MySQL连接信息"""
        if connection_id not in self.configs:
            raise ResourceNotFoundError("MySQL连接配置", connection_id)

        return self.configs[connection_id]

    def test_connection(self, connection_id: str) -> ConnectionTestResponse:
        """测试MySQL连接"""
        try:
            config = self.get_connection_info(connection_id)
            params = config["params"]
            app_config = config_manager.get_app_config()

            # 支持 user 和 username 两种参数名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("缺少用户名参数 (user 或 username)")

            # 测试连接
            connection = pymysql.connect(
                host=params.get("host"),
                port=params.get("port", 3306),
                user=username,
                password=params.get("password"),
                database=params.get("database"),
                connect_timeout=app_config.query_timeout, # 使用配置的超时
                charset="utf8mb4",
            )

            with connection.cursor() as cursor:
                cursor.execute("SELECT VERSION()")
                version = cursor.fetchone()[0]

            connection.close()

            return ConnectionTestResponse(
                success=True,
                message=f"连接成功，MySQL版本: {version}",
                connection_time=0.0,
                server_info={"version": version},
            )

        except Exception as e:
            logger.error(f"MySQL连接测试失败 {connection_id}: {str(e)}")
            return ConnectionTestResponse(
                success=False, message=f"连接失败: {str(e)}", connection_time=0.0
            )

    def execute_query(
        self, connection_id: str, sql: str, limit: int
    ) -> pd.DataFrame:
        """执行MySQL查询"""
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
                f"mysql+pymysql://{username}:{params['password']}"
                f"@{params['host']}:{params.get('port', 3306)}/{params['database']}"
                "?charset=utf8mb4"
            )

            # 记录安全的连接信息（不包含密码）
            safe_connection_info = f"mysql://{username}@{params['host']}:{params.get('port', 3306)}/{params['database']}"
            logger.info(f"执行MySQL查询: {safe_connection_info}")

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
            logger.error(f"MySQL查询执行失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"查询执行失败: {str(e)}")

    def save_query_result_to_duckdb(
        self, connection_id: str, sql: str, table_name: str
    ) -> Dict[str, Any]:
        """执行MySQL查询并保存结果到DuckDB"""
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


# 全局MySQL管理器实例
mysql_manager = MySQLManager()


@router.get("/api/mysql/connections", tags=["MySQL"])
async def list_mysql_connections():
    """获取所有MySQL连接配置"""
    try:
        mysql_manager.load_configs()  # 重新加载配置

        # 返回遮蔽敏感信息的配置
        safe_configs = []
        for config_id, config in mysql_manager.configs.items():
            safe_config = {
                "id": config_id,
                "name": config.get("name", config_id),
                "params": mask_sensitive_config(config["params"]),
            }
            safe_configs.append(safe_config)

        return {
            "success": True,
            "connections": safe_configs,
            "count": len(safe_configs),
        }
    except Exception as e:
        logger.error(f"获取MySQL连接列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取连接列表失败: {str(e)}")


@router.post("/api/mysql/test_connection", tags=["MySQL"])
async def test_mysql_connection(request: dict = Body(...)):
    """测试MySQL连接"""
    try:
        connection_id = request.get("connection_id")
        if not connection_id:
            raise HTTPException(status_code=400, detail="缺少connection_id参数")

        result = mysql_manager.test_connection(connection_id)
        return result.dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"测试MySQL连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"连接测试失败: {str(e)}")


@router.post("/api/mysql/query", tags=["MySQL"])
async def execute_mysql_query(request: dict = Body(...)):
    """执行MySQL查询"""
    try:
        app_config = config_manager.get_app_config()
        connection_id = request.get("connection_id")
        sql = request.get("sql")
        limit = request.get("limit", app_config.max_query_rows)

        if not connection_id:
            raise HTTPException(status_code=400, detail="缺少connection_id参数")
        if not sql:
            raise HTTPException(status_code=400, detail="缺少sql参数")

        df = mysql_manager.execute_query(connection_id, sql, limit)

        return {
            "success": True,
            "data": df.to_dict(orient="records"),
            "columns": df.columns.tolist(),
            "row_count": len(df),
            "sql_executed": sql,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"MySQL查询失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.post("/api/mysql/save_to_duckdb", tags=["MySQL"])
async def save_mysql_query_to_duckdb(request: dict = Body(...)):
    """执行MySQL查询并保存结果到DuckDB"""
    try:
        connection_id = request.get("connection_id")
        sql = request.get("sql")
        table_name = request.get("table_name")

        if not connection_id:
            raise HTTPException(status_code=400, detail="缺少connection_id参数")
        if not sql:
            raise HTTPException(status_code=400, detail="缺少sql参数")
        if not table_name:
            raise HTTPException(status_code=400, detail="缺少table_name参数")

        result = mysql_manager.save_query_result_to_duckdb(
            connection_id, sql, table_name
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"保存MySQL查询结果失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


@router.get("/api/cache/stats", tags=["Cache"])
async def get_cache_stats():
    """获取缓存统计信息"""
    try:
        stats = cache_manager.get_stats()
        return {"success": True, "stats": stats}
    except Exception as e:
        logger.error(f"获取缓存统计失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取统计失败: {str(e)}")


@router.post("/api/cache/clear", tags=["Cache"])
async def clear_cache():
    """清空所有缓存"""
    try:
        success = cache_manager.clear()
        return {
            "success": success,
            "message": "缓存已清空" if success else "清空缓存失败",
        }
    except Exception as e:
        logger.error(f"清空缓存失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"清空缓存失败: {str(e)}")


@router.post("/api/cache/cleanup", tags=["Cache"])
async def cleanup_expired_cache():
    """清理过期缓存"""
    try:
        cleaned_count = cache_manager.cleanup_expired()
        return {
            "success": True,
            "cleaned_count": cleaned_count,
            "message": f"清理了 {cleaned_count} 个过期缓存项",
        }
    except Exception as e:
        logger.error(f"清理过期缓存失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"清理失败: {str(e)}")