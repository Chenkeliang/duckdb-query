"""Adopt an in-flight HTTP query without interrupting or replaying its SQL."""

from functools import wraps
import inspect
import json
import logging
from pathlib import Path
import threading
from typing import Any

from core.common.config_manager import config_manager
from core.common.exceptions import BaseAPIException, ResourceNotFoundError
from core.common.sql_capabilities import is_read_only_sql
from core.common.timezone_utils import get_current_time_iso
from core.database.connection_registry import connection_registry
from core.services.task_manager import TaskStatus, task_manager
from routers.query_sql_utils import has_top_level_limit

logger = logging.getLogger(__name__)


class ForegroundQueries:
    """Only active executions are retained; adopted results live in task storage."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active: dict[str, dict[str, Any]] = {}

    def begin(self, request_id: str, sql: str, metadata: dict | None = None) -> None:
        """Register before entering the existing execution path."""
        with self._lock:
            if request_id in self._active:
                raise BaseAPIException("Request ID is already running", status_code=409)
            self._active[request_id] = {"sql": sql, "task_id": None, "started_at": get_current_time_iso(), "metadata": metadata or {}}

    def promote(self, request_id: str) -> str:
        """Atomically assign one durable task to the running query."""
        with self._lock:
            entry = self._active.get(request_id)
            if entry is None or entry.get("finishing"):
                raise BaseAPIException("Query has already finished or cannot be moved", status_code=409)
            if entry["task_id"]:
                return entry["task_id"]
            task_id = task_manager.create_task(
                entry["sql"], task_type="foreground_query",
                metadata={**entry["metadata"], "request_id": request_id, "result_kind": "snapshot", "original_started_at": entry["started_at"]},
            )
            if not task_manager.start_task(task_id):
                task_manager.fail_task(task_id, "Unable to start background ownership")
                raise BaseAPIException("Unable to move query to background", status_code=500)
            entry["task_id"] = task_id
            return task_id

    def finish(self, request_id: str, response: Any = None, error: Exception | None = None) -> None:
        """Publish the exact original response, including numeric string encodings."""
        with self._lock:
            entry = self._active.get(request_id)
            if entry:
                entry["finishing"] = True
        if not entry:
            return
        task_id = entry["task_id"]
        try:
            if not task_id:
                return
            task = task_manager.get_task(task_id)
            if task and task.status == TaskStatus.CANCELLING:
                task_manager.mark_cancelled(task_id)
                return
            if not isinstance(response, dict) or not response.get("success"):
                message = str(error) if error else "Query failed"
                if response is not None and hasattr(response, "body"):
                    payload = json.loads(response.body)
                    message = payload.get("message", message)
                task_manager.fail_task(task_id, message)
                return
            payload = response["data"]
            path = Path(config_manager.get_exports_dir()) / f"task-{task_id}-snapshot.json"
            temporary = path.with_suffix(".tmp")
            try:
                temporary.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False), encoding="utf-8")
                temporary.replace(path)
            finally:
                temporary.unlink(missing_ok=True)
            completed = task_manager.complete_task(task_id, {
                "result_kind": "snapshot", "file_path": str(path),
                "row_count": payload.get("row_count", 0),
                "column_count": len(payload.get("columns", [])),
                "preview_limit_applied": payload.get("preview_limit_applied"),
            })
            if not completed:
                path.unlink(missing_ok=True)
                task_manager.mark_cancelled(task_id)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.exception("Failed to persist adopted query %s", task_id)
            task_manager.fail_task(task_id, f"Unable to save query result: {exc}")
        finally:
            # Failure can race with an accepted cancellation after the first
            # state read. Finalize it before releasing the synchronous signal.
            if task_id:
                task = task_manager.get_task(task_id)
                if task and task.status == TaskStatus.CANCELLING:
                    task_manager.mark_cancelled(task_id)
            connection_registry.forget_publication(f"sync:{request_id}")
            with self._lock:
                self._active.pop(request_id, None)


foreground_queries = ForegroundQueries()


def track_foreground_query(function):
    """Track the two synchronous SQL endpoints while preserving their signatures."""
    signature = inspect.signature(function)

    @wraps(function)
    def tracked(*args, **kwargs):
        arguments = signature.bind(*args, **kwargs).arguments
        request = arguments["request"]
        request_id = arguments.get("x_request_id")
        if not isinstance(request_id, str) or not request_id or request.save_as_table or not is_read_only_sql(request.sql):
            return function(*args, **kwargs)
        attachments = getattr(request, "attach_databases", None) or []
        metadata = {
            "apply_row_limit": bool(getattr(request, "is_preview", True)) or has_top_level_limit(request.sql),
            "is_federated": bool(attachments),
            "attach_databases": [item.model_dump() for item in attachments],
        }
        foreground_queries.begin(request_id, request.sql, metadata)
        try:
            response = function(*args, **kwargs)
        except Exception as exc:
            foreground_queries.finish(request_id, error=exc)
            raise
        foreground_queries.finish(request_id, response=response)
        return response

    return tracked


def read_snapshot(task_id: str) -> dict:
    """Read an adopted query result from its server-owned artifact path."""
    task = task_manager.get_task(task_id)
    if task is None:
        raise ResourceNotFoundError("Task", task_id)
    info = task.result_info or {}
    if task.status != TaskStatus.SUCCESS:
        raise BaseAPIException("Query result is not ready", status_code=409)
    if info.get("result_kind") != "snapshot":
        raise BaseAPIException("Task does not contain a query snapshot", status_code=400)
    path = Path(config_manager.get_exports_dir()) / f"task-{task.task_id}-snapshot.json"
    if not path.is_file():
        raise ResourceNotFoundError("Query result", task_id)
    return json.loads(path.read_text(encoding="utf-8"))
