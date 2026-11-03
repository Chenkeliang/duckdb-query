"""2026-11-03: remote export/save/background keep precision and source ownership.

Only a localhost synthetic Quack server and pytest-isolated local DuckDB files
are used. Cached official extensions are loaded without network installation.
"""

from concurrent.futures import ThreadPoolExecutor
import csv
from decimal import Decimal
import importlib
import io
import time
import uuid

import duckdb
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient
import pytest

from core.common.config_manager import config_manager
from core.data.file_datasource_manager import file_datasource_manager
from core.database.connection_registry import connection_registry
from core.database.duckdb_engine import with_duckdb_connection
from core.services import quack_results
from core.services.task_manager import TaskStatus, task_manager
from main import app
from routers.async_tasks import AsyncQueryRequest, RetryTaskRequest
from routers.async_tasks import execute_async_query, retry_async_task, submit_async_query
from test_quack_service import connected, quack_server, service  # noqa: F401


@pytest.fixture
def remote(connected, monkeypatch):
    """Bind shared contexts to a per-test public service registry."""
    instance, identifier, info = connected
    module = importlib.import_module("core.services.quack_service")
    monkeypatch.setattr(module, "quack_service", instance)
    monkeypatch.setattr("routers.quack.quack_service", instance)
    return instance, identifier, info


def _cleanup_table(name):
    with with_duckdb_connection() as connection:
        connection.execute(f'DROP TABLE IF EXISTS "{name}"')
    file_datasource_manager.delete_file_datasource(name)


@pytest.mark.parametrize("format", ["csv", "parquet"])
@pytest.mark.parametrize("limited,expected", [(True, 2), (False, 4)])
def test_native_export_precision_and_original_range(remote, format, limited, expected):
    """2026-11-03: COPY must run remotely once and honor the final LIMIT choice."""
    _instance, identifier, _info = remote
    client = TestClient(app)
    sql = (
        "SELECT amount, big, id FROM exact_values CROSS JOIN "
        "(SELECT id FROM records ORDER BY id LIMIT 4) r ORDER BY id DESC LIMIT 2"
    )
    response = client.post("/api/query-results/export", json={
        "sql": sql, "format": format, "quack_service_id": identifier,
        "apply_row_limit": limited,
    })
    assert response.status_code == 200, response.text
    payload = response.json()["data"]
    path = config_manager.get_exports_dir() / f'{payload["file_id"]}.{format}'
    try:
        assert payload["row_count_estimate"] == expected
        download = client.get(payload["download_url"])
        assert download.status_code == 200
        if format == "csv":
            rows = list(csv.DictReader(io.StringIO(download.text)))
            assert len(rows) == expected
            assert rows[0]["amount"] == "1234567890123456789.1234567890123456789"
            assert rows[0]["big"] == "170141183460469231731687303715884105727"
        else:
            with duckdb.connect() as reader:
                rows = reader.execute("SELECT * FROM read_parquet(?)", [str(path)]).fetchall()
                assert len(rows) == expected
                assert rows[0][:2] == (
                    Decimal("1234567890123456789.1234567890123456789"),
                    "170141183460469231731687303715884105727",
                )
    finally:
        path.unlink(missing_ok=True)


def test_native_local_save_restores_exact_and_nested_types(remote):
    """2026-11-03: native Parquet HUGEINT->DOUBLE must not corrupt local saves."""
    _instance, identifier, info = remote
    name = "quack_saved_" + uuid.uuid4().hex
    query_id = "quack-save-" + uuid.uuid4().hex
    sql = (
        "SELECT *, '340282366920938463463374607431768211455'::UHUGEINT AS unsigned, "
        "[big,NULL] AS nested, {'big':big,'label':'quoted value'} AS detail "
        "FROM exact_values"
    )
    expected = info["server"].execute(sql).fetchall()
    before = set(config_manager.get_exports_dir().glob("quack-result-*"))
    try:
        snapshot = quack_results.persist_quack_query(sql, name, identifier, query_id)
        assert snapshot["row_count"] == 1
        with with_duckdb_connection() as local:
            assert local.execute(f'SELECT * FROM "{name}"').fetchall() == expected
            types = local.execute(f'DESCRIBE "{name}"').fetchall()
            assert types[0][1] == "DECIMAL(38,19)" and types[1][1] == "HUGEINT"
            assert dict((row[0], row[1]) for row in types)["unsigned"] == "UHUGEINT"
        assert not any(row[0] == name for row in info["server"].execute("SHOW TABLES").fetchall())
        assert set(config_manager.get_exports_dir().glob("quack-result-*")) == before
    finally:
        connection_registry.forget_publication(query_id)
        _cleanup_table(name)


