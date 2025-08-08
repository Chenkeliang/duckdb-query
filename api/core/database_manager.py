"""
数据库连接管理器
提供数据库连接池管理、连接测试、健康检查等功能
"""

import asyncio
import time
import logging
from typing import Dict, Any, Optional, List
from sqlalchemy import create_engine, text
from sqlalchemy.pool import QueuePool
from sqlalchemy.exc import SQLAlchemyError
import pandas as pd
import sqlite3
import psycopg2
import pymysql
from contextlib import contextmanager

from models.query_models import (
    DataSourceType,
    ConnectionStatus,
    ConnectionTestRequest,
    ConnectionTestResponse,
    DatabaseConnection,
)
from core.encryption import password_encryptor

logger = logging.getLogger(__name__)


class DatabaseManager:
    """数据库连接管理器"""

    def __init__(self):
        self.connections: Dict[str, DatabaseConnection] = {}
        self.engines: Dict[str, Any] = {}
        self.connection_pools: Dict[str, Any] = {}

    def add_connection(self, connection: DatabaseConnection) -> bool:
        """添加数据库连接配置"""
        try:
            # 测试连接
            test_result = self.test_connection(
                ConnectionTestRequest(type=connection.type, params=connection.params)
            )

            if test_result.success:
                # 创建连接引擎
                engine = self._create_engine(connection.type, connection.params)

                self.connections[connection.id] = connection
                self.engines[connection.id] = engine

                connection.status = ConnectionStatus.ACTIVE
                logger.info(f"成功添加数据库连接: {connection.id}")
                return True
            else:
                connection.status = ConnectionStatus.ERROR
                logger.error(f"连接测试失败: {test_result.message}")
                return False

        except Exception as e:
            logger.error(f"添加数据库连接失败: {str(e)}")
            connection.status = ConnectionStatus.ERROR
            return False

    def remove_connection(self, connection_id: str) -> bool:
        """移除数据库连接"""
        try:
            if connection_id in self.engines:
                self.engines[connection_id].dispose()
                del self.engines[connection_id]

            if connection_id in self.connections:
                del self.connections[connection_id]

            if connection_id in self.connection_pools:
                del self.connection_pools[connection_id]

            logger.info(f"成功移除数据库连接: {connection_id}")
            return True

        except Exception as e:
            logger.error(f"移除数据库连接失败: {str(e)}")
            return False

    def get_connection(self, connection_id: str) -> Optional[DatabaseConnection]:
        """获取数据库连接配置"""
        return self.connections.get(connection_id)

    def list_connections(self) -> List[DatabaseConnection]:
        """列出所有数据库连接"""
        return list(self.connections.values())

    def test_connection(self, request: ConnectionTestRequest) -> ConnectionTestResponse:
        """测试数据库连接"""
        start_time = time.time()

        try:
            if request.type == DataSourceType.MYSQL:
                return self._test_mysql_connection(request.params, start_time)
            elif request.type == DataSourceType.POSTGRESQL:
                return self._test_postgresql_connection(request.params, start_time)
            elif request.type == DataSourceType.SQLITE:
                return self._test_sqlite_connection(request.params, start_time)
            else:
                return ConnectionTestResponse(
                    success=False, message=f"不支持的数据库类型: {request.type}"
                )

        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return ConnectionTestResponse(
                success=False, message=f"连接测试失败: {str(e)}", latency_ms=latency
            )

    def _test_mysql_connection(
        self, params: Dict[str, Any], start_time: float
    ) -> ConnectionTestResponse:
        """测试MySQL连接"""
        try:
            # 支持 user 和 username 两种参数名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("缺少用户名参数 (user 或 username)")

            # 解密密码
            password = params.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)
                logger.info("密码已解密用于连接测试")

            connection = pymysql.connect(
                host=params.get("host"),
                port=params.get("port", 3306),
                user=username,
                password=password,
                database=params.get("database"),
                connect_timeout=10,
            )

            with connection.cursor() as cursor:
                cursor.execute("SELECT VERSION()")
                version = cursor.fetchone()[0]

            connection.close()
            latency = (time.time() - start_time) * 1000

            return ConnectionTestResponse(
                success=True,
                message="MySQL连接成功",
                latency_ms=latency,
                database_info={"version": version, "type": "MySQL"},
            )

        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return ConnectionTestResponse(
                success=False, message=f"MySQL连接失败: {str(e)}", latency_ms=latency
            )

    def _test_postgresql_connection(
        self, params: Dict[str, Any], start_time: float
    ) -> ConnectionTestResponse:
        """测试PostgreSQL连接"""
        try:
            # 支持 user 和 username 两种参数名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("缺少用户名参数 (user 或 username)")

            # 解密密码
            password = params.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)
                logger.info("密码已解密用于PostgreSQL连接测试")

            connection = psycopg2.connect(
                host=params.get("host"),
                port=params.get("port", 5432),
                user=username,
                password=password,
                database=params.get("database"),
                connect_timeout=10,
            )

            with connection.cursor() as cursor:
                cursor.execute("SELECT version()")
                version = cursor.fetchone()[0]

            connection.close()
            latency = (time.time() - start_time) * 1000

            return ConnectionTestResponse(
                success=True,
                message="PostgreSQL连接成功",
                latency_ms=latency,
                database_info={"version": version, "type": "PostgreSQL"},
            )

        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return ConnectionTestResponse(
                success=False,
                message=f"PostgreSQL连接失败: {str(e)}",
                latency_ms=latency,
            )

    def _test_sqlite_connection(
        self, params: Dict[str, Any], start_time: float
    ) -> ConnectionTestResponse:
        """测试SQLite连接"""
        try:
            db_path = params.get("database", ":memory:")
            connection = sqlite3.connect(db_path, timeout=10)

            cursor = connection.cursor()
            cursor.execute("SELECT sqlite_version()")
            version = cursor.fetchone()[0]

            connection.close()
            latency = (time.time() - start_time) * 1000

            return ConnectionTestResponse(
                success=True,
                message="SQLite连接成功",
                latency_ms=latency,
                database_info={"version": version, "type": "SQLite"},
            )

        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return ConnectionTestResponse(
                success=False, message=f"SQLite连接失败: {str(e)}", latency_ms=latency
            )

    def _create_engine(self, db_type: DataSourceType, params: Dict[str, Any]):
        """创建SQLAlchemy引擎"""
        if db_type == DataSourceType.MYSQL:
            # 支持 user 和 username 两种参数名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("缺少用户名参数 (user 或 username)")

            # 解密密码
            password = params.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)

            connection_string = (
                f"mysql+pymysql://{username}:{password}"
                f"@{params['host']}:{params.get('port', 3306)}/{params['database']}"
            )
        elif db_type == DataSourceType.POSTGRESQL:
            # 支持 user 和 username 两种参数名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("缺少用户名参数 (user 或 username)")

            # 解密密码
            password = params.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)

            connection_string = (
                f"postgresql+psycopg2://{username}:{password}"
                f"@{params['host']}:{params.get('port', 5432)}/{params['database']}"
            )
        elif db_type == DataSourceType.SQLITE:
            db_path = params.get("database", ":memory:")
            connection_string = f"sqlite:///{db_path}"
        else:
            raise ValueError(f"不支持的数据库类型: {db_type}")

        return create_engine(
            connection_string,
            poolclass=QueuePool,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            pool_recycle=3600,
        )

    def execute_query(self, connection_id: str, query: str) -> pd.DataFrame:
        """执行数据库查询"""
        if connection_id not in self.engines:
            raise ValueError(f"连接不存在: {connection_id}")

        engine = self.engines[connection_id]

        try:
            return pd.read_sql(query, engine)
        except Exception as e:
            logger.error(f"查询执行失败: {str(e)}")
            raise

    @contextmanager
    def get_engine(self, connection_id: str):
        """获取数据库引擎的上下文管理器"""
        if connection_id not in self.engines:
            raise ValueError(f"连接不存在: {connection_id}")

        engine = self.engines[connection_id]
        try:
            yield engine
        finally:
            # 这里可以添加清理逻辑
            pass


# 全局数据库管理器实例
db_manager = DatabaseManager()
