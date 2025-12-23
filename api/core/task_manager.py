"""
异步任务管理器
负责管理异步任务的状态、持久化与导出记录
"""

import json
import logging
import time
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, date
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any, Callable, Dict, List, Optional, TypeVar

from core.config_manager import config_manager
from core.duckdb_engine import with_duckdb_connection
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


class TaskStatus(str, Enum):
    """任务状态枚举"""

    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLING = "cancelling"  # 取消中（用于取消信号模式）


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
        logger.info("异步任务管理器初始化完成（持久化存储）")

    # --------------------------------------------------------------------- #
    # 初始化与工具方法
    # --------------------------------------------------------------------- #

    def _ensure_tables(self) -> None:
        """确保所需的DuckDB表已创建"""
        with with_duckdb_connection() as connection:
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

        with with_duckdb_connection() as connection:
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
                with with_duckdb_connection() as conn:
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
                with with_duckdb_connection() as conn:
                    completed_at = get_storage_time()
                    started_row = conn.execute(
                        f'SELECT started_at, status FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                        [task_id],
                    ).fetchone()
                    if not started_row:
                        logger.warning("任务不存在: %s", task_id)
                        return False

                    current_status = started_row[1] if len(started_row) > 1 else None
                    # 如果任务已被取消，不再更新为成功
                    if current_status in (TaskStatus.FAILED.value, TaskStatus.CANCELLING.value):
                        logger.info("任务已被取消或失败，跳过完成: %s, 状态: %s", task_id, current_status)
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

                    success = bool(rows)
                    if success:
                        logger.info("任务执行成功: %s", task_id)
                    else:
                        logger.warning("任务状态不允许完成: %s", task_id)
                    return success

        try:
            return retry_on_write_conflict(_do_complete)
        except Exception as e:
            logger.error("complete_task 最终失败: %s -> %s", task_id, e)
            return False

    def fail_task(self, task_id: str, error_message: str) -> bool:
        """标记任务为失败"""
        def _do_fail() -> bool:
            with self._lock:
                with with_duckdb_connection() as conn:
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
            return retry_on_write_conflict(_do_fail)
        except Exception as e:
            logger.error("fail_task 最终失败: %s -> %s", task_id, e)
            return False

    def force_fail_task(
        self, task_id: str, error_message: str, metadata_update: Optional[Dict[str, Any]] = None
    ) -> bool:
        """无论当前状态，强制将任务标记为失败（手动取消等场景）"""
        with self._lock:
            completed_at = get_storage_time()
            with with_duckdb_connection() as connection:
                started_row = connection.execute(
                    f'SELECT started_at FROM "{ASYNC_TASKS_TABLE}" WHERE task_id = ?',
                    [task_id],
                ).fetchone()
                execution_time = None
                if started_row and isinstance(started_row[0], datetime):
                    started_at = self._normalize_datetime(started_row[0])
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

            success = bool(rows)

        if success and metadata_update:
            try:
                self.update_task(task_id, metadata_update)
            except Exception as exc:
                logger.warning("更新任务元数据失败 %s: %s", task_id, exc)

        return success

    def request_cancellation(self, task_id: str, reason: str = "用户手动取消") -> bool:
        """
        请求取消任务（设置取消标志，不直接更新最终状态）
        使用取消信号模式，避免与后台任务产生写-写冲突
        """
        with with_duckdb_connection() as connection:
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

    def is_cancellation_requested(self, task_id: str) -> bool:
        """检查任务是否被请求取消"""
        with with_duckdb_connection() as connection:
            row = connection.execute(
                f"SELECT status FROM {ASYNC_TASKS_TABLE} WHERE task_id = ?",
                [task_id],
            ).fetchone()
        return row is not None and row[0] == TaskStatus.CANCELLING.value

    def get_task(self, task_id: str) -> Optional[AsyncTask]:
        """获取任务信息"""
        with with_duckdb_connection() as connection:
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
        
        with with_duckdb_connection() as connection:
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
        with with_duckdb_connection() as connection:
            rows = connection.execute(
                f"SELECT task_id FROM {ASYNC_TASKS_TABLE} WHERE status = ?",
                [TaskStatus.QUEUED.value],
            ).fetchall()
        return [row[0] for row in rows]

    def update_task(self, task_id: str, updates: Dict[str, Any]) -> bool:
        """通用字段更新，用于兼容旧接口"""
        if not updates:
            return False

        with self._lock, with_duckdb_connection() as connection:
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
        with with_duckdb_connection() as connection:
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

        with with_duckdb_connection() as connection:
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


# 全局任务管理器实例
task_manager = TaskManager()
