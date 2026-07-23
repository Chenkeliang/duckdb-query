"""连接池 conn_id=0 回归(Codex P1-7):首个连接 id 为 0,旧 `if conn_id:`
真值判定把它当假 → 永不释放/回滚,基础容量少一半。另测查询级错误不该
把健康连接标坏累计到丢弃阈值。

用 :memory: 连接替换真库连接,避开桌面 App 对 main.db 的锁。
"""
from unittest.mock import patch

import pytest

duckdb = pytest.importorskip("duckdb")

from core.database.duckdb_pool import (
    ConnectionState,
    DuckDBConnectionPool,
    _is_connection_fatal,
)


@pytest.fixture
def mem_pool():
    with patch.object(
        DuckDBConnectionPool, "_connect_duckdb",
        lambda self, path: duckdb.connect(":memory:"),
    ), patch.object(
        DuckDBConnectionPool, "_configure_connection",
        lambda self, conn, cfg, temp_dir: None,
    ):
        p = DuckDBConnectionPool(min_connections=1, max_connections=2)
        yield p
        p.close_all()


def test_is_connection_fatal_classification():
    assert _is_connection_fatal("IO Error: Failed to read")
    assert _is_connection_fatal("database has been invalidated because ...")
    assert _is_connection_fatal("FATAL Error: ...")
    # 查询级错误不算连接致命
    assert not _is_connection_fatal("Binder Error: column x not found")
    assert not _is_connection_fatal("Catalog Error: Table t does not exist")
    assert not _is_connection_fatal("Parser Error: syntax error")
    assert not _is_connection_fatal("Conversion Error: could not cast")


def test_conn_id_zero_is_released_not_leaked(mem_pool):
    with mem_pool.get_connection() as conn:
        assert conn.execute("SELECT 1").fetchone()[0] == 1
    # 首个连接 id=0;释放后必须回到 IDLE(旧 bug 下会卡在 BUSY 永不归池)
    assert 0 in mem_pool._connections
    assert mem_pool._connections[0].state == ConnectionState.IDLE


def test_conn_zero_reusable_after_release(mem_pool):
    # 连续两次借用同一个池:若 conn 0 泄漏,第二次要么新建 conn 1、要么卡住
    with mem_pool.get_connection() as c1:
        c1.execute("SELECT 1")
    with mem_pool.get_connection() as c2:
        c2.execute("SELECT 2")
    # conn 0 被正常复用,池未因泄漏而膨胀
    assert set(mem_pool._connections.keys()) == {0}


def test_query_error_does_not_mark_connection_bad(mem_pool):
    with pytest.raises(Exception):
        with mem_pool.get_connection() as conn:
            conn.execute("SELECT * FROM definitely_missing_table")  # Catalog 错误
    # 普通查询错误:连接照常归池,error_count 不累计
    assert mem_pool._connections[0].state == ConnectionState.IDLE
    assert mem_pool._connections[0].error_count == 0
    # 之后仍可正常使用
    with mem_pool.get_connection() as conn:
        assert conn.execute("SELECT 42").fetchone()[0] == 42
