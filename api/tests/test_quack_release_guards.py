"""2026-11-03 release regressions: hidden checkpoint writes and task retargeting.

Only pytest-owned disk files and synthetic localhost Quack servers are used;
the official extension cache is loaded without installing anything.
"""

import json
from uuid import uuid4

import duckdb
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient
import pytest

from core.database.duckdb_engine import with_duckdb_connection
from core.services.quack_service import QuackError
from core.services.task_manager import TaskStatus, task_manager
from core.common.config_manager import config_manager
from main import app
from models.quack_models import QuackServiceConfig
from routers.async_tasks import (
    AsyncQueryRequest, RetryTaskRequest, retry_async_task, submit_async_query,
)
from test_quack_cross_service import twins  # noqa: F401
from test_quack_results import _cleanup_table, remote  # noqa: F401
from test_quack_service import connected, quack_server, service  # noqa: F401


@pytest.mark.parametrize("function", ["checkpoint", "force_checkpoint"])
@pytest.mark.parametrize("qualified", ["{name}", '"{name}"', 'main."{name}"'])
@pytest.mark.parametrize("prefix", ["", "EXPLAIN "])
def test_native_checkpoint_calls_cannot_hide_inside_select(remote, tmp_path, function, qualified, prefix):
    """2026-11-03: quoted checkpoint SELECT bypassed the native readonly guard."""
    instance, identifier, info = remote
    server = info["server"]
    alias = "checkpoint_probe_" + uuid4().hex
    path = tmp_path / "checkpoint.db"
    server.execute(f"ATTACH '{path}' AS {alias}")
    try:
        server.execute(f"CREATE TABLE {alias}.t AS SELECT 1 AS n")
        # Establish that this real native function flushes this fixture's WAL.
        server.execute(f'SELECT * FROM "{function}"(\'{alias}\')')
        server.execute(f"INSERT INTO {alias}.t VALUES (2)")
        wal = path.with_suffix(".db.wal")
        before = wal.stat().st_size
        assert before > 0
        sql = f"{prefix}SELECT * FROM {qualified.format(name=function)}('{alias}')"
        with pytest.raises(QuackError) as exc:
            instance.execute(identifier, sql, False)
        assert exc.value.code == "QUACK_READ_ONLY_REQUIRED"
        assert wal.stat().st_size == before
    finally:
        server.execute(f"DETACH {alias}")


@pytest.mark.parametrize("name", ["checkpoint", "force_checkpoint", "write_log"])
@pytest.mark.parametrize("quoted", [False, True])
@pytest.mark.parametrize("sql", [
    'SELECT n FROM range(3) {name}(n) ORDER BY n',
    'WITH {name}(n) AS (SELECT * FROM range(3)) SELECT n FROM {name} ORDER BY n',
    'EXPLAIN SELECT n FROM range(3) AS {name}(n)',
])
def test_native_side_effect_names_remain_legal_aliases(remote, name, quoted, sql):
    """2026-11-03: blocking actual calls must preserve same-named aliases/CTEs."""
    instance, identifier, _info = remote
    result = instance.execute(identifier, sql.format(name=f'"{name}"' if quoted else name), False)
    assert result["row_count"] == (1 if sql.startswith("EXPLAIN") else 3)


def test_native_write_log_call_is_not_read_only(remote):
    """2026-11-03: write_log is a native side effect, not a read-only scalar."""
    instance, identifier, _info = remote
    with duckdb.connect(":memory:") as local:
        local.execute("SET enable_logging = true")
        local.execute("SELECT write_log('synthetic-release-probe')")
        assert local.execute("SELECT message FROM duckdb_logs WHERE message='synthetic-release-probe'").fetchall() == [("synthetic-release-probe",)]
    with pytest.raises(QuackError) as exc:
        instance.execute(identifier, "SELECT write_log('synthetic-release-probe')", False)
    assert exc.value.code == "QUACK_READ_ONLY_REQUIRED"


@pytest.mark.parametrize("endpoint", ["execute", "export", "async"])
@pytest.mark.parametrize("expression", [
    '* FROM main."checkpoint"(\'memory\')',
    '* FROM main."force_checkpoint"(\'memory\')',
    'main."write_log"(\'synthetic-release-probe\')',
])
@pytest.mark.parametrize("prefix", ["", "EXPLAIN "])
def test_http_quack_entry_points_reject_native_side_effects(remote, endpoint, expression, prefix):
    """2026-11-03: execute, export and task routes share the native call guard."""
    _instance, identifier, _info = remote
    path = {
        "execute": f"/api/quack/services/{identifier}/execute",
        "export": "/api/query-results/export",
        "async": "/api/async-tasks",
    }[endpoint]
    payload = {"sql": f"{prefix}SELECT {expression}"}
    if endpoint != "execute":
        payload["quack_service_id"] = identifier
    response = TestClient(app).post(path, json=payload)
    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "QUACK_READ_ONLY_REQUIRED"


@pytest.mark.parametrize("format", ["csv", "parquet"])
@pytest.mark.parametrize("sql", [
    "SELECT n FROM range(3) checkpoint(n) ORDER BY n",
    "WITH checkpoint(n) AS (SELECT * FROM range(3)) SELECT n FROM checkpoint ORDER BY n",
])
def test_native_quack_export_keeps_legal_checkpoint_aliases(remote, format, sql):
    """2026-11-03: export's lexical precheck must not reject native SQL aliases."""
    _instance, identifier, _info = remote
    response = TestClient(app).post("/api/query-results/export", json={
        "sql": sql, "quack_service_id": identifier, "format": format,
    })
    try:
        assert response.status_code == 200, response.text
        assert response.json()["data"]["row_count_estimate"] == 3
    finally:
        payload = response.json().get("data", {})
        if "file_id" in payload:
            (config_manager.get_exports_dir() / f'{payload["file_id"]}.{format}').unlink(missing_ok=True)


