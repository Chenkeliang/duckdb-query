"""SQLite / DuckDB 文件型数据库连接端到端测试

覆盖范围：
- build_attach_sql 对 sqlite 分支的 path/database 参数兼容
- GET /api/datasources/databases/{id}/tables 对 sqlite/duckdb 连接的支持
- 通过真实 ATTACH 的联邦查询（/api/duckdb/federated-query）验证 build_attach_sql 修复
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
from core.database.duckdb_engine import build_attach_sql
from models.query_models import DatabaseConnection, DataSourceType


client = TestClient(app)


@pytest.fixture
def sqlite_file(tmp_path):
    """创建一个包含 2 张表（含中文数据）的临时 SQLite 文件"""
    db_path = tmp_path / "local-cache.db"
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("CREATE TABLE users (id INTEGER, name TEXT)")
        conn.executemany(
            "INSERT INTO users VALUES (?, ?)",
            [(1, "张三"), (2, "李四"), (3, "王五")],
        )
        conn.execute("CREATE TABLE orders (id INTEGER, amount REAL)")
        conn.executemany(
            "INSERT INTO orders VALUES (?, ?)", [(1, 10.5), (2, 20.0)]
        )
        conn.commit()
    finally:
        conn.close()
    return str(db_path)


@pytest.fixture
def duckdb_file(tmp_path):
    """创建一个包含 1 张表的临时 DuckDB 文件"""
    db_path = tmp_path / "local.duckdb"
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


class TestBuildAttachSqlSqlite:
    """build_attach_sql 的 sqlite 分支应兼容 path 和 database 两种参数键"""

    def test_path_key(self):
        sql = build_attach_sql("sq", {"type": "sqlite", "path": "/tmp/a.db"})
        assert sql == 'ATTACH \'/tmp/a.db\' AS "sq" (TYPE sqlite)'

    def test_database_key(self):
        sql = build_attach_sql("sq", {"type": "sqlite", "database": "/tmp/a.db"})
        assert sql == 'ATTACH \'/tmp/a.db\' AS "sq" (TYPE sqlite)'

    def test_missing_path_raises(self):
        with pytest.raises(ValueError):
            build_attach_sql("sq", {"type": "sqlite"})


class TestSqliteTablesEndpoint:
    """GET /api/datasources/databases/{id}/tables 对 sqlite 连接的支持"""

    def test_lists_tables_columns_rowcounts(self, sqlite_file):
        connection_id = "ALARM-SQLITE"
        _register_connection(
            connection_id, DataSourceType.SQLITE, {"path": sqlite_file}
        )
        try:
            resp = client.get(f"/api/datasources/databases/{connection_id}/tables")
            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True
            data = body["data"]
            assert data["connection_id"] == connection_id
            assert data["database"] == sqlite_file
            assert data["table_count"] == 2

            tables_by_name = {t["table_name"]: t for t in data["tables"]}
            assert set(tables_by_name) == {"users", "orders"}

            users = tables_by_name["users"]
            assert users["row_count"] == 3
            assert {c["name"] for c in users["columns"]} == {"id", "name"}

            orders = tables_by_name["orders"]
            assert orders["row_count"] == 2
        finally:
            _unregister_connection(connection_id)

    def test_schemas_endpoint_returns_empty(self, sqlite_file):
        connection_id = "sqlite-schema-test"
        _register_connection(
            connection_id, DataSourceType.SQLITE, {"path": sqlite_file}
        )
        try:
            resp = client.get(f"/api/datasources/databases/{connection_id}/schemas")
            assert resp.status_code == 200
            body = resp.json()
            assert body["data"]["items"] == []
        finally:
            _unregister_connection(connection_id)


class TestDuckdbFileTablesEndpoint:
    """GET /api/datasources/databases/{id}/tables 对 duckdb 文件连接的支持"""

    def test_lists_tables_columns_rowcounts(self, duckdb_file):
        connection_id = "duckdb-file-test"
        _register_connection(
            connection_id, DataSourceType.DUCKDB, {"path": duckdb_file}
        )
        try:
            resp = client.get(f"/api/datasources/databases/{connection_id}/tables")
            assert resp.status_code == 200
            body = resp.json()
            data = body["data"]
            assert data["table_count"] == 1
            products = data["tables"][0]
            assert products["table_name"] == "products"
            assert products["row_count"] == 2
            assert {c["name"] for c in products["columns"]} == {"id", "name"}
        finally:
            _unregister_connection(connection_id)


class TestDuckdbConnectionCreationViaApi:
    """回归测试：POST /api/datasources/databases 创建 duckdb 文件连接不应失败

    历史 bug：DatabaseManager._create_engine 未处理 DataSourceType.DUCKDB，
    add_connection 测试通过后仍会因“创建 SQLAlchemy 引擎”这一步抛
    `Unsupported database type: DataSourceType.DUCKDB` 而把整体保存判为失败，
    导致 duckdb 文件连接完全无法创建。
    """

    def test_create_duckdb_connection_succeeds(self, duckdb_file):
        connection_id = "duckdb-create-api-test"
        try:
            resp = client.post(
                "/api/datasources/databases",
                params={"test_connection": "true"},
                json={
                    "id": connection_id,
                    "name": connection_id,
                    "type": "duckdb",
                    "params": {"path": duckdb_file},
                },
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True
            assert body["data"]["connection"]["status"] == "active"
            assert body["data"]["test_result"]["success"] is True
            assert connection_id not in db_manager.engines
        finally:
            db_manager.remove_connection(connection_id)


class TestFederatedQueryWithFileDatabases:
    """真实 ATTACH 的联邦查询集成测试，验证 build_attach_sql 修复对查询链路生效"""

    def test_sqlite_federated_query(self, sqlite_file):
        connection_id = "sq-fed-test"
        _register_connection(
            connection_id, DataSourceType.SQLITE, {"path": sqlite_file}
        )
        try:
            resp = client.post(
                "/api/duckdb/federated-query",
                json={
                    "sql": "SELECT * FROM sq_test.users ORDER BY id",
                    "attach_databases": [
                        {"alias": "sq_test", "connection_id": connection_id}
                    ],
                    "is_preview": False,
                },
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["data"]["row_count"] == 3
            names = [row["name"] for row in body["data"]["data"]]
            assert names == ["张三", "李四", "王五"]
        finally:
            _unregister_connection(connection_id)

    def test_duckdb_file_federated_query(self, duckdb_file):
        connection_id = "duckdb-fed-test"
        _register_connection(
            connection_id, DataSourceType.DUCKDB, {"path": duckdb_file}
        )
        try:
            resp = client.post(
                "/api/duckdb/federated-query",
                json={
                    "sql": "SELECT * FROM dk_test.products ORDER BY id",
                    "attach_databases": [
                        {"alias": "dk_test", "connection_id": connection_id}
                    ],
                    "is_preview": False,
                },
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["data"]["row_count"] == 2
            names = [row["name"] for row in body["data"]["data"]]
            assert names == ["apple", "banana"]
        finally:
            _unregister_connection(connection_id)


class TestDirtySQLiteDetailDegradation:
    """脏 SQLite 库(声明类型与实际值不符)下 /tables/detail 的降级行为。

    回归背景(2026-07): JOIN 面板取列信息走 /tables/detail,其 LIMIT 5 采样
    在脏库上抛 Mismatch Type Error 导致整个接口 500,面板显示"无法获取列信息"。
    列信息本身不读行数据,必须照常返回;采样失败只降级为空。
    """

    @pytest.fixture
    def dirty_sqlite_file(self, tmp_path):
        import sqlite3

        path = str(tmp_path / "dirty.db")
        con = sqlite3.connect(path)
        con.execute("CREATE TABLE alerts (id INTEGER, updated_at INTEGER)")
        con.execute("INSERT INTO alerts VALUES (1, 1700000000)")
        con.execute("INSERT INTO alerts VALUES (2, '2025-11-21T04:07:54.227Z')")
        con.commit()
        con.close()
        return path

    def test_detail_returns_columns_even_when_sample_fails(self, dirty_sqlite_file):
        connection_id = "test-dirty-sqlite-detail"
        _register_connection(
            connection_id, DataSourceType.SQLITE, {"path": dirty_sqlite_file}
        )
        try:
            resp = client.get(
                f"/api/datasources/databases/{connection_id}/tables/detail",
                params={"table_name": "alerts"},
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            col_names = [c["name"] for c in data["columns"]]
            assert "updated_at" in col_names
            assert data["row_count"] == 2
            # 兼容模式默认关闭:采样读整行会炸,应降级为空而非 500
            assert data["sample_data"] == []
        finally:
            _unregister_connection(connection_id)
