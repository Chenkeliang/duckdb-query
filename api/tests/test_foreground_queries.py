"""2026-10-10: moving a running query must not execute it for a second time."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
import threading
from unittest.mock import Mock

import pytest

from core.common.exceptions import BaseAPIException
from core.services import foreground_queries as module
from core.services.task_manager import TaskStatus


@pytest.fixture
def managed(monkeypatch, tmp_path):
    tasks = {}

    def create(query, **kwargs):
        task_id = str(len(tasks) + 1)
        tasks[task_id] = SimpleNamespace(task_id=task_id, status=TaskStatus.QUEUED, result_info={}, query=query, **kwargs)
        return task_id

    def start(task_id):
        tasks[task_id].status = TaskStatus.RUNNING
        return True

    def complete(task_id, info):
        tasks[task_id].result_info = info
        tasks[task_id].status = TaskStatus.SUCCESS
        return True

    def fail(task_id, message):
        tasks[task_id].status = TaskStatus.FAILED
        tasks[task_id].error_message = message

    manager = SimpleNamespace(create_task=create, start_task=start, complete_task=complete,
                              get_task=tasks.get, fail_task=fail,
                              mark_cancelled=lambda task_id: setattr(tasks[task_id], "status", TaskStatus.CANCELLED))
    registry = module.ForegroundQueries()
    monkeypatch.setattr(module, "task_manager", manager)
    monkeypatch.setattr(module, "foreground_queries", registry)
    monkeypatch.setattr(module.config_manager, "get_exports_dir", lambda: tmp_path)
    return registry, tasks


def test_promote_adopts_original_execution_and_preserves_snapshot(managed):
    registry, tasks = managed
    entered, release = threading.Event(), threading.Event()
    calls = []
    payload = {"columns": ["amount"], "data": [{"amount": "123456789012345678.90"}],
               "column_types": [{"name": "amount", "duckdb_type": "DECIMAL(38,2)"}], "row_count": 1}

    @module.track_foreground_query
    def execute(request, x_request_id=None):
        calls.append(request.sql)
        entered.set()
        assert release.wait(5)
        return {"success": True, "data": payload}

    with ThreadPoolExecutor() as pool:
        future = pool.submit(execute, SimpleNamespace(sql="SELECT 1", save_as_table=None), "request-one")
        assert entered.wait(5)
        task_id = registry.promote("request-one")
        assert registry.promote("request-one") == task_id
        assert len(tasks) == 1
        assert tasks[task_id].metadata["apply_row_limit"] is True
        assert tasks[task_id].metadata["original_started_at"]
        release.set()
        assert future.result()["data"] == payload
    assert calls == ["SELECT 1"]
    assert module.read_snapshot(task_id) == payload
    with pytest.raises(BaseAPIException) as exc:
        registry.promote("request-one")
    assert exc.value.status_code == 409


def test_failed_and_cancelled_queries_never_publish_success(managed):
    registry, tasks = managed
    registry.begin("failed", "SELECT 1")
    task_id = registry.promote("failed")
    registry.finish("failed", error=ValueError("bind failed"))
    assert tasks[task_id].status == TaskStatus.FAILED
    registry.begin("cancelled", "SELECT 2")
    task_id = registry.promote("cancelled")
    tasks[task_id].status = TaskStatus.CANCELLING
    registry.finish("cancelled", response={"success": True, "data": {}})
    assert tasks[task_id].status == TaskStatus.CANCELLED


def test_duplicate_active_request_id_is_rejected(managed):
    registry, _tasks = managed
    registry.begin("same", "SELECT 1")
    with pytest.raises(BaseAPIException):
        registry.begin("same", "SELECT 2")


def test_background_http_routes_use_standard_response_contract(managed):
    from routers.query_cancel import move_query_to_background
    from routers.async_tasks import get_background_query_result

    registry, _tasks = managed
    registry.begin('route-test', 'SELECT 42')
    response = move_query_to_background('route-test')
    assert response['success'] is True
    assert response['messageCode']
    task_id = response['data']['task_id']
    payload = {'columns': ['n'], 'data': [{'n': 42}], 'row_count': 1}
    registry.finish('route-test', response={'success': True, 'data': payload})
    loaded = get_background_query_result(task_id)
    assert loaded['success'] is True
    assert loaded['data'] == payload


@pytest.mark.parametrize('sql,is_preview,limited', [
    ('SELECT 1', False, False), ('SELECT 1 LIMIT 7', False, True), ('SELECT 1', True, True),
])
def test_adoption_preserves_original_row_range(managed, sql, is_preview, limited):
    registry, tasks = managed

    @module.track_foreground_query
    def execute(request, x_request_id=None):
        task_id = registry.promote(x_request_id)
        assert tasks[task_id].metadata['apply_row_limit'] is limited
        return {'success': True, 'data': {'columns': ['n'], 'data': [{'n': 1}]}}

    execute(SimpleNamespace(sql=sql, is_preview=is_preview, save_as_table=None), 'range-choice')


def test_retry_of_adopted_query_cancels_the_new_execution(monkeypatch):
    from fastapi import BackgroundTasks
    from routers.async_tasks import retry_async_task, RetryTaskRequest
    from core.services.task_manager import task_manager
    from core.database.connection_registry import connection_registry

    original = task_manager.create_task('SELECT 42', task_type='foreground_query', metadata={
        'request_id': 'original-http', 'result_kind': 'snapshot',
        'original_started_at': '2026-10-10T10:00:00Z', 'apply_row_limit': False,
    })
    task_manager.fail_task(original, 'Test failure')
    scheduled = BackgroundTasks()
    response = retry_async_task(original, scheduled, RetryTaskRequest())
    retry_id = response['data']['task_id']
    task = task_manager.get_task(retry_id)
    assert task.task_type == 'query'
    assert 'request_id' not in task.metadata
    assert 'result_kind' not in task.metadata
    assert task.metadata['apply_row_limit'] is False
    assert scheduled.tasks[0].args[0] == retry_id
    cancelled = []

    def cancel(query_id, accept):
        cancelled.append(query_id)
        return accept()

    monkeypatch.setattr(connection_registry, 'cancel_if_not_published', cancel)
    assert task_manager.request_cancellation(retry_id)
    assert cancelled == [retry_id]


@pytest.mark.parametrize('failure_phase', ['query', 'snapshot'])
def test_failure_cancellation_race_finishes_without_watchdog(monkeypatch, tmp_path, failure_phase):
    """2026-10-14: a concurrent cancellation must not strand finished work."""
    from core.services.task_manager import task_manager
    from core.database.connection_registry import connection_registry

    registry = module.ForegroundQueries()
    request_id = f'failure-race-{failure_phase}'
    registry.begin(request_id, 'SELECT 1')
    task_id = registry.promote(request_id)
    real_fail = task_manager.fail_task

    def fail_after_cancellation(target, message):
        assert task_manager.request_cancellation(target)
        return real_fail(target, message)

    monkeypatch.setattr(task_manager, 'fail_task', fail_after_cancellation)
    monkeypatch.setattr(module.config_manager, 'get_exports_dir', lambda: tmp_path)
    if failure_phase == 'snapshot':
        def cannot_write(*_args, **_kwargs):
            raise OSError('Simulated full disk')
        monkeypatch.setattr(Path, 'write_text', cannot_write)
        registry.finish(request_id, response={'success': True, 'data': {'columns': [], 'data': []}})
    else:
        registry.finish(request_id, error=ValueError('Binding failed'))
    state = task_manager.get_task(task_id).status
    connection_registry.forget_publication(f'sync:{request_id}')
    assert state == TaskStatus.CANCELLED
    assert request_id not in registry._active


def test_cancelled_adoption_releases_sync_signal_before_id_reuse():
    """2026-10-14: a completed cancellation must not poison the next query."""
    from core.services.task_manager import task_manager
    from core.database.connection_registry import connection_registry

    registry = module.ForegroundQueries()
    request_id, query_id = 'cancelled-reuse', 'sync:cancelled-reuse'
    registry.begin(request_id, 'SELECT 1')
    task_id = registry.promote(request_id)
    connection_registry.register(query_id, Mock())
    assert task_manager.request_cancellation(task_id)
    connection_registry.unregister(query_id)
    registry.finish(request_id, error=ValueError('Interrupted'))
    assert task_manager.get_task(task_id).status == TaskStatus.CANCELLED
    registry.begin(request_id, 'SELECT 2')
    connection_registry.register(query_id, Mock())
    try:
        assert not connection_registry.is_cancel_requested(query_id)
    finally:
        connection_registry.unregister(query_id)
        connection_registry.forget_publication(query_id)
        registry.finish(request_id, response={'success': True, 'data': {}})


def test_request_id_is_retained_until_finalization_cleanup(managed, monkeypatch):
    """2026-10-14: finalizing one execution must not clear the next one's signal."""
    from core.database.connection_registry import connection_registry

    registry, _tasks = managed
    entered, release = threading.Event(), threading.Event()

    def cleanup(_query_id):
        entered.set()
        assert release.wait(5)

    monkeypatch.setattr(connection_registry, 'forget_publication', cleanup)
    registry.begin('finishing', 'SELECT 1')
    registry.promote('finishing')
    with ThreadPoolExecutor(max_workers=1) as pool:
        finished = pool.submit(registry.finish, 'finishing', response={'success': True, 'data': {}})
        try:
            assert entered.wait(5)
            with pytest.raises(BaseAPIException):
                registry.begin('finishing', 'SELECT 2')
            with pytest.raises(BaseAPIException):
                registry.promote('finishing')
        finally:
            release.set()
        finished.result()
    registry.begin('finishing', 'SELECT 2')
