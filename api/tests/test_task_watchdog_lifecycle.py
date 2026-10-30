"""Regression 2026-10-30: the cancellation daemon retained DuckDB at exit."""

import os
from pathlib import Path
import subprocess
import sys
import threading

from fastapi.testclient import TestClient

from core.services import task_manager as task_module


def test_importing_app_exits_without_nanobind_reference_leaks(tmp_path):
    """Regression 2026-10-30: importing routes started an unowned daemon."""
    env = os.environ.copy()
    env.update({
        "APP_ROOT": str(tmp_path),
        "CONFIG_DIR": str(tmp_path / "config"),
        "DUCKDB_DATA_DIR": str(tmp_path / "data"),
        "DUCKDB_DATABASE_PATH": str(tmp_path / "data/main.db"),
    })
    result = subprocess.run(
        [sys.executable, "-c", (
            "import main; "
            "from core.database.duckdb_pool import shutdown_all_duckdb_connections; "
            "shutdown_all_duckdb_connections()"
        )],
        cwd=Path(__file__).resolve().parents[1],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "nanobind: leaked" not in result.stderr, result.stderr


def test_watchdog_stop_wakes_sleep_and_allows_restart(monkeypatch):
    """Regression 2026-10-30: shutdown must not wait for the 60s interval."""
    monkeypatch.setattr(task_module, "cleanup_cancelling_timeout", lambda: None)
    monkeypatch.setattr(task_module, "cleanup_stale_registry", lambda: None)
    try:
        task_module.start_cancellation_watchdog(interval_seconds=3600)
        first = task_module._watchdog_thread
        task_module.start_cancellation_watchdog(interval_seconds=3600)
        assert task_module._watchdog_thread is first
        assert first.is_alive()
        task_module.stop_cancellation_watchdog()
        assert not first.is_alive()
        task_module.stop_cancellation_watchdog()
        task_module.start_cancellation_watchdog(interval_seconds=3600)
        assert task_module._watchdog_thread is not first
        assert task_module._watchdog_thread.is_alive()
    finally:
        task_module.stop_cancellation_watchdog()


def test_watchdog_still_performs_cancellation_and_registry_cleanup(monkeypatch):
    """Regression 2026-10-30: stoppable monitoring retains both periodic checks."""
    cancelled = threading.Event()
    registry_cleaned = threading.Event()
    monkeypatch.setattr(task_module, "cleanup_cancelling_timeout", cancelled.set)
    monkeypatch.setattr(task_module, "cleanup_stale_registry", registry_cleaned.set)
    try:
        task_module.start_cancellation_watchdog(interval_seconds=0.01)
        assert cancelled.wait(2)
        assert registry_cleaned.wait(2)
    finally:
        task_module.stop_cancellation_watchdog()


def test_app_stops_watchdog_before_closing_databases(monkeypatch):
    """Regression 2026-10-30: no daemon may use or reopen a closed system DB."""
    from main import app
    from core.database import duckdb_pool

    shutdown = duckdb_pool.shutdown_all_duckdb_connections
    threads = []

    def checked_shutdown():
        assert threads
        assert all(not thread.is_alive() for thread in threads)
        shutdown()

    monkeypatch.setattr(duckdb_pool, "shutdown_all_duckdb_connections", checked_shutdown)
    for _ in range(2):
        with TestClient(app) as client:
            thread = task_module._watchdog_thread
            assert thread.is_alive()
            threads.append(thread)
            assert client.get("/api/capabilities").status_code == 200
        assert not thread.is_alive()