@pytest.mark.parametrize("operation", ["export", "save"])
def test_native_transfer_evaluates_remote_rows_only_once(remote, operation):
    """2026-11-03: prove one remote evaluation using native SQL, without NumPy UDFs."""
    _instance, identifier, info = remote
    server = info["server"]
    sequence = "transfer_sequence_" + uuid.uuid4().hex
    view = "transfer_probe_" + uuid.uuid4().hex
    server.execute(f"CREATE SEQUENCE {sequence} START 1")
    server.execute(
        f"CREATE VIEW {view} AS SELECT (nextval('{sequence}') - 1)::INTEGER AS id FROM range(3)"
    )
    sql = f"SELECT id FROM {view} ORDER BY id"
    name = "quack_once_" + uuid.uuid4().hex
    query_id = "quack-once-" + uuid.uuid4().hex
    path = None
    try:
        if operation == "export":
            response = TestClient(app).post("/api/query-results/export", json={
                "sql": sql, "quack_service_id": identifier,
            })
            assert response.status_code == 200, response.text
            payload = response.json()["data"]
            path = config_manager.get_exports_dir() / f'{payload["file_id"]}.parquet'
            assert payload["row_count_estimate"] == 3
        else:
            assert quack_results.persist_quack_query(sql, name, identifier, query_id)["row_count"] == 3
        assert server.execute(f"SELECT currval('{sequence}')").fetchone()[0] == 3
    finally:
        if path:
            path.unlink(missing_ok=True)
        if operation == "save":
            connection_registry.forget_publication(query_id)
            _cleanup_table(name)
        server.execute(f"DROP VIEW {view}")
        server.execute(f"DROP SEQUENCE {sequence}")


def test_native_async_local_save_and_retry_keep_source(remote):
    """2026-11-03: saving locally retains remote provenance without changing destination."""
    _instance, identifier, _info = remote
    name = "quack_async_" + uuid.uuid4().hex
    scheduled = BackgroundTasks()
    sql = "SELECT * FROM exact_values LIMIT 1"
    submitted = submit_async_query(AsyncQueryRequest(
        sql=sql, custom_table_name=name, task_type="save_to_table",
        quack_service_id=identifier, apply_row_limit=True,
    ), scheduled)
    task_id = submitted["data"]["task_id"]
    work = scheduled.tasks[0]
    assert work.kwargs["quack_service_id"] == identifier
    try:
        work.func(*work.args, **work.kwargs)
        task = task_manager.get_task(task_id)
        assert task.status == TaskStatus.SUCCESS, task.error_message
        assert task.metadata["quack_service_id"] == identifier
        assert task.result_info["quack_service_id"] == identifier
        assert task.result_info["source"] == {
            "type": "quack", "connectionId": identifier, "connectionName": "Synthetic server",
        }
        assert task.result_info["table_name"] == name
        with with_duckdb_connection() as local:
            assert local.execute(f'SELECT big FROM "{name}"').fetchone()[0] == 2**127 - 1
        retried = BackgroundTasks()
        result = retry_async_task(task_id, retried, RetryTaskRequest())
        retry = task_manager.get_task(result["data"]["task_id"])
        assert retry.metadata["quack_service_id"] == identifier
        assert retry.metadata["source"] == task.metadata["source"]
        assert retried.tasks[0].kwargs["quack_service_id"] == identifier
        assert retried.tasks[0].kwargs["apply_row_limit"] is True
    finally:
        _cleanup_table(name)


