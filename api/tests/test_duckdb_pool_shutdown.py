"""退出时优雅关闭 DuckDB 连接的行为：close_all() 幂等、关闭后连接池可重建、
shutdown_all_duckdb_connections() 不会为了关闭而现开一个新池/新连接。

背景见 core/database/duckdb_pool.py:shutdown_all_duckdb_connections —— 桌面端退出时
若直接 SIGKILL 后端，连接不会 close()，WAL 就留脏，回放损坏会导致 checkpoint 之后新建
的表全部丢失。这里只测 close 语义本身，不覆盖 Rust/进程信号那一侧。
"""

from __future__ import annotations

import pytest

duckdb = pytest.importorskip("duckdb")

from core.database import duckdb_pool as pool_module
from core.database.duckdb_pool import (
    DuckDBConnectionPool,
    SystemDBConnection,
    shutdown_all_duckdb_connections,
)


@pytest.fixture
def small_pool():
    """独立于全局单例的一个小连接池，测试结束后自行关闭。"""
    p = DuckDBConnectionPool(min_connections=1, max_connections=2)
    yield p
    p.close_all()


def test_close_all_is_idempotent(small_pool):
    assert len(small_pool._connections) >= 1

    small_pool.close_all()
    assert small_pool._connections == {}

    # 再关一次不应报错
    small_pool.close_all()
    assert small_pool._connections == {}


def test_pool_rebuilds_connections_after_close_all(small_pool):
    """close_all() 只是清空当前连接，不是把池永久停用——后续请求应能重新建连接。"""
    small_pool.close_all()
    assert small_pool._connections == {}

    with small_pool.get_connection() as conn:
        assert conn.execute("SELECT 1").fetchone() == (1,)

    assert len(small_pool._connections) >= 1


def test_system_connection_close_is_idempotent():
    manager = SystemDBConnection.get_instance()

    # 从未建过连接时 close() 应该是安全的 no-op
    manager.close()
    assert manager._connection is None

    with manager.get_connection() as conn:
        assert conn.execute("SELECT 1").fetchone() == (1,)
    assert manager._connection is not None

    manager.close()
    assert manager._connection is None
    # 再关一次同样不应报错
    manager.close()


def test_shutdown_all_duckdb_connections_does_not_create_a_pool_on_its_own(monkeypatch):
    """进程还没碰过任何一次查询（全局连接池从未初始化）时调用 shutdown，不应该现开一个新
    连接池/新连接——那只是白白打开又立刻关闭，没有意义。"""
    monkeypatch.setattr(pool_module, "_connection_pool", None)

    shutdown_all_duckdb_connections()

    assert pool_module._connection_pool is None


def test_shutdown_all_duckdb_connections_closes_an_existing_pool(monkeypatch):
    p = DuckDBConnectionPool(min_connections=1, max_connections=2)
    monkeypatch.setattr(pool_module, "_connection_pool", p)
    try:
        assert len(p._connections) >= 1
        shutdown_all_duckdb_connections()
        assert p._connections == {}
    finally:
        p.close_all()
