"""
数据库连接管理器
提供数据库连接池管理、连接测试、健康检查等功能
"""

import asyncio
import json
import logging
import os
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional

import psycopg2
import pymysql
from models.query_models import (
    ConnectionStatus,
    ConnectionTestRequest,
    ConnectionTestResponse,
    DatabaseConnection,
    DataSourceType,
)
from core.security.encryption import password_encryptor
from core.database.metadata_manager import metadata_manager

logger = logging.getLogger(__name__)


class DatabaseManager:
    """数据库连接管理器"""

    def __init__(self):
        self.connections: Dict[str, DatabaseConnection] = {}
        self._config_loaded = False
        # 延迟加载配置，避免初始化顺序问题
        # RLock（可重入）：add_connection 会在持锁期间被 _load_connections_from_config
        # 循环调用，list_connections 也会在持锁期间触发同一个加载路径——同一线程需要
        # 能重复拿到这把锁而不死锁。只保护 connections 字典本身的读写/遍历，
        # 不覆盖 test_connection 这类慢速网络 I/O。
        self._lock = threading.RLock()

    def _load_connections_from_config(self):
        """从 DuckDB 元数据表加载连接配置"""
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
                    # 加载配置时不测试连接，提升启动速度
                    self.add_connection(
                        connection, test_connection=False, save_to_metadata=False
                    )
                except Exception as e:
                    logger.error(f"loadingconnectionconfigurationfailed {conn_data.get('id')}: {e}")

        except Exception as e:
            logger.error(f"Loading from DuckDBconnectionconfigurationfailed: {e}")

        # 标记配置已加载
        self._config_loaded = True

    def add_connection(
        self,
        connection: DatabaseConnection,
        test_connection: bool = True,
        save_to_metadata: bool = True,
    ) -> tuple[bool, Optional[ConnectionTestResponse]]:
        """
        添加或更新数据库连接配置

        Returns:
            (success, test_result)
        """
        try:
            # 检查更新：如果连接已存在，先清理旧资源，并合并参数（如密码）
            # 字典读写本身加锁；test_connection 是真实网络 I/O（可能耗时数秒），
            # 不放进锁里——否则一次慢速/不可达连接测试会把 list_connections/
            # execute_query 等其他连接的正常读取整体卡住。
            with self._lock:
                if connection.id in self.connections:
                    old_conn = self.connections[connection.id]
                    logger.info(f"updatingdatabase connection: {connection.id}")

                    # 假如新 params 缺少密码，且旧 params 有密码，则继承
                    # 注意：前端如果没改密码，params 里可能没 password 字段
                    if "password" not in connection.params and "password" in old_conn.params:
                        connection.params["password"] = old_conn.params["password"]

            test_result = None
            if test_connection:
                # 测试连接（网络 I/O，不持锁）
                test_result = self.test_connection(
                    ConnectionTestRequest(
                        type=connection.type, params=connection.params
                    )
                )

                if test_result.success:
                    # 查询一律走 DuckDB ATTACH(见 federated_attach),无引擎可建
                    connection.status = ConnectionStatus.ACTIVE
                    logger.info(f"Successfully added database connection: {connection.id}")
                else:
                    connection.status = ConnectionStatus.ERROR
                    logger.warning(
                        f"Connection test failed: {test_result.message}, but still updating to configuration (status set to ERROR)"
                    )
            else:
                # 不测试连接，直接添加配置
                logger.info(f"Added database connection configuration (not tested): {connection.id}")

            # 更新内存中的连接列表
            with self._lock:
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
                    "updated_at": datetime.now(), # 更新时间
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
        """移除数据库连接"""
        try:
            with self._lock:
                if connection_id in self.connections:
                    del self.connections[connection_id]

            # 从 DuckDB 元数据表删除
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
        """获取数据库连接配置"""
        return self.connections.get(connection_id)

    def list_connections(self) -> List[DatabaseConnection]:
        """列出所有数据库连接"""
        with self._lock:
            # 确保配置已加载（_load_connections_from_config 只在 test_connection=False
            # 下调用 add_connection，不做网络 I/O，持锁期间不会长时间阻塞其他调用方；
            # RLock 允许 add_connection 内部再次拿到同一把锁，不会死锁）
            if not self._config_loaded:
                self._load_connections_from_config()
            # list(...) 必须在锁内完成：并发的 add_connection/remove_connection 修改
            # 字典大小时遍历会抛 RuntimeError: dictionary changed size during iteration
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
            elif request.type == DataSourceType.DUCKDB:
                return self._test_duckdb_connection(request.params, start_time)
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
        """测试 MySQL 连接"""
        try:
            # 支持 user 和 username 两种参数名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("Missing username parameter (user or username)")

            # 解密密码
            password = params.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)
                logger.info("Password decrypted for connection test")

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
        """测试 PostgreSQL 连接"""
        try:
            # 支持 user 和 username 两种参数名称
            username = params.get("user") or params.get("username")
            if not username:
                raise ValueError("Missing username parameter (user or username)")

            # 解密密码
            password = params.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)
                logger.info("Password decrypted for PostgreSQL connection test")

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
        """测试 SQLite 连接"""
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

    def _test_duckdb_connection(
        self, params: Dict[str, Any], start_time: float
    ) -> ConnectionTestResponse:
        """测试 DuckDB 文件连接（只读打开，避免与源文件写锁冲突）"""
        try:
            db_path = params.get("path") or params.get("database")
            if not db_path:
                raise ValueError("Missing DuckDB file path (path or database)")

            import duckdb

            connection = duckdb.connect(db_path, read_only=True)
            try:
                version = connection.execute("SELECT version()").fetchone()[0]
            finally:
                connection.close()

            latency = (time.time() - start_time) * 1000
            return ConnectionTestResponse(
                success=True,
                message="DuckDB connection successful",
                messageCode="DUCKDB_CONNECTION_SUCCESS",
                latency_ms=latency,
                database_info={"version": version, "type": "DuckDB"},
            )

        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return ConnectionTestResponse(
                success=False,
                message=f"DuckDB connection failed: {str(e)}",
                messageCode="DUCKDB_CONNECTION_FAILED",
                latency_ms=latency,
                error_details=str(e),
            )

# 全局数据库管理器实例
db_manager = DatabaseManager()