def test_native_async_existing_name_refuses_overwrite(remote):
    """2026-11-03: remote save cannot silently replace an existing local table."""
    _instance, identifier, _info = remote
    name = "quack_collision_" + uuid.uuid4().hex
    task_id = task_manager.create_task("SELECT * FROM exact_values")
    try:
        with with_duckdb_connection() as local:
            local.execute(f'CREATE TABLE "{name}" AS SELECT 77 AS previous')
        execute_async_query(task_id, "SELECT * FROM exact_values", name,
                            quack_service_id=identifier)
        assert task_manager.get_task(task_id).status == TaskStatus.FAILED
        with with_duckdb_connection() as local:
            assert local.execute(f'SELECT * FROM "{name}"').fetchall() == [(77,)]
    finally:
        _cleanup_table(name)


@pytest.mark.parametrize("cancel", [False, True])
def test_native_local_publication_handoff_preserves_existing_target(remote, monkeypatch, cancel):
    """2026-11-03: collision/cancel after remote COPY cannot destroy local data."""
    _instance, identifier, _info = remote
    name = "quack_handoff_" + uuid.uuid4().hex
    sql = "SELECT * FROM exact_values"
    task_id = task_manager.create_task(sql, metadata={"quack_service_id": identifier})
    assert task_manager.start_task(task_id)
    persist = quack_results.execute_sql_and_persist
    before = set(config_manager.get_exports_dir().glob("quack-result-*"))

    def before_local_publish(*args, **kwargs):
        with with_duckdb_connection() as local:
            local.execute(f'CREATE TABLE "{name}" AS SELECT 88 AS previous')
        if cancel:
            assert task_manager.request_cancellation(task_id)
        return persist(*args, **kwargs)

    monkeypatch.setattr(quack_results, "execute_sql_and_persist", before_local_publish)
    try:
        with pytest.raises(duckdb.Error):
            quack_results.persist_quack_query(sql, name, identifier, task_id, overwrite=cancel)
        with with_duckdb_connection() as local:
            assert local.execute(f'SELECT * FROM "{name}"').fetchall() == [(88,)]
            assert not local.execute("SELECT table_name FROM duckdb_tables() WHERE starts_with(table_name,'__stage_')").fetchall()
        assert set(config_manager.get_exports_dir().glob("quack-result-*")) == before
    finally:
        connection_registry.forget_publication(task_id)
        _cleanup_table(name)


def test_native_cancelled_async_never_publishes_local_table(remote):
    """2026-11-03: cancelling remote materialization removes every candidate."""
    _instance, identifier, info = remote
    name = "quack_cancel_" + uuid.uuid4().hex
    sql = "SELECT sum(sin(i)) FROM range(1000000000000) r(i)"
    task_id = task_manager.create_task(sql, metadata={"quack_service_id": identifier})
    before = set(config_manager.get_exports_dir().glob("quack-result-*"))
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(execute_async_query, task_id, sql, name,
                                 quack_service_id=identifier)
        try:
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                active = info["server"].execute("SELECT query FROM quack_active_connections()").fetchall()
                if any("sin(i)" in (row[0] or "") for row in active):
                    break
                time.sleep(0.01)
            else:
                pytest.fail("Synthetic materialization did not reach the server")
            assert task_manager.request_cancellation(task_id)
            future.result(timeout=10)
            assert task_manager.get_task(task_id).status == TaskStatus.CANCELLED
            with with_duckdb_connection() as local:
                assert local.execute("SELECT count(*) FROM duckdb_tables() WHERE table_name=?", [name]).fetchone() == (0,)
                assert not local.execute("SELECT table_name FROM duckdb_tables() WHERE starts_with(table_name,'__stage_')").fetchall()
            assert set(config_manager.get_exports_dir().glob("quack-result-*")) == before
        finally:
            task_manager.request_cancellation(task_id)
    assert _instance.execute(identifier, "SELECT 42 AS n", False)["data"] == [{"n": 42}]


