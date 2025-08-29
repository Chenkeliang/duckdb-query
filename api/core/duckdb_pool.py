"""
DuckDB连接池管理器
解决并发和稳定性问题
"""

import asyncio
import threading
import time
import logging
from typing import Dict, Optional, List
from contextlib import contextmanager
import duckdb
from dataclasses import dataclass
from enum import Enum
import os

logger = logging.getLogger(__name__)


class ConnectionState(Enum):
    IDLE = "idle"
    BUSY = "busy"
    ERROR = "error"
    CLOSED = "closed"


@dataclass
class PooledConnection:
    connection: duckdb.DuckDBPyConnection
    state: ConnectionState
    created_at: float
    last_used: float
    use_count: int
    error_count: int


class DuckDBConnectionPool:
    def __init__(
        self,
        min_connections: int = 2,
        max_connections: int = 10,
        connection_timeout: int = 30,
        idle_timeout: int = 300,
        max_retries: int = 3,
    ):
        self.min_connections = min_connections
        self.max_connections = max_connections
        self.connection_timeout = connection_timeout
        self.idle_timeout = idle_timeout
        self.max_retries = max_retries

        self._connections: Dict[int, PooledConnection] = {}
        self._connection_id_counter = 0
        self._lock = threading.RLock()
        self._condition = threading.Condition(self._lock)

        # 连接池统计
        self._total_created = 0
        self._total_closed = 0
        self._total_errors = 0

        # 初始化连接池
        self._initialize_pool()

        # 启动维护线程
        self._maintenance_thread = threading.Thread(
            target=self._maintenance_worker, daemon=True
        )
        self._maintenance_thread.start()

    def _initialize_pool(self):
        """初始化最小连接数"""
        for _ in range(self.min_connections):
            self._create_connection()

    def _create_connection(self) -> Optional[int]:
        """创建新连接"""
        try:
            # 获取数据库配置
            from core.config_manager import config_manager

            app_config = config_manager.get_app_config()

            # 确定数据库路径
            if os.path.exists("/app"):  # Docker环境
                db_path = "/app/data/duckdb/main.db"
                temp_dir = "/app/data/duckdb/temp"
            else:  # 本地环境
                db_path = "./data/duckdb/main.db"
                temp_dir = "./data/duckdb/temp"

            # 确保目录存在
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            os.makedirs(temp_dir, exist_ok=True)

            # 创建连接
            connection = duckdb.connect(database=db_path)

            # 应用优化设置
            self._configure_connection(connection, app_config, temp_dir)

            # 添加到连接池
            with self._lock:
                if len(self._connections) >= self.max_connections:
                    logger.warning("连接池已满，无法创建新连接")
                    connection.close()
                    return None

                conn_id = self._connection_id_counter
                self._connection_id_counter += 1

                self._connections[conn_id] = PooledConnection(
                    connection=connection,
                    state=ConnectionState.IDLE,
                    created_at=time.time(),
                    last_used=time.time(),
                    use_count=0,
                    error_count=0,
                )

                self._total_created += 1
                logger.info(
                    f"创建新连接 {conn_id}, 当前连接数: {len(self._connections)}"
                )
                return conn_id

        except Exception as e:
            logger.error(f"创建连接失败: {str(e)}")
            self._total_errors += 1
            return None

    def _configure_connection(
        self, connection: duckdb.DuckDBPyConnection, app_config, temp_dir: str
    ):
        """配置连接参数"""
        try:
            # 基础设置
            connection.execute("SET threads=8")
            connection.execute(f"SET temp_directory='{temp_dir}'")

            # 内存限制
            memory_limit = app_config.duckdb_memory_limit
            if memory_limit:
                connection.execute(f"SET memory_limit='{memory_limit}'")
                connection.execute(f"SET max_memory='{memory_limit}'")

            # 性能优化
            connection.execute("SET enable_profiling=true")
            connection.execute("SET preserve_insertion_order=false")
            connection.execute("SET enable_progress_bar=false")
            connection.execute("SET enable_object_cache=true")

            # 扩展目录设置
            try:
                extension_dir = "/app/data/duckdb/extensions"
                home_dir = "/app/data/duckdb/home"
                os.makedirs(extension_dir, exist_ok=True)
                os.makedirs(home_dir, exist_ok=True)

                connection.execute(f"SET home_directory='{home_dir}';")
                connection.execute(f"SET extension_directory='{extension_dir}';")
            except Exception as e:
                logger.warning(f"设置扩展目录失败: {str(e)}")

        except Exception as e:
            logger.warning(f"配置连接参数失败: {str(e)}")

    @contextmanager
    def get_connection(self):
        """获取连接的上下文管理器"""
        conn_id = None
        try:
            conn_id = self._acquire_connection()
            if conn_id is None:
                raise RuntimeError("无法获取数据库连接")

            connection = self._connections[conn_id].connection
            yield connection

        except Exception as e:
            if conn_id:
                self._mark_connection_error(conn_id, str(e))
            raise
        finally:
            if conn_id:
                self._release_connection(conn_id)

    def _acquire_connection(self) -> Optional[int]:
        """获取可用连接"""
        with self._condition:
            # 等待可用连接
            start_time = time.time()
            while True:
                # 查找空闲连接
                for conn_id, conn_info in self._connections.items():
                    if conn_info.state == ConnectionState.IDLE:
                        conn_info.state = ConnectionState.BUSY
                        conn_info.last_used = time.time()
                        conn_info.use_count += 1
                        return conn_id

                # 如果没有空闲连接且未达到最大连接数，创建新连接
                if len(self._connections) < self.max_connections:
                    conn_id = self._create_connection()
                    if conn_id:
                        self._connections[conn_id].state = ConnectionState.BUSY
                        self._connections[conn_id].last_used = time.time()
                        self._connections[conn_id].use_count += 1
                        return conn_id

                # 等待连接释放
                if time.time() - start_time > self.connection_timeout:
                    logger.error("获取连接超时")
                    return None

                self._condition.wait(timeout=1.0)

    def _release_connection(self, conn_id: int):
        """释放连接"""
        with self._lock:
            if conn_id in self._connections:
                conn_info = self._connections[conn_id]
                conn_info.state = ConnectionState.IDLE
                conn_info.last_used = time.time()

                # 通知等待的线程
                with self._condition:
                    self._condition.notify()

    def _mark_connection_error(self, conn_id: int, error_msg: str):
        """标记连接错误"""
        with self._lock:
            if conn_id in self._connections:
                conn_info = self._connections[conn_id]
                conn_info.state = ConnectionState.ERROR
                conn_info.error_count += 1

                # 如果错误次数过多，关闭连接
                if conn_info.error_count >= self.max_retries:
                    self._close_connection(conn_id)
                else:
                    # 尝试重置连接
                    self._reset_connection(conn_id)

    def _reset_connection(self, conn_id: int):
        """重置连接状态"""
        try:
            conn_info = self._connections[conn_id]
            # 执行简单查询测试连接
            conn_info.connection.execute("SELECT 1")
            conn_info.state = ConnectionState.IDLE
            logger.info(f"连接 {conn_id} 重置成功")
        except Exception as e:
            logger.error(f"连接 {conn_id} 重置失败: {str(e)}")
            self._close_connection(conn_id)

    def _close_connection(self, conn_id: int):
        """关闭连接"""
        with self._lock:
            if conn_id in self._connections:
                conn_info = self._connections[conn_id]
                try:
                    conn_info.connection.close()
                except Exception as e:
                    logger.warning(f"关闭连接 {conn_id} 失败: {str(e)}")

                del self._connections[conn_id]
                self._total_closed += 1
                logger.info(f"关闭连接 {conn_id}, 当前连接数: {len(self._connections)}")

    def _maintenance_worker(self):
        """维护工作线程"""
        while True:
            try:
                time.sleep(60)  # 每分钟检查一次
                self._cleanup_idle_connections()
                self._health_check()
            except Exception as e:
                logger.error(f"维护线程异常: {str(e)}")

    def _cleanup_idle_connections(self):
        """清理空闲连接"""
        current_time = time.time()
        with self._lock:
            to_close = []
            for conn_id, conn_info in self._connections.items():
                if (
                    conn_info.state == ConnectionState.IDLE
                    and current_time - conn_info.last_used > self.idle_timeout
                    and len(self._connections) > self.min_connections
                ):
                    to_close.append(conn_id)

            for conn_id in to_close:
                self._close_connection(conn_id)

    def _health_check(self):
        """健康检查"""
        with self._lock:
            for conn_id, conn_info in list(self._connections.items()):
                if conn_info.state == ConnectionState.ERROR:
                    self._reset_connection(conn_id)

    def get_stats(self) -> dict:
        """获取连接池统计信息"""
        with self._lock:
            idle_count = sum(
                1 for c in self._connections.values() if c.state == ConnectionState.IDLE
            )
            busy_count = sum(
                1 for c in self._connections.values() if c.state == ConnectionState.BUSY
            )
            error_count = sum(
                1
                for c in self._connections.values()
                if c.state == ConnectionState.ERROR
            )

            return {
                "total_connections": len(self._connections),
                "idle_connections": idle_count,
                "busy_connections": busy_count,
                "error_connections": error_count,
                "total_created": self._total_created,
                "total_closed": self._total_closed,
                "total_errors": self._total_errors,
            }

    def close_all(self):
        """关闭所有连接"""
        with self._lock:
            for conn_id in list(self._connections.keys()):
                self._close_connection(conn_id)


# 全局连接池实例
_connection_pool = None


def get_connection_pool() -> DuckDBConnectionPool:
    """获取连接池实例"""
    global _connection_pool
    if _connection_pool is None:
        from core.config_manager import config_manager

        app_config = config_manager.get_app_config()

        _connection_pool = DuckDBConnectionPool(
            min_connections=2,
            max_connections=10,
            connection_timeout=30,
            idle_timeout=300,
        )
    return _connection_pool
