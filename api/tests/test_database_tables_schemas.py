"""list_connection_schemas 按连接类型的行为。

回归(2026-07): MySQL 曾与 SQLite/DuckDB 一起被归为"无 schema 概念"返回空列表,
但 MySQL 的 schema 即 database,应返回连接所配置的库(含表数)。
"""

import sys
import types

from routers import database_tables


class _FakeCursor:
    def __init__(self, row):
        self._row = row
        self.executed_sql = None

    def execute(self, sql):
        self.executed_sql = sql

    def fetchone(self):
        return self._row

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class _FakeConn:
    def __init__(self, row):
        self._cursor = _FakeCursor(row)
        self.closed = False

    def cursor(self):
        return self._cursor

    def close(self):
        self.closed = True


class _FakeConnectionCfg:
    def __init__(self, db_type):
        self.type = db_type
        self.params = {
            "host": "h",
            "port": 3306,
            "user": "u",
            "password": "p",
            "database": "store_order",
        }


def _patch(monkeypatch, db_type, row=("store_order", 73)):
    monkeypatch.setattr(
        database_tables, "_require_connection",
        lambda cid: _FakeConnectionCfg(db_type),
    )
    fake_conn = _FakeConn(row)
    monkeypatch.setitem(
        sys.modules, "pymysql", types.SimpleNamespace(connect=lambda **kw: fake_conn)
    )
    return fake_conn


def test_mysql_schemas_returns_connected_database(monkeypatch):
    fake_conn = _patch(monkeypatch, "mysql")
    resp = database_tables.list_connection_schemas("db_SORDER")
    assert resp["data"]["items"] == [{"name": "store_order", "table_count": 73}]
    assert resp["data"]["total"] == 1
    assert fake_conn.closed


def test_mysql_schemas_empty_when_no_current_database(monkeypatch):
    # DATABASE() 为 NULL(理论上连接总带 database,防御分支)
    _patch(monkeypatch, "mysql", row=(None, 0))
    resp = database_tables.list_connection_schemas("db_SORDER")
    assert resp["data"]["items"] == []
    assert resp["data"]["total"] == 0


def test_sqlite_duckdb_schemas_still_empty(monkeypatch):
    for db_type in ("sqlite", "duckdb"):
        _patch(monkeypatch, db_type)
        resp = database_tables.list_connection_schemas("db_X")
        assert resp["data"]["items"] == []
        assert resp["data"]["total"] == 0
