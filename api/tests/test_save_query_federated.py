"""
save_query_to_duckdb 联邦查询支持测试

覆盖范围：
- 显式 attach_databases（sqlite / duckdb 文件连接）走 ATTACH 联邦执行并落表
- 不显式传 attach_databases，仅凭 datasource.type=duckdb 自动推导
- 不带 attach_databases 的本地 DuckDB SQL 分支保持不变（回归）

修复背景：修复前 mysql 之外的类型（含 sqlite/duckdb/postgresql）全部走本地 DuckDB 池
直接执行，联邦 SQL（形如 `sq_src.customers`）在本地池里找不到该 Catalog 会报错。

**Feature: save-query-to-duckdb-federated**
"""

import sqlite3
import sys
import os

import duckdb
import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from main import app
from core.database.database_manager import db_manager
from core.database.duckdb_engine import with_duckdb_connection
from models.query_models import DatabaseConnection, DataSourceType


client = TestClient(app)


@pytest.fixture
def sqlite_file(tmp_path):
    """创建一个包含 1 张表的临时 SQLite 文件"""
    db_path = tmp_path / "save-query-src.db"
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("CREATE TABLE customers (id INTEGER, name TEXT)")
        conn.executemany(
            "INSERT INTO customers VALUES (?, ?)",
            [(1, "Alice"), (2, "Bob"), (3, "Carol")],
        )
        conn.commit()
    finally:
        conn.close()
    return str(db_path)


@pytest.fixture
def duckdb_file(tmp_path):
    """创建一个包含 1 张表的临时 DuckDB 文件"""
    db_path = tmp_path / "save-query-src.duckdb"
    conn = duckdb.connect(str(db_path))
    try:
        conn.execute("CREATE TABLE products (id INTEGER, name VARCHAR)")
        conn.execute("INSERT INTO products VALUES (1, 'apple'), (2, 'banana')")
    finally:
        conn.close()
    return str(db_path)


def _register_connection(connection_id, conn_type, params):
    """直接注入内存连接（不测试、不落盘元数据），测试结束需调用方自行清理"""
    connection = DatabaseConnection(
        id=connection_id,
        name=connection_id,
        type=conn_type,
        params=params,
    )
    db_manager.add_connection(connection, test_connection=False, save_to_metadata=False)
    return connection


def _unregister_connection(connection_id):
    db_manager.connections.pop(connection_id, None)


def _table_row_count(table_name: str) -> int:
    with with_duckdb_connection() as con:
        return con.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]


class TestSaveQueryToDuckDBExplicitAttach:
    """带显式 attach_databases 时应走 ATTACH 联邦执行并成功落表"""

    def test_sqlite_source(self, sqlite_file):
        connection_id = "save-query-sqlite-test"
        _register_connection(connection_id, DataSourceType.SQLITE, {"path": sqlite_file})
        try:
            resp = client.post(
                "/api/save_query_to_duckdb",
                json={
                    "sql": "SELECT * FROM sq_src.customers ORDER BY id",
                    "table_alias": "imported_customers_sqlite",
                    "attach_databases": [
                        {"alias": "sq_src", "connection_id": connection_id}
                    ],
                },
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True
            assert body["data"]["row_count"] == 3
            assert _table_row_count("imported_customers_sqlite") == 3
        finally:
            _unregister_connection(connection_id)

    def test_duckdb_source(self, duckdb_file):
        connection_id = "save-query-duckdb-test"
        _register_connection(connection_id, DataSourceType.DUCKDB, {"path": duckdb_file})
        try:
            resp = client.post(
                "/api/save_query_to_duckdb",
                json={
                    "sql": "SELECT * FROM dk_src.products ORDER BY id",
                    "table_alias": "imported_products_duckdb",
                    "attach_databases": [
                        {"alias": "dk_src", "connection_id": connection_id}
                    ],
                },
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True
            assert body["data"]["row_count"] == 2
            assert _table_row_count("imported_products_duckdb") == 2
        finally:
            _unregister_connection(connection_id)


class TestSaveQueryToDuckDBAutoDerivedAttach:
    """不显式传 attach_databases，仅凭 datasource.type 自动推导（join_query.py 新增分支）"""

    def test_duckdb_datasource_without_explicit_attach(self, duckdb_file):
        connection_id = "save-query-duckdb-auto-test"
        _register_connection(connection_id, DataSourceType.DUCKDB, {"path": duckdb_file})
        try:
            from core.common.connection_alias import build_attach_list_from_datasource

            derived = build_attach_list_from_datasource(
                {"id": connection_id, "type": "duckdb"}
            )
            assert derived is not None
            alias = derived[0]["alias"]
            assert alias.startswith("duckdb_")

            resp = client.post(
                "/api/save_query_to_duckdb",
                json={
                    "sql": f"SELECT * FROM {alias}.products ORDER BY id",
                    "table_alias": "imported_products_duckdb_auto",
                    "datasource": {"id": connection_id, "type": "duckdb"},
                },
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True
            assert body["data"]["row_count"] == 2
            assert _table_row_count("imported_products_duckdb_auto") == 2
        finally:
            _unregister_connection(connection_id)


class TestSaveQueryToDuckDBLocalRegression:
    """不带 attach_databases 的本地 DuckDB SQL 分支应保持不变（回归）"""

    def test_local_sql_without_attach_databases(self):
        resp = client.post(
            "/api/save_query_to_duckdb",
            json={
                "sql": "SELECT * FROM (VALUES (1, 'a'), (2, 'b')) AS t(id, name)",
                "table_alias": "imported_local_regression",
                "datasource": {"id": "duckdb_internal", "type": "duckdb"},
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["row_count"] == 2
        assert _table_row_count("imported_local_regression") == 2

    def test_local_sql_without_datasource_field_at_all(self):
        """请求完全不带 datasource 字段时，同样应落回本地 DuckDB 分支而非误判为联邦"""
        resp = client.post(
            "/api/save_query_to_duckdb",
            json={
                "sql": "SELECT * FROM (VALUES (1, 'x')) AS t(id, name)",
                "table_alias": "imported_local_regression_no_datasource",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["row_count"] == 1
        assert _table_row_count("imported_local_regression_no_datasource") == 1
