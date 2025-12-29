"""
异步任务管理器
负责管理异步任务的状态、持久化与导出记录
"""

import json
import logging
import time
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, date, timedelta
from enum import Enum
from pathlib import Path
from threading import Lock
import threading
from typing import Any, Callable, Dict, List, Optional, TypeVar

from core.config_manager import config_manager
from core.duckdb_pool import with_system_connection
from core.timezone_utils import (
    get_storage_time,
    normalize_to_storage_timezone,
    format_storage_time_for_response,
)

ASYNC_TASKS_TABLE = "system_async_tasks"
TASK_EXPORTS_TABLE = "system_task_exports"

logger = logging.getLogger(__name__)

T = TypeVar('T')


def retry_on_write_conflict(
    func: Callable[[], T],
    max_retries: int = 3,
    base_delay: float = 0.1,
) -> T:
    """
    重试机制：处理 DuckDB 写写冲突
    使用指数退避策略
    """
    last_exception = None
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            error_str = str(e)
            if "write-write conflict" in error_str or "TransactionContext Error" in error_str:
                last_exception = e
                delay = base_delay * (2 ** attempt)
                logger.warning(
                    "写写冲突，第 %d 次重试，等待 %.2f 秒: %s",
                    attempt + 1, delay, error_str[:100]
                )
                time.sleep(delay)
            else:
                raise
    # 所有重试都失败了
    logger.error("写写冲突重试 %d 次后仍然失败", max_retries)
    raise last_exception


# ============================================
# 取消监控守护线程 (Watchdog)
# ============================================

# 模块级单例控制，防止多次初始化启动多个线程
_watchdog_started = False
_watchdog_lock = threading.Lock()


def start_cancellation_watchdog(interval_seconds: int = 60):
    """启动取消监控守护线程（单例）"""
    global _watchdog_started
    
    with _watchdog_lock:
        if _watchdog_started:
            logger.debug("取消监控守护线程已在运行，跳过重复启动")
            return
        
        _watchdog_started = True
    
    def watchdog_loop():
        while True:
            try:
                time.sleep(interval_seconds)
                cleanup_cancelling_timeout()
                cleanup_stale_registry()
            except Exception as e:
                logger.error(f"取消监控异常: {e}")
    
    thread = threading.Thread(target=watchdog_loop, daemon=True)
    thread.start()
    logger.info("取消监控守护线程已启动")


def cleanup_cancelling_timeout(timeout_seconds: int = 60):
    """清理超时的 CANCELLING 任务，将其标记为 CANCELLED"""
    try:
        with with_system_connection() as connection:
            cutoff = get_storage_time() - timedelta(seconds=timeout_seconds)
            rows = connection.execute(
                f"""
                UPDATE {ASYNC_TASKS_TABLE}
                SET status = ?, error_message = ?, completed_at = ?
                WHERE status = ? AND started_at < ?
                RETURNING task_id
                """,
                [
                    TaskStatus.CANCELLED.value,
                    "取消超时，强制标记",
                    get_storage_time(),
                    TaskStatus.CANCELLING.value,
                    cutoff,
                ],
            ).fetchall()
        
        if rows:
            logger.info(f"清理超时 CANCELLING 任务: {[r[0] for r in rows]}")
        return len(rows)
    except Exception as e:
        logger.error(f"清理超时 CANCELLING 任务失败: {e}")
        return 0


def cleanup_stale_registry():
    """清理注册表中的残留条目"""
    try:
        from core.connection_registry import connection_registry
        # 忽略 _cleanup 后缀的临时任务（cleanup 操作很快，不应被清理）
        count = connection_registry.cleanup_stale(
            max_age_seconds=1800,
            ignore_suffix="_cleanup"
        )
        if count:
            logger.info(f"清理注册表残留条目: {count}")
    except Exception as e:
        logger.error(f"清理注册表残留条目失败: {e}")


class TaskStatus(str, Enum):
    """任务状态枚举"""

    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLING = "cancelling"  # 取消中（用于取消信号模式）
    CANCELLED = "cancelled"    # 已取消（最终状态）


