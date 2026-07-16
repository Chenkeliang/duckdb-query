"""联邦查询连接失效自愈：fetch_query_records 遇到 MySQL「server has gone away」
类连接断开错误时，应清空 mysql 扩展的连接缓存并重试一次（重试时重建新连接）。

根因：DuckDB mysql 扩展按 DSN 进程级缓存连接，空闲后被中间设备/wait_timeout
静默掐断，复用即报 "Server has gone away"，DETACH 也清不掉，只有 mysql_clear_cache()
能清。普通（非联邦）查询永不触发这些错误串，所以该分支零副作用。
（v1.2.1 起自愈从 join 专用的 execute_query 迁入 fetch_query_records，
所有取数路径统一受益。）
"""
import pytest
from unittest.mock import MagicMock

from core.database import duckdb_engine

QUERY = "SELECT * FROM mysql_db.t"
ROWS = [(1,), (2,)]
DESC = [("a", "INTEGER")]


def _make_conn(main_results, query=QUERY):
    """main_results: 按主查询 execute 顺序消费的 ('raise', exc) / ('ok', rows)。"""
    calls = {"clear_cache": 0}
    main_iter = iter(main_results)

    def _execute(sql):
        if sql == query:
            kind, payload = next(main_iter)
            if kind == "raise":
                raise payload
            res = MagicMock()
            res.description = DESC
            res.fetchall.return_value = payload
            return res
        if "mysql_clear_cache" in sql:
            calls["clear_cache"] += 1
            return MagicMock()
        res = MagicMock()
        res.description = []
        res.fetchall.return_value = []
        return res

    conn = MagicMock()
    conn.execute.side_effect = _execute
    conn._calls = calls
    return conn


def test_retries_after_mysql_connection_lost():
    err = Exception(
        'IO Error: Failed to prepare MySQL query "SELECT ...": Server has gone away'
    )
    conn = _make_conn([("raise", err), ("ok", ROWS)])
    columns, records = duckdb_engine.fetch_query_records(conn, QUERY)
    assert columns == ["a"]
    assert records == [{"a": 1}, {"a": 2}]
    assert conn._calls["clear_cache"] == 1


def test_non_connection_error_is_not_retried():
    err = Exception("Binder Error: Referenced column x not found")
    conn = _make_conn([("raise", err)])
    with pytest.raises(Exception) as ei:
        duckdb_engine.fetch_query_records(conn, QUERY)
    assert "Binder Error" in str(ei.value)
    assert conn._calls["clear_cache"] == 0


def test_connection_lost_twice_reraises_once_retried():
    err = Exception("Lost connection to MySQL server during query")
    conn = _make_conn([("raise", err), ("raise", err)])
    with pytest.raises(Exception) as ei:
        duckdb_engine.fetch_query_records(conn, QUERY)
    assert "Lost connection" in str(ei.value)
    # 只清一次缓存、只重试一次，不无限重试
    assert conn._calls["clear_cache"] == 1


WRITE_QUERY = "DELETE FROM mysql_db.t WHERE id = 1"


def test_write_query_not_retried_on_connection_lost():
    # 写操作即使遇到连接闪断也不重试——可能已在 MySQL 落库，重试会重复应用（非幂等）
    err = Exception("Server has gone away")
    conn = _make_conn([("raise", err)], query=WRITE_QUERY)
    with pytest.raises(Exception) as ei:
        duckdb_engine.fetch_query_records(conn, WRITE_QUERY)
    assert "gone away" in str(ei.value).lower()  # 原样抛出连接错误，未被重试掩盖
    assert conn._calls["clear_cache"] == 0       # 没清缓存 = 没重试
