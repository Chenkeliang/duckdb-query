"""DuckDB table-list ordering regressions."""

from contextlib import contextmanager

import duckdb

from routers import duckdb_query


def _list_table_names(monkeypatch, connection):
    @contextmanager
    def _connection():
        yield connection

    monkeypatch.setattr(duckdb_query, "with_duckdb_connection", _connection)
    monkeypatch.setattr(
        duckdb_query.file_datasource_manager,
        "get_file_datasource",
        lambda _table_name: None,
    )
    response = duckdb_query.list_duckdb_tables_summary()
    assert response["success"] is True
    return [item["table_name"] for item in response["data"]["items"]]


def test_newly_created_table_is_listed_first(monkeypatch):
    """Regression 2026-07-21: missing created_at fell back to name order."""
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE a_old (id INTEGER)")
        connection.execute("CREATE TABLE z_new (id INTEGER)")

        assert _list_table_names(monkeypatch, connection) == ["z_new", "a_old"]
    finally:
        connection.close()


def test_replaced_table_becomes_newest(monkeypatch):
    """Regression 2026-07-21: replacing a table must move it to the top."""
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE z_old (id INTEGER)")
        connection.execute("CREATE TABLE a_new (id INTEGER)")
        connection.execute("CREATE OR REPLACE TABLE z_old AS SELECT 1 AS id")

        assert _list_table_names(monkeypatch, connection) == ["z_old", "a_new"]
    finally:
        connection.close()


def test_metadata_created_at_overrides_catalog_order(monkeypatch):
    """Regression 2026-07-22: table_oid 在库文件重建后会漂,重启后列表洗牌,
    用户误以为新表被回退。有 created_at 元数据时必须按它倒排(与 AI 目录同口径),
    无元数据的表垫底。"""
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE meta_old (id INTEGER)")
        connection.execute("CREATE TABLE meta_new (id INTEGER)")
        connection.execute("CREATE TABLE no_meta (id INTEGER)")  # oid 最新但无元数据

        @contextmanager
        def _connection():
            yield connection

        created = {
            "meta_old": {"created_at": "2026-07-22T16:49:51"},
            "meta_new": {"created_at": "2026-07-20T08:00:00"},
        }
        monkeypatch.setattr(duckdb_query, "with_duckdb_connection", _connection)
        monkeypatch.setattr(
            duckdb_query.file_datasource_manager,
            "get_file_datasource",
            created.get,
        )
        response = duckdb_query.list_duckdb_tables_summary()
        names = [item["table_name"] for item in response["data"]["items"]]
        # meta_old 的元数据时间最新 → 排最前;no_meta 虽然 oid 最新但无元数据 → 垫底
        assert names == ["meta_old", "meta_new", "no_meta"]
    finally:
        connection.close()