def test_native_accepted_task_rejects_changed_service_before_connecting(twins, monkeypatch):
    """2026-11-03: accepted A task previously saved B data with A provenance."""
    instance, identifier = twins["service"], twins["a"]["id"]
    name = "quack_revision_" + uuid4().hex
    scheduled = BackgroundTasks()
    response = submit_async_query(AsyncQueryRequest(
        sql="SELECT COUNT(*) AS n FROM records", custom_table_name=name,
        quack_service_id=identifier,
    ), scheduled)
    task_id = response["data"]["task_id"]
    original = instance.get_service(identifier)
    instance.save_service(QuackServiceConfig(
        name="Replacement B", uri=twins["uri_b"], token=twins["token_b"],
    ), identifier)
    attached = []
    attach = instance._attach

    def record_attach(connection, config, allow_install):
        attached.append(config["uri"])
        return attach(connection, config, allow_install)

    monkeypatch.setattr(instance, "_attach", record_attach)
    try:
        work = scheduled.tasks[0]
        work.func(*work.args, **work.kwargs)
        task = task_manager.get_task(task_id)
        assert task.status == TaskStatus.FAILED, task.result_info
        assert "QUACK_SERVICE_CHANGED" in task.error_message
        assert attached == []
        assert task.metadata["quack_service_revision"] == original["updated_at"]
        assert task.metadata["source"]["connectionName"] == original["name"]
        serialized = json.dumps([response, task.metadata, task.result_info])
        for secret in (twins["token_b"], instance._get(identifier)["token"], twins["uri_b"]):
            assert secret not in serialized
        with with_duckdb_connection() as local:
            assert local.execute("SELECT COUNT(*) FROM duckdb_tables() WHERE table_name=?", [name]).fetchone()[0] == 0
    finally:
        _cleanup_table(name)


@pytest.mark.parametrize("edit_again", [False, True])
def test_native_explicit_retry_captures_current_source_and_checks_it_again(twins, edit_again):
    """2026-11-03: explicit retry uses current source, then pins that acceptance."""
    instance, identifier = twins["service"], twins["a"]["id"]
    name = "quack_retry_revision_" + uuid4().hex
    scheduled = BackgroundTasks()
    response = submit_async_query(AsyncQueryRequest(
        sql="SELECT COUNT(*) AS n FROM records", custom_table_name=name,
        quack_service_id=identifier,
    ), scheduled)
    original_id = response["data"]["task_id"]
    work = scheduled.tasks[0]
    try:
        work.func(*work.args, **work.kwargs)
        assert task_manager.get_task(original_id).status == TaskStatus.SUCCESS
        current = instance.save_service(QuackServiceConfig(
            name="Replacement B", uri=twins["uri_b"], token=twins["token_b"],
        ), identifier)
        retry_work = BackgroundTasks()
        retried = retry_async_task(original_id, retry_work, RetryTaskRequest())
        retry_id = retried["data"]["task_id"]
        if edit_again:
            instance.save_service(QuackServiceConfig(
                name="Edited again", uri=twins["uri_b"], token=twins["token_b"],
            ), identifier)
        work = retry_work.tasks[0]
        work.func(*work.args, **work.kwargs)
        task = task_manager.get_task(retry_id)
        assert task.status == (TaskStatus.FAILED if edit_again else TaskStatus.SUCCESS)
        assert task.metadata["source"]["connectionName"] == "Replacement B"
        assert task.metadata["quack_service_revision"] == current["updated_at"]
        if edit_again:
            assert "QUACK_SERVICE_CHANGED" in task.error_message
        with with_duckdb_connection() as local:
            # A rejected retry must preserve the previously published A table.
            assert local.execute(f'SELECT n FROM "{name}"').fetchone()[0] == (100001 if edit_again else 13)
    finally:
        _cleanup_table(name)


def test_native_connected_save_keeps_captured_config_after_edit(twins, monkeypatch):
    """2026-11-03: revision checks must not retarget/reject established sessions."""
    instance, identifier = twins["service"], twins["a"]["id"]
    name = "quack_connected_revision_" + uuid4().hex
    scheduled = BackgroundTasks()
    response = submit_async_query(AsyncQueryRequest(
        sql="SELECT COUNT(*) AS n FROM records", custom_table_name=name,
        quack_service_id=identifier,
    ), scheduled)
    attach = instance._attach

    def edit_after_attach(connection, config, allow_install):
        attach(connection, config, allow_install)
        instance.save_service(QuackServiceConfig(
            name="Replacement B", uri=twins["uri_b"], token=twins["token_b"],
        ), identifier)

    monkeypatch.setattr(instance, "_attach", edit_after_attach)
    try:
        work = scheduled.tasks[0]
        work.func(*work.args, **work.kwargs)
        task = task_manager.get_task(response["data"]["task_id"])
        assert task.status == TaskStatus.SUCCESS, task.error_message
        with with_duckdb_connection() as local:
            assert local.execute(f'SELECT n FROM "{name}"').fetchone()[0] == 100001
    finally:
        _cleanup_table(name)
