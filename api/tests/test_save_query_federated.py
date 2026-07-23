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
from unittest.mock import patch

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


    def test_mysql_datasource_without_explicit_attach_routes_through_attach(self):
        """回归(2026-07): mysql 曾被排除在自动推导之外、走独立的
        db_manager.execute_query 直连重跑分支。统一后 mysql 和其余三种类型
        一样自动推导 attach_list、经 execute_sql_and_persist 走 ATTACH,
        旧直连分支已删除,db_manager.execute_query 不应再被调用。

        没有可用的真实 MySQL 服务器,mock 掉真正需要网络 I/O 的
        execute_sql_and_persist 本身,只验证 join_query.py 传给它的
        attach_list 是否正确包含了这条 mysql 连接(证明推导没有排除 mysql)。
        """
        connection_id = "save-query-mysql-auto-test"
        _register_connection(
            connection_id,
            DataSourceType.MYSQL,
            {"host": "127.0.0.1", "port": 3306, "database": "testdb",
             "user": "root", "password": "x"},
        )
        try:
            # 旧 db_manager.execute_query 直连分支已在 v1.2.1 物理删除，
            # 无需再用 mock 哨兵断言"不被调用"
            with patch("routers.join_query.execute_sql_and_persist") as mock_persist:
                mock_persist.return_value = {
                    "row_count": 2, "columns": ["id"], "column_count": 1,
                    "column_profiles": [], "schema_version": 2,
                }
                resp = client.post(
                    "/api/save_query_to_duckdb",
                    json={
                        "sql": "SELECT id FROM orders",
                        "table_alias": "imported_mysql_auto",
                        "datasource": {"id": connection_id, "type": "mysql"},
                    },
                )
                assert resp.status_code == 200
                assert resp.json()["success"] is True

                assert mock_persist.call_count == 1
                _, table_name, attach_list = mock_persist.call_args[0]
                assert table_name == "imported_mysql_auto"
                assert attach_list is not None and len(attach_list) == 1
                assert attach_list[0]["connection_id"] == connection_id
        finally:
            _unregister_connection(connection_id)
            with with_duckdb_connection() as con:
                con.execute('DROP TABLE IF EXISTS "imported_mysql_auto"')


class TestSaveQueryToDuckDBEmptyResult:
    """空结果拒绝保存:执行先落到内部临时表,确认非空才 DROP+RENAME 覆盖目标表;
    结果为空时只清理临时表、绝不触碰目标表——不会在还没确认新结果有效前就把
    目标表下的数据冲掉。"""

    def test_empty_result_rejected_and_table_not_left_behind(self):
        resp = client.post(
            "/api/save_query_to_duckdb",
            json={
                "sql": "SELECT * FROM (VALUES (1, 'a')) AS t(id, name) WHERE id = 999",
                "table_alias": "imported_should_not_exist",
            },
        )
        assert resp.status_code == 400
        with with_duckdb_connection() as con:
            existing = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
        assert "imported_should_not_exist" not in existing

    def test_empty_result_does_not_destroy_existing_table_of_same_name(self):
        """回归:同名重存(overwrite)时,若新查询意外返回 0 行,旧数据必须原封
        不动地保留——不能被空表覆盖后再删除。"""
        table_name = "imported_reused_alias_regression"
        with with_duckdb_connection() as con:
            con.execute(
                f'CREATE OR REPLACE TABLE "{table_name}" AS '
                "SELECT * FROM (VALUES (1, 'x'), (2, 'y'), (3, 'z')) AS t(id, name)"
            )
        try:
            resp = client.post(
                "/api/save_query_to_duckdb",
                json={
                    "sql": "SELECT * FROM (VALUES (1, 'a')) AS t(id, name) WHERE id = 999",
                    "table_alias": table_name,
                },
            )
            assert resp.status_code == 400
            with with_duckdb_connection() as con:
                rows = con.execute(f'SELECT * FROM "{table_name}" ORDER BY id').fetchall()
            assert rows == [(1, "x"), (2, "y"), (3, "z")]
        finally:
            with with_duckdb_connection() as con:
                con.execute(f'DROP TABLE IF EXISTS "{table_name}"')


class TestSaveQueryToDuckDBDeriveFailureContract:
    """自动推导失败(连接已删除)时的错误契约:与执行分支一致的 QUERY_FAILED + details,
    而不是落到外层通用 OPERATION_FAILED(修复回归)"""

    def test_stale_connection_returns_query_failed_with_details(self):
        resp = client.post(
            "/api/save_query_to_duckdb",
            json={
                "sql": "SELECT * FROM ghost.t",
                "table_alias": "imported_never_created",
                "datasource": {"id": "connection-deleted-meanwhile", "type": "sqlite"},
            },
        )
        assert resp.status_code == 500
        body = resp.json()
        assert body["success"] is False
        assert body["messageCode"] == "QUERY_FAILED"
        details = (body.get("error") or {}).get("details") or {}
        assert details.get("datasource_id") == "connection-deleted-meanwhile"
        assert "sql" in details


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
