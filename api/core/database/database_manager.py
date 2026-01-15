"""
数据库连接管理器
提供数据库连接池管理、连接测试、健康检查等功能
"""

import asyncio
import json
import logging
import os
import sqlite3
import time
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

import pandas as pd
import psycopg2
import pymysql
from models.query_models import (
    ConnectionStatus,
    ConnectionTestRequest,
    ConnectionTestResponse,
    DatabaseConnection,
    DataSourceType,
)
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import QueuePool

from core.security.encryption import password_encryptor
from core.database.metadata_manager import metadata_manager

logger = logging.getLogger(__name__)


class DatabaseManager:
    """数据库连接管理器"""

    def __init__(self):
        self.connections: Dict[str, DatabaseConnection] = {}
        self.engines: Dict[str, Any] = {}
        self.connection_pools: Dict[str, Any] = {}
        self._config_loaded = False
        # 延迟加载配置，避免初始化顺序问题

    def _load_connections_from_config(self):
        """从 DuckDB 元数据表加载连接配置"""
        try:
            # 从 DuckDB 加载
            connections_data = metadata_manager.list_database_connections()

            logger.info(f"从 DuckDB 加载 {len(connections_data)} 个数据库连接")
            for conn_data in connections_data:
                try:
                    conn_type_str = conn_data.get("type")
                    conn_type = DataSourceType(conn_type_str) if conn_type_str else None

                    if not conn_type:
                        logger.warning(f"跳过类型无效的连接: {conn_data.get('id')}")
                        continue

                    status_str = conn_data.get("status")
                    try:
                        saved_status = (
                            ConnectionStatus(status_str)
                            if status_str
                            else ConnectionStatus.INACTIVE
                        )
                    except ValueError:
                        saved_status = ConnectionStatus.INACTIVE

                    connection = DatabaseConnection(
                        id=conn_data["id"],
                        name=conn_data.get("name", conn_data["id"]),
                        type=conn_type,
                        params=conn_data.get("params", {}),
                        status=saved_status,
                        created_at=conn_data.get("created_at"),
                        updated_at=conn_data.get("updated_at"),
                        last_tested=conn_data.get("last_tested"),
                    )
                    # 加载配置时不测试连接，提升启动速度
                    self.add_connection(
                        connection, test_connection=False, save_to_metadata=False
                    )
                except Exception as e:
                    logger.error(f"加载连接配置失败 {conn_data.get('id')}: {e}")

        except Exception as e:
            logger.error(f"从 DuckDB 加载连接配置失败: {e}")

        # 标记配置已加载
        self._config_loaded = True

    def add_connection(
        self,
        connection: DatabaseConnection,
        test_connection: bool = True,
        save_to_metadata: bool = True,
    ) -> bool:
        """添加数据库连接配置"""
        try:
            if test_connection:
                # 测试连接
                test_result = self.test_connection(
                    ConnectionTestRequest(
                        type=connection.type, params=connection.params
                    )
                )

                if test_result.success:
                    # 创建连接引擎
                    engine = self._create_engine(connection.type, connection.params)
                    self.engines[connection.id] = engine
                    connection.status = ConnectionStatus.ACTIVE
                    logger.info(f"成功添加数据库连接: {connection.id}")
                else:
                    connection.status = ConnectionStatus.ERROR
                    logger.warning(
                        f"连接测试失败: {test_result.message}，但仍添加到配置中"
                    )
            else:
                # 不测试连接，直接添加配置
                logger.info(f"添加数据库连接配置（未测试）: {connection.id}")

            # 无论测试是否成功，都添加到连接列表
            self.connections[connection.id] = connection

            # 保存到 DuckDB 元数据表
            if save_to_metadata:
                from datetime import datetime

                conn_data = {
                    "id": connection.id,
                    "name": connection.name,
                    "type": connection.type.value,
                    "params": connection.params,
                    "status": connection.status.value,
                    "created_at": connection.created_at or datetime.now(),
                    "updated_at": connection.updated_at or datetime.now(),
                    "last_tested": connection.last_tested,
                }
                success = metadata_manager.save_database_connection(conn_data)
                if success:
                    logger.info(f"连接配置已保存到 DuckDB: {connection.id}")
                else:
                    logger.error(f"保存连接配置到 DuckDB 失败: {connection.id}")

            return True

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

            # 从 DuckDB 元数据表删除
            success = metadata_manager.delete_database_connection(connection_id)
            if success:
                logger.info(f"成功移除数据库连接（包括元数据）: {connection_id}")
            else:
                logger.warning(f"从元数据表删除连接失败: {connection_id}")

            return True

        except Exception as e:
            logger.error(f"移除数据库连接失败: {str(e)}")
            return False

    def get_connection(self, connection_id: str) -> Optional[DatabaseConnection]:
        """获取数据库连接配置"""
        return self.connections.get(connection_id)

    def list_connections(self) -> List[DatabaseConnection]:
        """列出所有数据库连接"""
        # 确保配置已加载
        if not self._config_loaded:
            self._load_connections_from_config()
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

            # 获取配置的超时时间
            from core.common.config_manager import config_manager

            app_config = config_manager.get_app_config()

            connection = pymysql.connect(
                host=params.get("host"),
                port=params.get("port", 3306),
                user=username,
                password=password,
                database=params.get("database"),
                connect_timeout=app_config.db_connect_timeout,
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

            # 获取配置的超时时间
            from core.common.config_manager import config_manager

            app_config = config_manager.get_app_config()

            connection = psycopg2.connect(
                host=params.get("host"),
                port=params.get("port", 5432),
                user=username,
                password=password,
                database=params.get("database"),
                connect_timeout=app_config.db_connect_timeout,
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
            from core.common.config_manager import config_manager

            app_config = config_manager.get_app_config()
            sqlite_timeout = getattr(app_config, "sqlite_timeout", 10)

            connection = sqlite3.connect(db_path, timeout=sqlite_timeout)

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
        # 如果连接配置存在但尚未创建引擎（例如仅从配置加载、未进行过测试/刷新），
        # 这里按需创建引擎，避免外部查询/导入直接失败。
        if connection_id not in self.engines:
            connection = self.connections.get(connection_id)
            if not connection:
                raise ValueError(f"连接不存在: {connection_id}")
            engine = self._create_engine(connection.type, connection.params)
            self.engines[connection_id] = engine

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