def test_native_export_remote_cancel_removes_candidate(remote):
    """2026-11-03: sync export cancellation stops remote work and deletes output."""
    _instance, identifier, info = remote
    client = TestClient(app)
    request_id = "quack-export-cancel-" + uuid.uuid4().hex
    exports = config_manager.get_exports_dir()
    before = set(exports.glob("*.parquet"))
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(client.post, "/api/query-results/export", json={
            "sql": "SELECT sum(cos(i)) FROM range(1000000000000) r(i)",
            "format": "parquet", "quack_service_id": identifier,
        }, headers={"X-Request-ID": request_id})
        try:
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                active = info["server"].execute("SELECT query FROM quack_active_connections()").fetchall()
                if any("cos(i)" in (row[0] or "") for row in active):
                    break
                time.sleep(0.01)
            else:
                pytest.fail("Synthetic export did not reach the server")
            assert connection_registry.interrupt_with_remote(f"sync:{request_id}")
            response = future.result(timeout=10)
            assert response.status_code == 499, response.text
            assert response.json()["error"]["code"] == "QUERY_CANCELLED"
            assert set(exports.glob("*.parquet")) == before
            assert info["token"] not in response.text
        finally:
            connection_registry.interrupt_with_remote(f"sync:{request_id}")


@pytest.mark.parametrize("endpoint", ["/api/query-results/export", "/api/async-tasks"])
def test_remote_source_rejects_mixed_attachments(remote, endpoint):
    """2026-11-03: a bound remote query cannot silently switch to local execution."""
    _instance, identifier, _info = remote
    response = TestClient(app).post(endpoint, json={
        "sql": "SELECT 1", "quack_service_id": identifier,
        "attach_databases": [{"alias": "local_db", "connection_id": "not-used"}],
    })
    assert response.status_code == 400


def test_unknown_remote_service_returns_standard_error_before_tracking(remote):
    """2026-11-03: foreground metadata lookup must not turn a missing service into 500."""
    response = TestClient(app).post("/api/quack/services/missing/execute", json={
        "sql": "SELECT 1", "request_id": "missing-service",
    })
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "QUACK_SERVICE_NOT_FOUND"


def test_native_nested_writes_rejected_before_export_or_task(remote):
    """2026-11-03: export/task endpoints must not weaken the core readonly guard."""
    _instance, identifier, info = remote
    client = TestClient(app)
    sql = "SELECT * FROM query('DELETE FROM records RETURNING *')"
    for endpoint in ("/api/query-results/export", "/api/async-tasks"):
        response = client.post(endpoint, json={"sql": sql, "quack_service_id": identifier})
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "QUACK_READ_ONLY_REQUIRED"
        assert info["token"] not in response.text
    assert info["server"].execute("SELECT count(*) FROM records").fetchone() == (100001,)


def test_foreground_quack_snapshot_keeps_service_without_replay(remote):
    """2026-11-03: promotion keeps the original execution and exact source ID."""
    from core.services import foreground_queries as foreground
    from models.quack_models import QuackExecuteRequest

    _instance, identifier, _info = remote
    request_id = "quack-promote-" + uuid.uuid4().hex
    executed = []
    task_ids = []

    @foreground.track_foreground_query
    def execute(service_id, request, x_request_id=None):
        executed.append(request.sql)
        task_ids.append(foreground.foreground_queries.promote(request_id))
        return {"success": True, "data": _instance.execute(
            service_id, request.sql, False, request_id,
        )}

    response = execute(identifier, QuackExecuteRequest(
        sql="SELECT * FROM exact_values LIMIT 1", request_id=request_id,
    ))
    task = task_manager.get_task(task_ids[0])
    try:
        assert len(executed) == 1
        assert task.metadata["quack_service_id"] == identifier
        assert task.result_info["quack_service_id"] == identifier
        assert task.result_info["source"]["connectionId"] == identifier
        assert task.result_info["result_kind"] == "snapshot"
        assert foreground.read_snapshot(task.task_id) == response["data"]
    finally:
        (config_manager.get_exports_dir() / f"task-{task.task_id}-snapshot.json").unlink(missing_ok=True)
