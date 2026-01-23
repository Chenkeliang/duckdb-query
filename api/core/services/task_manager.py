"""
Async Task Manager
Manages async task status, persistence and export records
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

from core.common.config_manager import config_manager
from core.database.duckdb_pool import with_system_connection
from core.common.timezone_utils import (
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
    Retry mechanism: handle DuckDB write-write conflicts
    Using exponential backoff strategy
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
                    "Write-write conflict, retry %d, waiting %.2f seconds: %s",
                    attempt + 1, delay, error_str[:100]
                )
                time.sleep(delay)
            else:
                raise
    # All retries failed
    logger.error("Write-write conflict retry %d times still failed", max_retries)
    raise last_exception


# ============================================
# Cancellation monitoring daemon thread (Watchdog)
# ============================================

# Module-level singleton control to prevent multiple thread initialization
_watchdog_started = False
_watchdog_lock = threading.Lock()


def start_cancellation_watchdog(interval_seconds: int = 60):
    """Start cancellation monitoring daemon thread (singleton)"""
    global _watchdog_started

    with _watchdog_lock:
        if _watchdog_started:
            logger.debug("Cancel monitoring daemon thread is already running, skipping duplicate start")
            return

        _watchdog_started = True

    def watchdog_loop():
        while True:
            try:
                time.sleep(interval_seconds)
                cleanup_cancelling_timeout()
                cleanup_stale_registry()
            except Exception as e:
                logger.error(f"Cancel monitoring exception: {e}")

    thread = threading.Thread(target=watchdog_loop, daemon=True)
    thread.start()
    logger.info("Cancellation monitoring daemon started")


def cleanup_cancelling_timeout(timeout_seconds: int = 60):
    """Clean up timed-out CANCELLING tasks and mark them as CANCELLED"""
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
                    "Cancellation timeout, force marked",
                    get_storage_time(),
                    TaskStatus.CANCELLING.value,
                    cutoff,
                ],
            ).fetchall()

        if rows:
            logger.info(f"Cleaning up timed-out CANCELLING tasks: {[r[0] for r in rows]}")
        return len(rows)
    except Exception as e:
        logger.error(f"Cleaning up timed-out CANCELLING tasksfailed: {e}")
        return 0


def cleanup_stale_registry():
    """Clean up residual entries in registry"""
    try:
        from core.database.connection_registry import connection_registry
        # Ignore temporary tasks with _cleanup suffix (cleanup operations are fast and should not be cleaned)
        count = connection_registry.cleanup_stale(
            max_age_seconds=1800,
            ignore_suffix="_cleanup"
        )
        if count:
            logger.info(f"Cleaning up registry residual entries: {count}")
    except Exception as e:
        logger.error(f"Cleaning up registry residual entriesfailed: {e}")


class TaskStatus(str, Enum):
    """Task status enumeration"""

    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLING = "cancelling"  # cancelling (for cancellation signal mode)
    CANCELLED = "cancelled"    # cancelled (final status)


@dataclass
class AsyncTask:
    """Async task data structure"""

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
        """Convert to dictionary format for frontend response"""
        result = asdict(self)
        # Map backend status to frontend expected status values
        status_mapping = {
            TaskStatus.QUEUED.value: "pending",
            TaskStatus.RUNNING.value: "running",
            TaskStatus.SUCCESS.value: "completed",
            TaskStatus.FAILED.value: "failed",
            TaskStatus.CANCELLING.value: "cancelling",
            TaskStatus.CANCELLED.value: "cancelled",
        }
        result["status"] = status_mapping.get(self.status.value, self.status.value)
        # Frontend expects sql field, backend stores as query
        result["sql"] = result.get("query", "")
        for key in ["created_at", "started_at", "completed_at"]:
            if result.get(key):
                result[key] = format_storage_time_for_response(result[key])
        return result


class TaskManager:
    """Async Task Manager（基于DuckDB持久化）"""

    def __init__(self):
        self._lock = Lock()
        self._ensure_tables()
        start_cancellation_watchdog()  # Singleton control, multiple calls will not start repeatedly
        logger.info("Async task manager initialization completed (persistent storage)")

    # --------------------------------------------------------------------- #
    # Initialization and utility methods
    # --------------------------------------------------------------------- #

    def _ensure_tables(self) -> None:
        """Ensure required DuckDB tables are created"""
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
        """Migrate legacy system table names"""
        try:
            pass
        except Exception as exc:
            logger.warning("Failed to check legacy system tables: %s", exc)

    @staticmethod
    def _json_default(value: Any) -> Any:
        """JSON serialization default handler"""
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
            logger.debug("JSON parsing failed, returning original value: %s", payload)
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
        """Ensure time written to database is naive to avoid tz confusion"""
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
    # Public interface
    # --------------------------------------------------------------------- #

    def create_task(
        self,
        query: str,
        task_type: str = "query",
        datasource: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Creating new task"""
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

        logger.info("Creating new task: %s (%s)", task_id, task_type)
        return task_id

    def add_task(self, task_id: str, task_info: Dict[str, Any]) -> str:
        """
        Compatible with old interface: directly write a task record
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
        """Mark task as running"""
        def _do_start() -> bool:
            with self._lock:
                with with_system_connection() as conn:
                    # Query current status for debugging
                    current_row = conn.execute(
                        f'SELECT status FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    current_status = current_row[0] if current_row else "NOT_FOUND"
                    logger.debug("[TASK_DEBUG] start_task beginning: task_id=%s, current status=%s", task_id, current_status)

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

                    # Query again after update to confirm
                    after_row = conn.execute(
                        f'SELECT status FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    after_status = after_row[0] if after_row else "NOT_FOUND"
                    logger.debug("[TASK_DEBUG] start_task completed: task_id=%s, updated status=%s, affected rows=%d",
                               task_id, after_status, len(rows))
                    return bool(rows)

        try:
            success = retry_on_write_conflict(_do_start)
            if success:
                logger.info("Task开始运行: %s", task_id)
            else:
                logger.warning("Task status does not allow starting: %s", task_id)
            return success
        except Exception as e:
            logger.error("start_task failed: %s -> %s", task_id, e)
            return False

    def complete_task(self, task_id: str, result_info: Dict[str, Any]) -> bool:
        """Mark task as successful"""
        def _do_complete() -> bool:
            with self._lock:
                with with_system_connection() as conn:
                    completed_at = get_storage_time()
                    started_row = conn.execute(
                        f'SELECT started_at, status FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    if not started_row:
                        logger.warning("[TASK_DEBUG] complete_task: Task does not exist: %s", task_id)
                        return False

                    current_status = started_row[1] if len(started_row) > 1 else None
                    logger.debug("[TASK_DEBUG] complete_task beginning: task_id=%s, current status=%s", task_id, current_status)

                    # If task has been cancelled, do not update to success
                    if current_status in (TaskStatus.FAILED.value, TaskStatus.CANCELLING.value):
                        logger.info("[TASK_DEBUG] complete_task: Task has been cancelled or failed, skip completion: %s, status: %s", task_id, current_status)
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
                            TaskStatus.RUNNING.value,  # Only update tasks with RUNNING status
                        ],
                    ).fetchall()

                    # Query again after update to confirm
                    after_row = conn.execute(
                        f'SELECT status FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    after_status = after_row[0] if after_row else "NOT_FOUND"

                    success = bool(rows)
                    if success:
                        logger.debug("[TASK_DEBUG] complete_task successful: task_id=%s, updated status=%s", task_id, after_status)
                    else:
                        logger.warning("[TASK_DEBUG] complete_task failed: task_id=%s, current status=%s (expected running), updated status=%s, affected rows=%d",
                                      task_id, current_status, after_status, len(rows))
                    return success

        try:
            # Increase retry count and delay to handle write-write conflicts during DuckDB WAL checkpoint
            return retry_on_write_conflict(_do_complete, max_retries=5, base_delay=0.2)
        except Exception as e:
            logger.error("complete_task finally failed: %s -> %s", task_id, e)
            return False

    def fail_task(self, task_id: str, error_message: str) -> bool:
        """Mark task as failed"""
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
                        logger.info("Task execution failed: %s -> %s", task_id, error_message)
                    else:
                        logger.warning("Taskstatus不允许标记failed: %s", task_id)
                    return success

        try:
            # Increase retry count and delay to handle write-write conflicts during DuckDB WAL checkpoint
            return retry_on_write_conflict(_do_fail, max_retries=5, base_delay=0.2)
        except Exception as e:
            logger.error("fail_task finally failed: %s -> %s", task_id, e)
            return False

    def force_fail_task(
        self, task_id: str, error_message: str, metadata_update: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Force mark task as failed regardless of current status (manual cancellation scenarios)"""
        def _do_force_fail():
            with self._lock:
                completed_at = get_storage_time()
                with with_system_connection() as connection:
                    # Query current status for debugging
                    current_row = connection.execute(
                        f'SELECT status, started_at FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    current_status = current_row[0] if current_row else "NOT_FOUND"
                    logger.debug("[TASK_DEBUG] force_fail_task beginning: task_id=%s, current status=%s", task_id, current_status)

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

                    # Query again after update to confirm
                    after_row = connection.execute(
                        f'SELECT status FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    after_status = after_row[0] if after_row else "NOT_FOUND"
                    logger.debug("[TASK_DEBUG] force_fail_task completed: task_id=%s, updated status=%s, affected rows=%d",
                               task_id, after_status, len(rows))

                return bool(rows)

        try:
            # 增加重试次数以应对高并发冲突
            success = retry_on_write_conflict(_do_force_fail, max_retries=5)
        except Exception as e:
            # 最终确认：如果是写写冲突，检查是否Task其实已经被其他事务（如用户取消）更新了
            error_str = str(e)
            logger.error("[TASK_DEBUG] force_fail_task 异常: task_id=%s, error=%s", task_id, error_str)
            if "write-write conflict" in error_str or "TransactionContext Error" in error_str:
                current_task = self.get_task(task_id)
                logger.info("[TASK_DEBUG] force_fail_task 冲突后查询: task_id=%s, current status=%s",
                           task_id, current_task.status.value if current_task else "NOT_FOUND")
                if current_task and current_task.status in (
                    TaskStatus.CANCELLING,
                    TaskStatus.FAILED,
                    TaskStatus.SUCCESS
                ):
                    logger.info(
                        "Force fail encountered conflict but task is already in terminal status: %s (Status: %s)，considered successful",
                        task_id, current_task.status.value
                    )
                    return True

            logger.error("force_fail_task finally failed: %s -> %s", task_id, error_str)
            return False

        if success and metadata_update:
            try:
                self.update_task(task_id, metadata_update)
            except Exception as exc:
                logger.warning("Failed to update task metadata %s: %s", task_id, exc)

        return success

    def request_cancellation(self, task_id: str, reason: str = "用户手动取消") -> bool:
        """
        Request task cancellation (set cancellation flag + interrupt query)

        流程：
        1. Update status to CANCELLING
        2. Call connection_registry.interrupt() to interrupt query
        3. Update cancellation metadata
        """
        from core.database.connection_registry import connection_registry

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
            logger.info("Task cancellation request set: %s, reason: %s", task_id, reason)

            # 尝试中断正在执行的查询
            try:
                interrupted = connection_registry.interrupt(task_id)
                if interrupted:
                    logger.info("Interrupted query execution for task %s", task_id)
                else:
                    logger.info("Task %s not in registry (possibly completed or not started yet)", task_id)
            except Exception as exc:
                logger.warning("Failed to interrupt task %s: %s", task_id, exc)

            # Update cancellation metadata
            try:
                self.update_task(task_id, {
                    "cancellation_requested": True,
                    "cancel_reason": reason,
                    "cancelled_at": get_storage_time().isoformat(),
                })
            except Exception as exc:
                logger.warning("Update cancellation metadatafailed %s: %s", task_id, exc)
        else:
            logger.warning("Task status does not allow cancellation or task does not exist: %s", task_id)
        return success

    def mark_cancelled(self, task_id: str, reason: str = "Query interrupted") -> bool:
        """
        Mark task as cancelled (final status)

        Call this method after catching duckdb.InterruptException

        Args:
            task_id: Task ID
            reason: 取消reason

        Returns:
            True if status was updated successfully
        """
        def _do_mark_cancelled() -> bool:
            with self._lock:
                with with_system_connection() as conn:
                    completed_at = get_storage_time()

                    # Query start time to calculate execution duration
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
                logger.info("Task已标记为取消: %s, reason: %s", task_id, reason)
            else:
                logger.warning("标记Task取消failed: %s", task_id)
            return success
        except Exception as e:
            logger.error("mark_cancelled failed: %s -> %s", task_id, e)
            return False

    def is_cancellation_requested(self, task_id: str) -> bool:
        """检查Task是否被请求取消"""
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
        """获取Task信息"""
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
        列出Task（支持分页和排序）

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
        """获取排队中的TaskID"""
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
                logger.warning("Task does not exist，无法更新: %s", task_id)
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
            logger.debug("Task已更新: %s -> %s", task_id, updates)
        else:
            logger.warning("Task更新failed: %s", task_id)
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
                            logger.warning("删除导出文件failed %s: %s", path, exc)

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
        """Cleaning up stuck cancelling tasks

        将长时间处于 cancelling status的Task标记为 failed
        通常用于迁移后或服务重启后清理历史遗留Task
        """
        with with_system_connection() as connection:
            completed_at = get_storage_time()

            # 查找所有 cancelling status的Task
            rows = connection.execute(
                f"SELECT task_id FROM {ASYNC_TASKS_TABLE} WHERE status = ?",
                [TaskStatus.CANCELLING.value],
            ).fetchall()

            if not rows:
                logger.info("没有找到卡住的cancellingTask")
                return 0

            # 将它们全部更新为 failed
            for (task_id,) in rows:
                connection.execute(
                    f"""
                    UPDATE {ASYNC_TASKS_TABLE}
                    SET status = ?, error_message = ?, completed_at = ?
                    WHERE task_id = ?
                    """,
                    [TaskStatus.FAILED.value, "Task被取消（历史Task清理）", completed_at, task_id],
                )
                logger.info(f"已Cleaning up stuck cancelling tasks: {task_id}")

            logger.info(f"清理完成: {len(rows)} 个Task已标记为failed")
            return len(rows)


# 全局Task管理器实例
task_manager = TaskManager()
