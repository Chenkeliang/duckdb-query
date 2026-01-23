"""
DuckDBconnection池管理器
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

logger = logging.getLogger(__name__)

# getting应用configuration
from core.common.config_manager import config_manager


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

        # connection池统计
        self._total_created = 0
        self._total_closed = 0
        self._total_errors = 0

        # initializingconnection池
        self._initialize_pool()

        # 启动维护线程
        self._maintenance_thread = threading.Thread(
            target=self._maintenance_worker, daemon=True
        )
        self._maintenance_thread.start()

    def _initialize_pool(self):
        """initializing最小connection数"""
        for _ in range(self.min_connections):
            self._create_connection()

    def _create_connection(self) -> Optional[int]:
        """creating新connection"""
        try:
            # gettingdatabaseconfiguration
            app_config = config_manager.get_app_config()
            paths = config_manager.get_duckdb_paths()

            db_path = str(paths.database_path)
            temp_dir = str(paths.temp_dir)

            # creatingconnection
            connection = duckdb.connect(database=db_path)

            # 应用优化设置
            self._configure_connection(connection, app_config, temp_dir)

            # 添加到connection池
            with self._lock:
                if len(self._connections) >= self.max_connections:
                    logger.warning("Connection pool is full, cannot create new connection")
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
                    f"Created new connection {conn_id}, current connections: {len(self._connections)}"
                )
                return conn_id

        except Exception as e:
            logger.error(f"Failed to create connection: {str(e)}")
            self._total_errors += 1
            return None

    def _configure_connection(
        self, connection: duckdb.DuckDBPyConnection, app_config, temp_dir: str
    ):
        """configurationconnectionparameter - 使用统一的DuckDBconfiguration系统"""
        try:
            # 导入统一的configuration应用函数
            from core.database.duckdb_engine import _apply_duckdb_configuration

            # 使用统一的configuration系统
            _apply_duckdb_configuration(connection, temp_dir)

        except Exception as e:
            logger.warning(f"Failed to apply unified configuration, using basic configuration: {str(e)}")
            # 基础configuration作为后备，使用configurationfile中的值
            try:
                connection.execute(f"SET threads={app_config.duckdb_threads}")
                connection.execute(f"SET temp_directory='{temp_dir}'")
                if app_config.duckdb_memory_limit:
                    connection.execute(
                        f"SET memory_limit='{app_config.duckdb_memory_limit}'"
                    )
            except Exception as fallback_error:
                logger.error(f"Basic configuration also failed: {str(fallback_error)}")
                # 最后的硬编码后备
                connection.execute("SET threads=8")
                connection.execute(f"SET temp_directory='{temp_dir}'")

    @contextmanager
    def get_connection(self):
        """gettingconnection的上下文管理器"""
        conn_id = None
        try:
            conn_id = self._acquire_connection()
            if conn_id is None:
                raise RuntimeError("Unable to acquire database connection")

            logger.debug(f"[POOL_DEBUG] gettingconnection: conn_id={conn_id}")
            connection = self._connections[conn_id].connection
            yield connection

        except Exception as e:
            if conn_id:
                logger.debug(f"[POOL_DEBUG] Connection exception, attempting rollback: conn_id={conn_id}, error={e}")
                # 发生异常时，尝试回滚事务
                try:
                    self._connections[conn_id].connection.execute("ROLLBACK")
                except Exception:
                    pass
                self._mark_connection_error(conn_id, str(e))
            raise
        finally:
            if conn_id:
                # 释放前确保事务已提交（DuckDB 在某些情况下可能有未提交的隐式事务）
                try:
                    logger.debug(f"[POOL_DEBUG] COMMIT before releasing connection: conn_id={conn_id}")
                    self._connections[conn_id].connection.execute("COMMIT")
                    logger.debug(f"[POOL_DEBUG] COMMIT completed: conn_id={conn_id}")
                except Exception as commit_error:
                    # 如果没有活动事务，COMMIT 会failed，这是正常的
                    logger.debug(f"[POOL_DEBUG] COMMIT failed (possibly no active transaction): conn_id={conn_id}, error={commit_error}")
                    pass
                self._release_connection(conn_id)
                logger.debug(f"[POOL_DEBUG] Connection released: conn_id={conn_id}")

    def _acquire_connection(self) -> Optional[int]:
        """getting可用connection"""
        with self._condition:
            # 等待可用connection
            start_time = time.time()
            app_config = config_manager.get_app_config()
            while True:
                # 查找空闲connection
                for conn_id, conn_info in self._connections.items():
                    if conn_info.state == ConnectionState.IDLE:
                        conn_info.state = ConnectionState.BUSY
                        conn_info.last_used = time.time()
                        conn_info.use_count += 1
                        return conn_id

                # 如果没有空闲connection且未达到最大connection数，creating新connection
                if len(self._connections) < self.max_connections:
                    conn_id = self._create_connection()
                    if conn_id:
                        self._connections[conn_id].state = ConnectionState.BUSY
                        self._connections[conn_id].last_used = time.time()
                        self._connections[conn_id].use_count += 1
                        return conn_id

                # 等待connection释放
                if time.time() - start_time > self.connection_timeout:
                    logger.error("Connection acquisition timeout")
                    return None

                app_config = config_manager.get_app_config()
                self._condition.wait(timeout=app_config.pool_wait_timeout)

    def _release_connection(self, conn_id: int):
        """释放connection"""
        with self._lock:
            if conn_id in self._connections:
                conn_info = self._connections[conn_id]
                conn_info.state = ConnectionState.IDLE
                conn_info.last_used = time.time()

                # 通知等待的线程
                with self._condition:
                    self._condition.notify()

    def _mark_connection_error(self, conn_id: int, error_msg: str):
        """标记connectionerror"""
        with self._lock:
            if conn_id in self._connections:
                conn_info = self._connections[conn_id]
                conn_info.state = ConnectionState.ERROR
                conn_info.error_count += 1

                # 如果error次数过多，关闭connection
                if conn_info.error_count >= self.max_retries:
                    self._close_connection(conn_id)
                else:
                    # 尝试重置connection
                    self._reset_connection(conn_id)

    def _reset_connection(self, conn_id: int):
        """重置connection状态"""
        try:
            conn_info = self._connections[conn_id]
            # executing简单query测试connection
            conn_info.connection.execute("SELECT 1")
            conn_info.state = ConnectionState.IDLE
            logger.info(f"Connection reset successfully")
        except Exception as e:
            logger.error(f"Connection reset failed: {str(e)}")
            self._close_connection(conn_id)

    def _close_connection(self, conn_id: int):
        """关闭connection"""
        with self._lock:
            if conn_id in self._connections:
                conn_info = self._connections[conn_id]
                try:
                    conn_info.connection.close()
                except Exception as e:
                    logger.warning(f"Failed to close connection {conn_id}: {str(e)}")

                del self._connections[conn_id]
                self._total_closed += 1
                logger.info(f"Closed connection {conn_id}, current connections: {len(self._connections)}")

    def _maintenance_worker(self):
        """维护工作线程"""
        while True:
            try:
                time.sleep(60)  # 每分钟检查一次
                self._cleanup_idle_connections()
                self._health_check()
            except Exception as e:
                logger.error(f"Maintenance thread error: {str(e)}")

    def _cleanup_idle_connections(self):
        """清理空闲connection"""
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
        """gettingconnection池统计info"""
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

    def discard_connection(self, connection: duckdb.DuckDBPyConnection) -> bool:
        """
        销毁connection（中断后使用，不归还池中）
        
        用于query被中断后，避免connection复用导致的状态问题
        
        Args:
            connection: 要销毁的connection对象
            
        Returns:
            True if connection was found and discarded, False otherwise
        """
        with self._lock:
            # 通过对象身份查找connection ID
            conn_id_to_discard = None
            for conn_id, conn_info in self._connections.items():
                if conn_info.connection is connection:
                    conn_id_to_discard = conn_id
                    break
            
            if conn_id_to_discard is None:
                logger.warning("discard_connection: Connection to discard not found")
                return False
            
            # 关闭connection
            try:
                connection.close()
            except Exception as e:
                logger.warning(f"discard_connection: Failed to close connection: {e}")
            
            # 从池中移除
            del self._connections[conn_id_to_discard]
            self._total_closed += 1
            logger.info(f"Discarded connection {conn_id_to_discard}, current connections: {len(self._connections)}")
            
            # 如果低于最小connection数，触发补充（在后台）
            if len(self._connections) < self.min_connections:
                logger.info("Connection count below minimum, will create new connection on next request")
            
            # 通知等待的线程
            with self._condition:
                self._condition.notify()
            
            return True

    def close_all(self):
        """关闭所有connection"""
        with self._lock:
            for conn_id in list(self._connections.keys()):
                self._close_connection(conn_id)


# 全局connection池实例
_connection_pool = None


def get_connection_pool() -> DuckDBConnectionPool:
    """gettingconnection池实例"""
    global _connection_pool
    if _connection_pool is None:
        from core.common.config_manager import config_manager

        app_config = config_manager.get_app_config()

        _connection_pool = DuckDBConnectionPool(
            min_connections=app_config.pool_min_connections,
            max_connections=app_config.pool_max_connections,
            connection_timeout=app_config.pool_connection_timeout,
            idle_timeout=app_config.pool_idle_timeout,
            max_retries=app_config.pool_max_retries,
        )
    return _connection_pool


@contextmanager
def interruptible_connection(task_id: str, sql: str = ""):
    """
    可中断的connection上下文管理器
    
    复用现有 get_connection() 的事务/释放逻辑，同时支持中断
    
    使用方式:
        with interruptible_connection(task_id, sql) as conn:
            conn.execute(sql)
    
    Args:
        task_id: 任务 ID，用于注册和中断
        sql: SQL 语句，用于debug日志
        
    Yields:
        DuckDB connection对象
        
    Raises:
        duckdb.InterruptException: query被中断时抛出
    """
    from core.database.connection_registry import connection_registry
    
    pool = get_connection_pool()
    discarded = False
    
    with pool.get_connection() as conn:
        # 注册到注册table
        connection_registry.register(task_id, conn, sql[:200] if sql else "")
        
        try:
            yield conn
        except duckdb.InterruptException:
            # 中断后销毁connection，避免被重新归还
            pool.discard_connection(conn)
            discarded = True
            logger.info(f"Task {task_id} was interrupted, connection discarded")
            raise  # 重新抛出，让上层处理
        finally:
            # 无论successfully/failed/cancel，都注销注册table
            connection_registry.unregister(task_id)
            if discarded:
                logger.debug(f"Task {task_id} connection already discarded, skipping pool release")


# ============================================
# 系统databaseconnection管理器 (用于系统table，独立于用户data)
# ============================================

class SystemDBConnection:
    """系统database单connection管理器（线程安全）
    
    为什么使用单connection而不是connection池？
    1. 系统table操作频率低，不需要connection池
    2. 单connection避免多connection竞争导致的写写冲突
    3. 使用 RLock 保证线程安全
    """
    
    _instance = None
    _lock = threading.RLock()
    _connection: Optional[duckdb.DuckDBPyConnection] = None
    
    @classmethod
    def get_instance(cls) -> 'SystemDBConnection':
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance
    
    def _ensure_connection(self) -> duckdb.DuckDBPyConnection:
        """确保connection可用，如果connection断开则重新creating"""
        with self._lock:
            if self._connection is None:
                paths = config_manager.get_duckdb_paths()
                db_path = str(paths.system_database_path)
                logger.info(f"Creating system database connection: {db_path}")
                self._connection = duckdb.connect(database=db_path)
                # 应用基本configuration
                app_config = config_manager.get_app_config()
                if app_config.duckdb_memory_limit:
                    try:
                        self._connection.execute(f"SET memory_limit='{app_config.duckdb_memory_limit}'")
                    except Exception:
                        pass
            return self._connection
    
    @contextmanager
    def get_connection(self):
        """getting系统databaseconnection（线程安全）"""
        with self._lock:
            conn = self._ensure_connection()
            try:
                yield conn
            except Exception as e:
                logger.error(f"System database operation error: {e}")
                # 发生异常时尝试回滚
                try:
                    conn.execute("ROLLBACK")
                except Exception:
                    pass
                raise
    
    def close(self):
        """关闭connection"""
        with self._lock:
            if self._connection:
                try:
                    self._connection.close()
                    logger.info("System database connection closed")
                except Exception as e:
                    logger.warning(f"Failed to close system database connection: {e}")
                finally:
                    self._connection = None


def get_system_connection_manager() -> SystemDBConnection:
    """getting系统databaseconnection管理器单例"""
    return SystemDBConnection.get_instance()


@contextmanager
def with_system_connection():
    """系统databaseconnection上下文管理器
    
    用于所有系统table操作:
    - system_async_tasks
    - system_task_exports
    - system_database_connections
    - system_file_datasources
    - system_migration_status
    """
    manager = get_system_connection_manager()
    with manager.get_connection() as conn:
        yield conn
