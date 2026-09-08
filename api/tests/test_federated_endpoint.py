def test_query_timeout_messagecode_exists():
    from utils.response_helpers import MessageCode, DEFAULT_MESSAGES
    assert MessageCode.QUERY_TIMEOUT == "QUERY_TIMEOUT"
    assert MessageCode.QUERY_TIMEOUT in DEFAULT_MESSAGES


import threading
import duckdb
import pytest

from core.database.duckdb_pool import interruptible_connection
from core.database.connection_registry import connection_registry


def test_watchdog_interrupts_slow_query():
    """watchdog 定时器触发 connection.interrupt() → 慢查询抛 InterruptException。"""
    task_id = "fed:test-timeout"
    timed_out = {"v": False}

    def on_timeout():
        timed_out["v"] = True
        connection_registry.interrupt(task_id)

    with interruptible_connection(task_id, "slow") as conn:
        timer = threading.Timer(0.3, on_timeout)
        timer.start()
        try:
            with pytest.raises(duckdb.InterruptException):
                conn.execute(
                    "SELECT count(*) FROM range(10000000000) t(x) WHERE x % 7 = 0"
                ).fetchall()
        finally:
            timer.cancel()
    assert timed_out["v"] is True


def test_cancel_before_registration_prevents_user_sql_from_starting():
    """Regression 2026-09-07: early cancellation stops before context yield."""
    task_id = "sync:cancel-before-register"
    assert connection_registry.interrupt_with_remote(
        task_id,
        pending_if_missing=True,
    )

    with pytest.raises(duckdb.InterruptException):
        with interruptible_connection(task_id, "SELECT expensive()"):
            raise AssertionError("cancelled connection must never reach user SQL")

    assert connection_registry.get(task_id) is None
