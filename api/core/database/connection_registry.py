"""
连接注册表模块
管理活跃 DuckDB 查询连接与任务 ID 的映射，支持查询中断

使用方式:
    from core.database.connection_registry import connection_registry
    
    # 注册连接
    connection_registry.register(task_id, connection, sql)
    
    # 中断查询
    connection_registry.interrupt(task_id)
    
    # 注销连接
    connection_registry.unregister(task_id)
"""

import threading
import time
import logging
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

import duckdb

logger = logging.getLogger(__name__)


@dataclass
class ConnectionRecord:
    """连接注册记录"""
    connection: duckdb.DuckDBPyConnection
    task_id: str
    thread_id: int
    start_time: float
    sql_preview: str  # 前 200 字符，用于调试
    remote_interrupts: List[Callable[[], bool]] = field(default_factory=list)


class ConnectionRegistry:
    """
    连接注册表 - 维护活跃查询与 DuckDB 连接的映射
    
    线程安全，支持注册、注销、中断操作
    """
    
    def __init__(self):
        self._registry: Dict[str, ConnectionRecord] = {}
        self._lock = threading.RLock()
    
    def register(
        self, 
        task_id: str, 
        connection: duckdb.DuckDBPyConnection,
        sql: str = ""
    ) -> None:
        """注册连接到注册表"""
        with self._lock:
            if task_id in self._registry:
                logger.warning(f"Task {task_id} already registered, overwriting")
            
            self._registry[task_id] = ConnectionRecord(
                connection=connection,
                task_id=task_id,
                thread_id=threading.current_thread().ident or 0,
                start_time=time.time(),
                sql_preview=sql[:200] if sql else ""
            )
            logger.info(f"Registered connection for task {task_id}")
    
    def unregister(self, task_id: str) -> bool:
        """从注册表移除连接"""
        with self._lock:
            if task_id in self._registry:
                del self._registry[task_id]
                logger.info(f"Unregistered connection for task {task_id}")
                return True
            return False
    
    def get(self, task_id: str) -> Optional[ConnectionRecord]:
        """获取连接记录"""
        with self._lock:
            return self._registry.get(task_id)

    def register_remote_interrupt(
        self, task_id: str, remote_interrupt: Callable[[], bool]
    ) -> bool:
        """为活跃查询登记远端数据库取消器。"""
        with self._lock:
            record = self._registry.get(task_id)
            if not record:
                return False
            record.remote_interrupts.append(remote_interrupt)
            return True

    def interrupt_with_remote(self, task_id: str) -> bool:
        """中断 DuckDB，并调用查询已登记的远端数据库取消器。"""
        with self._lock:
            record = self._registry.get(task_id)
            if not record:
                logger.warning("Cannot interrupt task %s: not found in registry", task_id)
                return False
            connection = record.connection
            remote_interrupts = list(record.remote_interrupts)

        local_interrupted = False
        try:
            connection.interrupt()
            local_interrupted = True
            logger.info("Interrupted local query for task %s", task_id)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.warning("Failed to interrupt local query for task %s: %s", task_id, exc)

        remote_interrupted = False
        for remote_interrupt in remote_interrupts:
            try:
                remote_interrupted = remote_interrupt() or remote_interrupted
            except Exception as exc:  # pylint: disable=broad-exception-caught
                logger.warning("Failed to interrupt remote query for task %s: %s", task_id, exc)

        return local_interrupted or remote_interrupted
    
    def interrupt(self, task_id: str) -> bool:
        """
        中断指定任务的查询
        
        Returns:
            True 如果成功调用 interrupt()
            False 如果任务不存在
        """
        with self._lock:
            record = self._registry.get(task_id)
            if not record:
                logger.warning(f"Cannot interrupt task {task_id}: not found in registry")
                return False
            
            try:
                record.connection.interrupt()
                logger.info(f"Interrupted task {task_id}")
                return True
            except Exception as e:
                logger.error(f"Failed to interrupt task {task_id}: {e}")
                raise
    
    def interrupt_all(self) -> int:
        """中断所有在飞查询（用于优雅停机）。

        逐个对已注册连接调用 interrupt()，让阻塞中的重查询尽快抛出中断，
        使 uvicorn 能迅速 drain 在飞请求、跑完 lifespan shutdown(连接池
        close_all + WAL checkpoint)、在桌面壳的 5s 窗口内干净退出——避免
        重查询占着不放 → 超时 SIGKILL → 脏 WAL → 重启降级。单条 interrupt
        失败不影响其余。返回成功中断的数量。
        """
        with self._lock:
            interrupted = 0
            for task_id, record in list(self._registry.items()):
                try:
                    record.connection.interrupt()
                    interrupted += 1
                except Exception as e:  # pylint: disable=broad-exception-caught
                    logger.warning(f"Failed to interrupt task {task_id} on shutdown: {e}")
            if interrupted:
                logger.info(f"Interrupted {interrupted} in-flight query(ies) on shutdown")
            return interrupted

    def cleanup_stale(
        self,
        max_age_seconds: float = 1800,
        ignore_suffix: Optional[str] = None
    ) -> int:
        """
        清理超时的注册条目
        
        Args:
            max_age_seconds: 超过此时长的条目会被清理（默认 30 分钟）
            ignore_suffix: 忽略以此后缀结尾的 task_id（如 "_cleanup"）
            
        Returns:
            被清理的条目数量
        """
        with self._lock:
            now = time.time()
            stale_ids = [
                task_id for task_id, record in self._registry.items()
                if now - record.start_time > max_age_seconds
                and (ignore_suffix is None or not task_id.endswith(ignore_suffix))
            ]
            for task_id in stale_ids:
                logger.warning(f"Cleaning up stale registry entry: {task_id}")
                del self._registry[task_id]
            return len(stale_ids)
    
    def get_active_count(self) -> int:
        """获取活跃连接数量"""
        with self._lock:
            return len(self._registry)
    
    def get_all_tasks(self) -> Dict[str, dict]:
        """获取所有注册任务的信息（用于调试）"""
        with self._lock:
            return {
                task_id: {
                    "thread_id": record.thread_id,
                    "start_time": record.start_time,
                    "sql_preview": record.sql_preview,
                    "duration": time.time() - record.start_time
                }
                for task_id, record in self._registry.items()
            }


# 单例实例
connection_registry = ConnectionRegistry()
