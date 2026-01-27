"""
database connection管理器
提供database connection池管理、connection测试、健康检查等功能
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
    """database connection管理器"""

    def __init__(self):
        self.connections: Dict[str, DatabaseConnection] = {}
        self.engines: Dict[str, Any] = {}
        self.connection_pools: Dict[str, Any] = {}
        self._config_loaded = False
        # 延迟loadingconfiguration，避免initializing顺序问题

    def _load_connections_from_config(self):
        """从 DuckDB 元datatableloadingconnectionconfiguration"""
        try:
            # Loading from DuckDB
            connections_data = metadata_manager.list_database_connections()

            logger.info(f"Loading from DuckDB {len(connections_data)} database connections")
            for conn_data in connections_data:
                try:
                    conn_type_str = conn_data.get("type")
                    conn_type = DataSourceType(conn_type_str) if conn_type_str else None

                    if not conn_type:
                        logger.warning(f"Skipping connection with invalid type: {conn_data.get('id')}")
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
                    # loadingconfiguration时不测试connection，提升启动速度
                    self.add_connection(
                        connection, test_connection=False, save_to_metadata=False
                    )
                except Exception as e:
                    logger.error(f"loadingconnectionconfigurationfailed {conn_data.get('id')}: {e}")

        except Exception as e:
            logger.error(f"Loading from DuckDBconnectionconfigurationfailed: {e}")

        # 标记configuration已loading
        self._config_loaded = True

    def add_connection(
        self,
        connection: DatabaseConnection,
        test_connection: bool = True,
        save_to_metadata: bool = True,
    ) -> tuple[bool, Optional[ConnectionTestResponse]]:
        """
        添加或Updating database connection configuration
        
        Returns:
            (success, test_result)
        """
        try:
            # 检查updating：如果connectionalready exists，先清理旧资源，并合并parameter（如密码）
            if connection.id in self.connections:
                old_conn = self.connections[connection.id]
                logger.info(f"updatingdatabase connection: {connection.id}")
                
                # 清理旧引擎
                if connection.id in self.engines:
                    try:
                        self.engines[connection.id].dispose()
                        del self.engines[connection.id]
                    except Exception as e:
                        logger.warning(f"Failed to clean up old connection engine {connection.id}: {e}")
                
                # 假如新 params missing密码，且旧 params 有密码，则继承
                # 注意：前端如果没改密码，params 里可能没 password 字段
                if "password" not in connection.params and "password" in old_conn.params:
                    connection.params["password"] = old_conn.params["password"]

            test_result = None
            if test_connection:
                # 测试connection
                test_result = self.test_connection(
                    ConnectionTestRequest(
                        type=connection.type, params=connection.params
                    )
                )

                if test_result.success:
                    # creatingconnection engine
                    try:
                        engine = self._create_engine(connection.type, connection.params)
                        self.engines[connection.id] = engine
                        connection.status = ConnectionStatus.ACTIVE
                        logger.info(f"Successfully added database connection: {connection.id}")
                    except Exception as e:
                        connection.status = ConnectionStatus.ERROR
                        logger.error(f"Failed to create engine: {e}")
                        # 如果引擎creating都failed了，那整体应该算failed
                        return False, test_result
                else:
                    connection.status = ConnectionStatus.ERROR
                    logger.warning(
                        f"Connection test failed: {test_result.message}, but still updating to configuration (status set to ERROR)"
                    )
            else:
                # 不测试connection，直接添加configuration
                logger.info(f"Added database connection configuration (not tested): {connection.id}")

            # updating内存中的connectioncolumntable
            self.connections[connection.id] = connection

            # saving到 DuckDB 元datatable
            if save_to_metadata:
                from datetime import datetime

                conn_data = {
                    "id": connection.id,
                    "name": connection.name,
                    "type": connection.type.value,
                    "params": connection.params,
                    "status": connection.status.value,
                    "created_at": connection.created_at or datetime.now(),
                    "updated_at": datetime.now(), # updating时间
                    "last_tested": connection.last_tested,
                }
                success = metadata_manager.save_database_connection(conn_data)
                if success:
                    logger.info(f"Connection configuration saved to DuckDB: {connection.id}")
                else:
                    logger.error(f"Failed to save connection configuration to DuckDB: {connection.id}")

            return True, test_result

        except Exception as e:
            logger.error(f"Failed to add database connection: {str(e)}")
            connection.status = ConnectionStatus.ERROR
            return False, None

    def remove_connection(self, connection_id: str) -> bool:
        """移除database connection"""
        try:
            if connection_id in self.engines:
                self.engines[connection_id].dispose()
                del self.engines[connection_id]

            if connection_id in self.connections:
                del self.connections[connection_id]

            if connection_id in self.connection_pools:
                del self.connection_pools[connection_id]

            # 从 DuckDB 元datatabledeleting
            success = metadata_manager.delete_database_connection(connection_id)
            if success:
                logger.info(f"Successfully removed database connection (including metadata): {connection_id}")
            else:
                logger.warning(f"Failed to delete connection from metadata table: {connection_id}")

            return True

        except Exception as e:
            logger.error(f"Failed to remove database connection: {str(e)}")
            return False

    def get_connection(self, connection_id: str) -> Optional[DatabaseConnection]:
        """gettingdatabase connectionconfiguration"""
        return self.connections.get(connection_id)

    def list_connections(self) -> List[DatabaseConnection]:
        """column出所有database connection"""
        # 确保configuration已loading
        if not self._config_loaded:
            self._load_connections_from_config()
        return list(self.connections.values())

    def test_connection(self, request: ConnectionTestRequest) -> ConnectionTestResponse:
        """测试database connection"""
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
                    success=False, message=f"不支持的database类型: {request.type}"
                )

        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return ConnectionTestResponse(
                success=False, message=f"connection测试failed: {str(e)}", latency_ms=latency
            )

    def _test_mysql_connection(
        self, params: Dict[str, Any], start_time: float
    ) -> ConnectionTestResponse:
        """测试MySQLconnection"""
        try:
            # 支持 user 和 username 两种parameter名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("Missing username parameter (user or username)")

            # 解密密码
            password = params.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)
                logger.info("Password decrypted for connection test")

            # gettingconfiguration的timeout时间
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
                message="MySQL connection successful",
                messageCode="MYSQL_CONNECTION_SUCCESS",
                latency_ms=latency,
                database_info={"version": version, "type": "MySQL"},
            )

        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return ConnectionTestResponse(
                success=False, 
                message=f"MySQL connection failed: {str(e)}", 
                messageCode="MYSQL_CONNECTION_FAILED",
                latency_ms=latency,
                error_details=str(e)
            )

    def _test_postgresql_connection(
        self, params: Dict[str, Any], start_time: float
    ) -> ConnectionTestResponse:
        """测试PostgreSQLconnection"""
        try:
            # 支持 user 和 username 两种parameter名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("Missing username parameter (user or username)")

            # 解密密码
            password = params.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)
                logger.info("Password decrypted for PostgreSQL connection test")

            # gettingconfiguration的timeout时间
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
                message="PostgreSQL connection successful",
                messageCode="POSTGRESQL_CONNECTION_SUCCESS",
                latency_ms=latency,
                database_info={"version": version, "type": "PostgreSQL"},
            )

        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return ConnectionTestResponse(
                success=False,
                message=f"PostgreSQL connection failed: {str(e)}",
                messageCode="POSTGRESQL_CONNECTION_FAILED",
                latency_ms=latency,
                error_details=str(e)
            )

    def _test_sqlite_connection(
        self, params: Dict[str, Any], start_time: float
    ) -> ConnectionTestResponse:
        """测试SQLiteconnection"""
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
                message="SQLite connection successful",
                messageCode="SQLITE_CONNECTION_SUCCESS",
                latency_ms=latency,
                database_info={"version": version, "type": "SQLite"},
            )

        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return ConnectionTestResponse(
                success=False, 
                message=f"SQLite connection failed: {str(e)}", 
                messageCode="SQLITE_CONNECTION_FAILED",
                latency_ms=latency,
                error_details=str(e)
            )

    def _create_engine(self, db_type: DataSourceType, params: Dict[str, Any]):
        """creatingSQLAlchemy引擎"""
        if db_type == DataSourceType.MYSQL:
            # 支持 user 和 username 两种parameter名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("Missing username parameter (user or username)")

            # 解密密码
            password = params.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)

            connection_string = (
                f"mysql+pymysql://{username}:{password}"
                f"@{params['host']}:{params.get('port', 3306)}/{params['database']}"
            )
        elif db_type == DataSourceType.POSTGRESQL:
            # 支持 user 和 username 两种parameter名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("Missing username parameter (user or username)")

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
            raise ValueError(f"Unsupported database type: {db_type}")

        return create_engine(
            connection_string,
            poolclass=QueuePool,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            pool_recycle=3600,
        )

    def execute_query(self, connection_id: str, query: str) -> pd.DataFrame:
        """executingdatabasequery"""
        # 如果connectionconfiguration存在但尚未creating引擎（例如仅从configurationloading、未进行过测试/刷新），
        # 这里按需creating引擎，避免外部query/导入直接failed。
        if connection_id not in self.engines:
            connection = self.connections.get(connection_id)
            if not connection:
                raise ValueError(f"connectiondoes not exist: {connection_id}")
            engine = self._create_engine(connection.type, connection.params)
            self.engines[connection_id] = engine

        engine = self.engines[connection_id]

        try:
            return pd.read_sql(query, engine)
        except Exception as e:
            logger.error(f"queryexecutingfailed: {str(e)}")
            raise

    @contextmanager
    def get_engine(self, connection_id: str):
        """gettingdatabase引擎的上下文管理器"""
        if connection_id not in self.engines:
            raise ValueError(f"connectiondoes not exist: {connection_id}")

        engine = self.engines[connection_id]
        try:
            yield engine
        finally:
            # 这里可以添加清理逻辑
            pass


# 全局database管理器实例
db_manager = DatabaseManager()
