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
