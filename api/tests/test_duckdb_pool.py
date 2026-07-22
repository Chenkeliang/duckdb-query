"""DuckDB 连接池与中断注册表回归。

这些测试原位于 core/tests，未被标准 ``pytest tests`` 收集；2026-07 分层重组后
其中两个 patch 仍指向 ``core.duckdb_pool``，因此长期处于失败但不可见的状态。
"""

from unittest.mock import MagicMock, patch

import duckdb

from core.database.connection_registry import ConnectionRegistry
from core.database.duckdb_pool import DuckDBConnectionPool


@patch("core.database.duckdb_pool.config_manager")
def test_discard_nonexistent_connection(mock_config):
    mock_config.get_app_config.return_value = MagicMock(
        duckdb_threads=4,
        duckdb_memory_limit="1GB",
        pool_wait_timeout=10,
    )
    mock_config.get_duckdb_paths.return_value = MagicMock(
        database_path=":memory:", temp_dir="/tmp"
    )
    pool = DuckDBConnectionPool(min_connections=0, max_connections=2)
    fake_conn = duckdb.connect(":memory:")
    try:
        assert pool.discard_connection(fake_conn) is False
    finally:
        fake_conn.close()
        pool.close_all()


def test_registration_and_unregistration():
    registry = ConnectionRegistry()
    conn = duckdb.connect(":memory:")
    try:
        assert registry.get("test-task-reg") is None
        registry.register("test-task-reg", conn, "TEST SQL")
        record = registry.get("test-task-reg")
        assert record is not None
        assert record.sql_preview == "TEST SQL"
        assert registry.unregister("test-task-reg") is True
        assert registry.get("test-task-reg") is None
    finally:
        conn.close()


def test_interrupt_registered_connection():
    registry = ConnectionRegistry()
    conn = duckdb.connect(":memory:")
    try:
        registry.register("test-task-interrupt", conn, "")
        assert registry.interrupt("test-task-interrupt") is True
        registry.unregister("test-task-interrupt")
    finally:
        conn.close()


def test_interrupt_unregistered_connection():
    registry = ConnectionRegistry()
    assert registry.interrupt("non-existent-task") is False


@patch("core.database.duckdb_pool.config_manager")
def test_get_stats_structure(mock_config):
    mock_config.get_app_config.return_value = MagicMock(
        duckdb_threads=4,
        duckdb_memory_limit="1GB",
        pool_wait_timeout=10,
    )
    mock_config.get_duckdb_paths.return_value = MagicMock(
        database_path=":memory:", temp_dir="/tmp"
    )
    pool = DuckDBConnectionPool(min_connections=0, max_connections=5)
    try:
        stats = pool.get_stats()
        assert {
            "total_connections",
            "idle_connections",
            "busy_connections",
            "total_created",
            "total_closed",
        } <= stats.keys()
    finally:
        pool.close_all()