@dataclass
class AsyncTask:
    """异步任务数据结构"""

    task_id: str
    status: TaskStatus
    created_at: datetime
    query: str
    task_type: str = "query"
    datasource: Optional[Dict[str, Any]] = None
    result_file_path: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    execution_time: Optional[float] = None
    result_info: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式，便于返回给前端"""
        result = asdict(self)
        # 将后端状态映射为前端期望的状态值
        status_mapping = {
            TaskStatus.QUEUED.value: "pending",
            TaskStatus.RUNNING.value: "running",
            TaskStatus.SUCCESS.value: "completed",
            TaskStatus.FAILED.value: "failed",
            TaskStatus.CANCELLING.value: "cancelling",
            TaskStatus.CANCELLED.value: "cancelled",
        }
        result["status"] = status_mapping.get(self.status.value, self.status.value)
        # 前端期望 sql 字段，后端存储为 query
        result["sql"] = result.get("query", "")
        for key in ["created_at", "started_at", "completed_at"]:
            if result.get(key):
                result[key] = format_storage_time_for_response(result[key])
        return result


class TaskManager:
    """异步任务管理器（基于DuckDB持久化）"""

    def __init__(self):
        self._lock = Lock()
        self._ensure_tables()
        start_cancellation_watchdog()  # 单例控制，多次调用不会重复启动
        logger.info("异步任务管理器初始化完成（持久化存储）")

    # --------------------------------------------------------------------- #
    # 初始化与工具方法
    # --------------------------------------------------------------------- #

    def _ensure_tables(self) -> None:
        """确保所需的DuckDB表已创建"""
        with with_system_connection() as connection:
            self._migrate_legacy_tables(connection)

            connection.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {ASYNC_TASKS_TABLE} (
                    task_id TEXT PRIMARY KEY,
                    status TEXT,
                    query TEXT,
                    task_type TEXT,
                    datasource JSON,
                    result_file_path TEXT,
                    error_message TEXT,
                    created_at TIMESTAMP,
                    started_at TIMESTAMP,
                    completed_at TIMESTAMP,
                    execution_time DOUBLE,
                    result_info JSON,
                    metadata JSON
                )
                """
            )

            connection.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TASK_EXPORTS_TABLE} (
                    export_id TEXT PRIMARY KEY,
                    task_id TEXT,
                    file_path TEXT,
                    file_size BIGINT,
                    created_at TIMESTAMP,
                    expires_at TIMESTAMP,
                    status TEXT,
                    metadata JSON
                )
                """
            )

            connection.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{ASYNC_TASKS_TABLE}_status ON {ASYNC_TASKS_TABLE}(status)"
            )

    def _migrate_legacy_tables(self, connection) -> None:
        """迁移旧版本的系统表名称"""
        try:
            pass
        except Exception as exc:
            logger.warning("检查旧版系统表失败: %s", exc)

    @staticmethod
    def _json_default(value: Any) -> Any:
        """JSON序列化默认处理"""
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        if isinstance(value, Enum):
            return value.value
        return str(value)

    def _serialize_json(self, payload: Optional[Dict[str, Any]]) -> Optional[str]:
        if payload is None:
            return None
        return json.dumps(payload, ensure_ascii=False, default=self._json_default)

    @staticmethod
    def _deserialize_json(payload: Optional[Any]) -> Optional[Dict[str, Any]]:
        if payload in (None, "", {}):
            return None
        if isinstance(payload, dict):
            return payload
        try:
            return json.loads(payload)
        except Exception:
            logger.debug("JSON解析失败，返回原始值: %s", payload)
            return None

    @staticmethod
    def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None

    @staticmethod
    def _coerce_status(value: Any) -> TaskStatus:
        if isinstance(value, TaskStatus):
            return value
        normalized = str(value or "").lower()
        if normalized in {"success", "completed"}:
            return TaskStatus.SUCCESS
        if normalized == "running":
            return TaskStatus.RUNNING
        if normalized == "failed":
            return TaskStatus.FAILED
        if normalized == "cancelling":
            return TaskStatus.CANCELLING
        if normalized == "cancelled":
            return TaskStatus.CANCELLED
        return TaskStatus.QUEUED

    @staticmethod
    def _normalize_datetime(value: Optional[datetime]) -> Optional[datetime]:
        """确保写入数据库的时间为 naive，避免 tz 混淆"""
        return normalize_to_storage_timezone(value)

    def _row_to_async_task(self, row: Any) -> AsyncTask:
        (
            task_id,
            status,
            query,
            task_type,
            datasource,
            result_file_path,
            error_message,
            created_at,
            started_at,
            completed_at,
            execution_time,
            result_info,
            metadata,
        ) = row

        return AsyncTask(
            task_id=task_id,
            status=self._coerce_status(status),
            created_at=created_at or get_storage_time(),
            query=query or "",
            task_type=task_type or "query",
            datasource=self._deserialize_json(datasource),
            result_file_path=result_file_path,
            error_message=error_message,
            started_at=started_at,
            completed_at=completed_at,
            execution_time=execution_time,
            result_info=self._deserialize_json(result_info),
            metadata=self._deserialize_json(metadata),
        )

    def _upsert_task(
        self,
        task_id: str,
        status: TaskStatus,
        query: str,
        task_type: str,
        datasource: Optional[Dict[str, Any]],
        result_file_path: Optional[str],
        error_message: Optional[str],
        created_at: datetime,
        started_at: Optional[datetime],
        completed_at: Optional[datetime],
        execution_time: Optional[float],
        result_info: Optional[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]],
    ) -> None:
        datasource_json = self._serialize_json(datasource)
        result_info_json = self._serialize_json(result_info)
        metadata_json = self._serialize_json(metadata)

        created_at = self._normalize_datetime(created_at)
        started_at = self._normalize_datetime(started_at)
        completed_at = self._normalize_datetime(completed_at)

        with with_system_connection() as connection:
            connection.execute(
                f'DELETE FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?', [task_id]
            )
            connection.execute(
                f"""
                INSERT INTO {ASYNC_TASKS_TABLE} (
                    task_id, status, query, task_type, datasource,
                    result_file_path, error_message,
                    created_at, started_at, completed_at, execution_time,
                    result_info, metadata
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    task_id,
                    status.value,
                    query,
                    task_type,
                    datasource_json,
                    result_file_path,
                    error_message,
                    created_at,
                    started_at,
                    completed_at,
                    execution_time,
                    result_info_json,
                    metadata_json,
                ],
            )

    # --------------------------------------------------------------------- #
    # 对外接口
    # --------------------------------------------------------------------- #

    def create_task(
        self,
        query: str,
        task_type: str = "query",
        datasource: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """创建新任务"""
        task_id = str(uuid.uuid4())
        created_at = get_storage_time()

        self._upsert_task(
            task_id=task_id,
            status=TaskStatus.QUEUED,
            query=query,
            task_type=task_type,
            datasource=datasource,
            result_file_path=None,
            error_message=None,
            created_at=created_at,
            started_at=None,
            completed_at=None,
            execution_time=None,
            result_info=None,
            metadata=metadata,
        )

        logger.info("创建新任务: %s (%s)", task_id, task_type)
        return task_id

    def add_task(self, task_id: str, task_info: Dict[str, Any]) -> str:
        """
        兼容旧接口：直接写入一条任务记录
        """
        info = dict(task_info)
        status = self._coerce_status(info.pop("status", TaskStatus.QUEUED.value))
        query = info.pop("query", "") or ""
        task_type = info.pop("type", info.pop("task_type", "async"))
        datasource = info.pop("datasource", None)
        created_at = (
            self._parse_datetime(info.pop("created_at", None)) or get_storage_time()
        )
        result_file_path = info.get("file_path") or info.get("result_file_path")
        error_message = info.get("error") or info.get("error_message")
        result_info = info.pop("result_info", None)

        self._upsert_task(
            task_id=task_id,
            status=status,
            query=query,
            task_type=task_type,
            datasource=datasource,
            result_file_path=result_file_path,
            error_message=error_message,
            created_at=created_at,
            started_at=None,
            completed_at=None,
            execution_time=None,
            result_info=result_info,
            metadata=info,
        )
        return task_id

    def start_task(self, task_id: str) -> bool:
        """标记任务为运行中"""
        def _do_start() -> bool:
            with self._lock:
                with with_system_connection() as conn:
                    # 先查询当前状态用于调试
                    current_row = conn.execute(
                        f'SELECT status FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    current_status = current_row[0] if current_row else "NOT_FOUND"
                    logger.debug("[TASK_DEBUG] start_task 开始: task_id=%s, 当前状态=%s", task_id, current_status)
                    
                    started_at = get_storage_time()
                    rows = conn.execute(
                        f"""
                        UPDATE {ASYNC_TASKS_TABLE}
                        SET status = ?, started_at = ?
                        WHERE task_id = ? AND status IN (?, ?)
                        RETURNING task_id
                        """,
                        [
                            TaskStatus.RUNNING.value,
                            started_at,
                            task_id,
                            TaskStatus.QUEUED.value,
                            TaskStatus.RUNNING.value,
                        ],
                    ).fetchall()
                    
                    # 更新后再查询确认
                    after_row = conn.execute(
                        f'SELECT status FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    after_status = after_row[0] if after_row else "NOT_FOUND"
                    logger.debug("[TASK_DEBUG] start_task 完成: task_id=%s, 更新后状态=%s, 影响行数=%d", 
                               task_id, after_status, len(rows))
                    return bool(rows)

        try:
            success = retry_on_write_conflict(_do_start)
            if success:
                logger.info("任务开始运行: %s", task_id)
            else:
                logger.warning("任务状态不允许启动: %s", task_id)
            return success
        except Exception as e:
            logger.error("start_task 失败: %s -> %s", task_id, e)
            return False

    def complete_task(self, task_id: str, result_info: Dict[str, Any]) -> bool:
        """标记任务为成功"""
        def _do_complete() -> bool:
            with self._lock:
                with with_system_connection() as conn:
                    completed_at = get_storage_time()
                    started_row = conn.execute(
                        f'SELECT started_at, status FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    if not started_row:
                        logger.warning("[TASK_DEBUG] complete_task: 任务不存在: %s", task_id)
                        return False

                    current_status = started_row[1] if len(started_row) > 1 else None
                    logger.debug("[TASK_DEBUG] complete_task 开始: task_id=%s, 当前状态=%s", task_id, current_status)
                    
                    # 如果任务已被取消，不再更新为成功
                    if current_status in (TaskStatus.FAILED.value, TaskStatus.CANCELLING.value):
                        logger.info("[TASK_DEBUG] complete_task: 任务已被取消或失败，跳过完成: %s, 状态: %s", task_id, current_status)
                        return False

                    started_at = started_row[0]
                    started_at = self._normalize_datetime(started_at)
                    execution_time = (
                        (completed_at - started_at).total_seconds()
                        if isinstance(started_at, datetime)
                        else None
                    )

                    result_file_path = (
                        result_info.get("result_file_path")
                        or result_info.get("file_path")
                        or result_info.get("download_url")
                    )

                    rows = conn.execute(
                        f"""
                        UPDATE {ASYNC_TASKS_TABLE}
                        SET status = ?, result_file_path = ?, result_info = ?,
                            error_message = NULL, completed_at = ?, execution_time = ?
                        WHERE task_id = ? AND status = ?
                        RETURNING task_id
                        """,
                        [
                            TaskStatus.SUCCESS.value,
                            result_file_path,
                            self._serialize_json(result_info),
                            completed_at,
                            execution_time,
                            task_id,
                            TaskStatus.RUNNING.value,  # 只更新状态为 RUNNING 的任务
                        ],
                    ).fetchall()

                    # 更新后再查询确认
                    after_row = conn.execute(
                        f'SELECT status FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    after_status = after_row[0] if after_row else "NOT_FOUND"
                    
                    success = bool(rows)
                    if success:
                        logger.debug("[TASK_DEBUG] complete_task 成功: task_id=%s, 更新后状态=%s", task_id, after_status)
                    else:
                        logger.warning("[TASK_DEBUG] complete_task 失败: task_id=%s, 当前状态=%s (期望 running), 更新后状态=%s, 影响行数=%d", 
                                      task_id, current_status, after_status, len(rows))
                    return success

        try:
            # 增加重试次数和延迟以应对 DuckDB WAL checkpoint 期间的写写冲突
            return retry_on_write_conflict(_do_complete, max_retries=5, base_delay=0.2)
        except Exception as e:
            logger.error("complete_task 最终失败: %s -> %s", task_id, e)
            return False

    def fail_task(self, task_id: str, error_message: str) -> bool:
        """标记任务为失败"""
        def _do_fail() -> bool:
            with self._lock:
                with with_system_connection() as conn:
                    completed_at = get_storage_time()
                    started_row = conn.execute(
                        f'SELECT started_at FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    execution_time = None
                    if started_row and isinstance(started_row[0], datetime):
                        started_at = self._normalize_datetime(started_row[0])
                        if started_at:
                            execution_time = (completed_at - started_at).total_seconds()

                    rows = conn.execute(
                        f"""
                        UPDATE {ASYNC_TASKS_TABLE}
                        SET status = ?, error_message = ?, completed_at = ?, execution_time = ?
                        WHERE task_id = ?
                        RETURNING task_id
                        """,
                        [
                            TaskStatus.FAILED.value,
                            error_message,
                            completed_at,
                            execution_time,
                            task_id,
                        ],
                    ).fetchall()

                    success = bool(rows)
                    if success:
                        logger.info("任务执行失败: %s -> %s", task_id, error_message)
                    else:
                        logger.warning("任务状态不允许标记失败: %s", task_id)
                    return success

        try:
            # 增加重试次数和延迟以应对 DuckDB WAL checkpoint 期间的写写冲突
            return retry_on_write_conflict(_do_fail, max_retries=5, base_delay=0.2)
        except Exception as e:
            logger.error("fail_task 最终失败: %s -> %s", task_id, e)
            return False

    def force_fail_task(
        self, task_id: str, error_message: str, metadata_update: Optional[Dict[str, Any]] = None
    ) -> bool:
        """无论当前状态，强制将任务标记为失败（手动取消等场景）"""
        def _do_force_fail():
            with self._lock:
                completed_at = get_storage_time()
                with with_system_connection() as connection:
                    # 先查询当前状态用于调试
                    current_row = connection.execute(
                        f'SELECT status, started_at FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    current_status = current_row[0] if current_row else "NOT_FOUND"
                    logger.debug("[TASK_DEBUG] force_fail_task 开始: task_id=%s, 当前状态=%s", task_id, current_status)
                    
                    started_row = current_row
                    execution_time = None
                    if started_row and len(started_row) > 1 and isinstance(started_row[1], datetime):
                        started_at = self._normalize_datetime(started_row[1])
                        if started_at:
                            execution_time = (completed_at - started_at).total_seconds()

                    rows = connection.execute(
                        f"""
                        UPDATE {ASYNC_TASKS_TABLE}
                        SET status = ?, error_message = ?, completed_at = ?, execution_time = ?
                        WHERE task_id = ?
                        RETURNING task_id
                        """,
                        [
                            TaskStatus.FAILED.value,
                            error_message,
                            completed_at,
                            execution_time,
                            task_id,
                        ],
                    ).fetchall()
                    
                    # 更新后再查询确认
                    after_row = connection.execute(
                        f'SELECT status FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    after_status = after_row[0] if after_row else "NOT_FOUND"
                    logger.debug("[TASK_DEBUG] force_fail_task 完成: task_id=%s, 更新后状态=%s, 影响行数=%d", 
                               task_id, after_status, len(rows))

                return bool(rows)

        try:
            # 增加重试次数以应对高并发冲突
            success = retry_on_write_conflict(_do_force_fail, max_retries=5)
        except Exception as e:
            # 最终确认：如果是写写冲突，检查是否任务其实已经被其他事务（如用户取消）更新了
            error_str = str(e)
            logger.error("[TASK_DEBUG] force_fail_task 异常: task_id=%s, error=%s", task_id, error_str)
            if "write-write conflict" in error_str or "TransactionContext Error" in error_str:
                current_task = self.get_task(task_id)
                logger.info("[TASK_DEBUG] force_fail_task 冲突后查询: task_id=%s, 当前状态=%s", 
                           task_id, current_task.status.value if current_task else "NOT_FOUND")
                if current_task and current_task.status in (
                    TaskStatus.CANCELLING, 
                    TaskStatus.FAILED, 
                    TaskStatus.SUCCESS
                ):
                    logger.info(
                        "Force fail 遇到冲突但任务已处于终端状态: %s (Status: %s)，视为成功",
                        task_id, current_task.status.value
                    )
                    return True
            
            logger.error("force_fail_task 最终失败: %s -> %s", task_id, error_str)
            return False

        if success and metadata_update:
            try:
                self.update_task(task_id, metadata_update)
            except Exception as exc:
                logger.warning("更新任务元数据失败 %s: %s", task_id, exc)

        return success

    def request_cancellation(self, task_id: str, reason: str = "用户手动取消") -> bool:
        """
        请求取消任务（设置取消标志 + 中断查询）
        
        流程：
        1. 将状态更新为 CANCELLING
        2. 调用 connection_registry.interrupt() 中断查询
        3. 更新取消元数据
        """
        from core.connection_registry import connection_registry
        
        with with_system_connection() as connection:
            rows = connection.execute(
                f"""
                UPDATE {ASYNC_TASKS_TABLE}
                SET status = ?
                WHERE task_id = ? AND status IN (?, ?)
                RETURNING task_id
                """,
                [
                    TaskStatus.CANCELLING.value,
                    task_id,
                    TaskStatus.QUEUED.value,
                    TaskStatus.RUNNING.value,
                ],
            ).fetchall()

        success = bool(rows)
        if success:
            logger.info("任务取消请求已设置: %s, 原因: %s", task_id, reason)
            
            # 尝试中断正在执行的查询
            try:
                interrupted = connection_registry.interrupt(task_id)
                if interrupted:
                    logger.info("已中断任务 %s 的查询执行", task_id)
                else:
                    logger.info("任务 %s 不在注册表中（可能已完成或尚未开始）", task_id)
            except Exception as exc:
                logger.warning("中断任务 %s 失败: %s", task_id, exc)
            
            # 更新取消元数据
            try:
                self.update_task(task_id, {
                    "cancellation_requested": True,
                    "cancel_reason": reason,
                    "cancelled_at": get_storage_time().isoformat(),
                })
            except Exception as exc:
                logger.warning("更新取消元数据失败 %s: %s", task_id, exc)
        else:
            logger.warning("任务状态不允许取消或任务不存在: %s", task_id)
        return success

    def mark_cancelled(self, task_id: str, reason: str = "查询被中断") -> bool:
        """
        标记任务为已取消（最终状态）
        
        在捕获 duckdb.InterruptException 后调用此方法
        
        Args:
            task_id: 任务 ID
            reason: 取消原因
            
        Returns:
            True if status was updated successfully
        """
        def _do_mark_cancelled() -> bool:
            with self._lock:
                with with_system_connection() as conn:
                    completed_at = get_storage_time()
                    
                    # 查询开始时间以计算执行时长
                    started_row = conn.execute(
                        f'SELECT started_at FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    
                    execution_time = None
                    if started_row and isinstance(started_row[0], datetime):
                        started_at = self._normalize_datetime(started_row[0])
                        if started_at:
                            execution_time = (completed_at - started_at).total_seconds()

                    rows = conn.execute(
                        f"""
                        UPDATE {ASYNC_TASKS_TABLE}
                        SET status = ?, error_message = ?, completed_at = ?, execution_time = ?
                        WHERE task_id = ?
                        RETURNING task_id
                        """,
                        [
                            TaskStatus.CANCELLED.value,
                            reason,
                            completed_at,
                            execution_time,
                            task_id,
                        ],
                    ).fetchall()

                    return bool(rows)

        try:
            success = retry_on_write_conflict(_do_mark_cancelled, max_retries=3)
            if success:
                logger.info("任务已标记为取消: %s, 原因: %s", task_id, reason)
            else:
                logger.warning("标记任务取消失败: %s", task_id)
            return success
        except Exception as e:
            logger.error("mark_cancelled 失败: %s -> %s", task_id, e)
            return False

    def is_cancellation_requested(self, task_id: str) -> bool:
        """检查任务是否被请求取消"""
        with with_system_connection() as connection:
            row = connection.execute(
                f"SELECT status FROM {ASYNC_TASKS_TABLE} WHERE task_id = ?",
                [task_id],
            ).fetchone()
        return row is not None and row[0] in (
            TaskStatus.CANCELLING.value, 
            TaskStatus.CANCELLED.value
        )

    def get_task(self, task_id: str) -> Optional[AsyncTask]:
        """获取任务信息"""
        with with_system_connection() as connection:
            row = connection.execute(
                f"""
                SELECT task_id, status, query, task_type, datasource,
                       result_file_path, error_message, created_at,
                       started_at, completed_at, execution_time,
                       result_info, metadata
                FROM {ASYNC_TASKS_TABLE}
                WHERE task_id = ?
                """,
                [task_id],
            ).fetchone()

        return self._row_to_async_task(row) if row else None

    def list_tasks(
        self, 
        limit: int = 100, 
        offset: int = 0,
        order_by: str = "created_at"
    ) -> List[Dict[str, Any]]:
        """
        列出任务（支持分页和排序）
        
        Args:
            limit: 返回数量限制
            offset: 偏移量
            order_by: 排序字段 (created_at, started_at, completed_at, status)
        """
        # 白名单验证排序字段
        allowed_order_by = {"created_at", "started_at", "completed_at", "status"}
        if order_by not in allowed_order_by:
            order_by = "created_at"
        
        with with_system_connection() as connection:
            rows = connection.execute(
                f"""
                SELECT task_id, status, query, task_type, datasource,
                       result_file_path, error_message, created_at,
                       started_at, completed_at, execution_time,
                       result_info, metadata
                FROM {ASYNC_TASKS_TABLE}
                ORDER BY {order_by} DESC
                LIMIT ? OFFSET ?
                """,
                [limit, offset],
            ).fetchall()
            
            # 获取总数用于分页
            total_row = connection.execute(
                f"SELECT COUNT(*) FROM {ASYNC_TASKS_TABLE}"
            ).fetchone()
            total = total_row[0] if total_row else 0

        return [self._row_to_async_task(row).to_dict() for row in rows], total

    def get_pending_tasks(self) -> List[str]:
        """获取排队中的任务ID"""
        with with_system_connection() as connection:
            rows = connection.execute(
                f"SELECT task_id FROM {ASYNC_TASKS_TABLE} WHERE status = ?",
                [TaskStatus.QUEUED.value],
            ).fetchall()
        return [row[0] for row in rows]

    def update_task(self, task_id: str, updates: Dict[str, Any]) -> bool:
        """通用字段更新，用于兼容旧接口"""
        if not updates:
            return False

        with self._lock, with_system_connection() as connection:
            metadata_row = connection.execute(
                f'SELECT metadata FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                [task_id],
            ).fetchone()

            if not metadata_row:
                logger.warning("任务不存在，无法更新: %s", task_id)
                return False

            metadata = self._deserialize_json(metadata_row[0]) or {}

            columns: List[str] = []
            params: List[Any] = []

            if "status" in updates:
                status = self._coerce_status(updates.pop("status"))
                columns.append("status = ?")
                params.append(status.value)

            if "result_file_path" in updates or "file_path" in updates:
                file_path = updates.pop("result_file_path", None) or updates.pop(
                    "file_path", None
                )
                columns.append("result_file_path = ?")
                params.append(file_path)

            if "error_message" in updates:
                columns.append("error_message = ?")
                params.append(updates.pop("error_message"))

            # 其余字段合并到metadata
            metadata.update(updates)
            columns.append("metadata = ?")
            params.append(self._serialize_json(metadata))

            params.append(task_id)
            sql = f'UPDATE "{ASYNC_TASKS_TABLE}" SET {", ".join(columns)} WHERE task_id = ? RETURNING task_id'
            rows = connection.execute(sql, params).fetchall()

        success = bool(rows)
        if success:
            logger.debug("任务已更新: %s -> %s", task_id, updates)
        else:
            logger.warning("任务更新失败: %s", task_id)
        return success

    def record_export(
        self,
        task_id: str,
        file_path: str,
        expires_at: Optional[datetime] = None,
        file_size: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """记录导出文件信息"""
        export_id = str(uuid.uuid4())
        created_at = get_storage_time()
        with with_system_connection() as connection:
            connection.execute(
                f"""
                INSERT INTO {TASK_EXPORTS_TABLE} (
                    export_id, task_id, file_path, file_size,
                    created_at, expires_at, status, metadata
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    export_id,
                    task_id,
                    file_path,
                    file_size,
                    created_at,
                    expires_at,
                    "active",
                    self._serialize_json(metadata),
                ],
            )
        return export_id

    def cleanup_expired_exports(
        self, expire_before: Optional[datetime] = None
    ) -> int:
        """清理过期的导出文件并更新记录"""
        cutoff = normalize_to_storage_timezone(expire_before) or get_storage_time()
        exports_dir = Path(config_manager.get_exports_dir())
        removed = 0

        with with_system_connection() as connection:
            rows = connection.execute(
                f"""
                SELECT export_id, file_path FROM {TASK_EXPORTS_TABLE}
                WHERE expires_at IS NOT NULL AND expires_at <= ?
                """,
                [cutoff],
            ).fetchall()

            for export_id, file_path in rows:
                if file_path:
                    path = Path(file_path)
                    if not path.is_absolute():
                        path = exports_dir / path
                    if path.exists():
                        try:
                            path.unlink()
                            removed += 1
                        except Exception as exc:
                            logger.warning("删除导出文件失败 %s: %s", path, exc)

                connection.execute(
                    f"UPDATE {TASK_EXPORTS_TABLE} SET status = 'expired' WHERE export_id = ?",
                    [export_id],
                )

            connection.execute(
                f"DELETE FROM {TASK_EXPORTS_TABLE} WHERE status = 'expired' AND expires_at <= ?",
                [cutoff],
            )

        return removed

    def cleanup_stuck_cancelling_tasks(self) -> int:
        """清理卡住的取消中任务
        
        将长时间处于 cancelling 状态的任务标记为 failed
        通常用于迁移后或服务重启后清理历史遗留任务
        """
        with with_system_connection() as connection:
            completed_at = get_storage_time()
            
            # 查找所有 cancelling 状态的任务
            rows = connection.execute(
                f"SELECT task_id FROM {ASYNC_TASKS_TABLE} WHERE status = ?",
                [TaskStatus.CANCELLING.value],
            ).fetchall()
            
            if not rows:
                logger.info("没有找到卡住的取消中任务")
                return 0
            
            # 将它们全部更新为 failed
            for (task_id,) in rows:
                connection.execute(
                    f"""
                    UPDATE {ASYNC_TASKS_TABLE}
                    SET status = ?, error_message = ?, completed_at = ?
                    WHERE task_id = ?
                    """,
                    [TaskStatus.FAILED.value, "任务被取消（历史任务清理）", completed_at, task_id],
                )
                logger.info(f"已清理卡住的取消中任务: {task_id}")
            
            logger.info(f"清理完成: {len(rows)} 个任务已标记为失败")
            return len(rows)


# 全局任务管理器实例
task_manager = TaskManager()
