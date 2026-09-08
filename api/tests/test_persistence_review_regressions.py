"""Regressions for the capability integration review on 2026-09-08."""

from contextlib import contextmanager

import duckdb
import pytest

from core.database import connection_registry as registry_module
from core.database import federated_attach
from core.database.connection_registry import ConnectionRegistry


@pytest.mark.parametrize("eviction", ["ttl", "capacity"])
def test_accepted_task_cancel_survives_sync_hint_eviction(monkeypatch, eviction):
    """2026-09-08: waiting before registration must not lose accepted cancellation.

    The expired marker allowed overwrite publication, after which async terminal
    cleanup deleted the result and lost the previous target as well.
    """
    registry = ConnectionRegistry()
    connection = duckdb.connect(":memory:")
    connection.execute("CREATE TABLE target AS SELECT 7 AS value")
    task_id = "async:waiting-for-mysql-lock"
    monkeypatch.setattr(registry_module.time, "time", lambda: 100.0)
    assert registry.cancel_if_not_published(task_id, lambda: True)
    if eviction == "ttl":
        monkeypatch.setattr(registry_module.time, "time", lambda: 161.0)
    else:
        monkeypatch.setattr(registry_module, "_MAX_PENDING_CANCELLATIONS", 2)
        for index in range(3):
            registry.interrupt_with_remote(f"sync:hint-{index}", pending_if_missing=True)

    @contextmanager
    def connection_scope(query_id, sql, **kwargs):
        registry.register(query_id, connection, sql, **kwargs)
        try:
            if registry.is_cancel_requested(query_id):
                raise duckdb.InterruptException("cancelled before execution")
            yield connection
        finally:
            registry.unregister(query_id)

    monkeypatch.setattr(federated_attach, "connection_registry", registry)
    monkeypatch.setattr(federated_attach, "interruptible_connection", connection_scope)
    try:
        with pytest.raises(duckdb.InterruptException):
            federated_attach.execute_sql_and_persist(
                "SELECT 99 AS value", "target", query_id=task_id, overwrite=True,
            )
        assert connection.execute("SELECT * FROM target").fetchall() == [(7,)]
        assert connection.execute("SHOW TABLES").fetchall() == [("target",)]

        # Finalization releases the task-owned marker, so reusing the ID does
        # not inherit a previous run's cancellation.
        registry.forget_publication(task_id)
        registry.register(task_id, connection)
        assert not registry.is_cancel_requested(task_id)
    finally:
        registry.unregister(task_id)
        registry.forget_publication(task_id)
        connection.close()


def test_unknown_sync_cancellation_still_expires(monkeypatch):
    """2026-09-08: durable task cancellation must not retain unknown sync hints."""
    registry = ConnectionRegistry()
    monkeypatch.setattr(registry_module.time, "time", lambda: 100.0)
    registry.interrupt_with_remote("sync:unknown", pending_if_missing=True)
    monkeypatch.setattr(registry_module.time, "time", lambda: 161.0)
    with duckdb.connect(":memory:") as connection:
        registry.register("sync:unknown", connection)
        assert not registry.is_cancel_requested("sync:unknown")
        registry.unregister("sync:unknown")
