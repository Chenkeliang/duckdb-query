"""Federated inline-save atomicity regressions (2026-09-07)."""

from contextlib import contextmanager
from types import SimpleNamespace

import duckdb

from models.query_models import FederatedQueryRequest
from routers import duckdb_query


def test_inline_save_materializes_user_query_once(monkeypatch):
    """Preview and the saved table must come from one materialization.

    The historical path fetched the query and then ran a second CTAS.  A
    sequence made the response contain 1 while the saved table contained 2.
    """
    connection = duckdb.connect(":memory:")
    connection.execute("CREATE SEQUENCE save_once START 1")

    @contextmanager
    def connection_scope(_query_id, _sql):
        yield connection

    monkeypatch.setattr(duckdb_query, "interruptible_connection", connection_scope)
    monkeypatch.setattr(
        duckdb_query, "_log_query_metrics_in_conn", lambda *_args: 1.0
    )
    monkeypatch.setattr(duckdb_query.table_registry, "record_creation", lambda *_args: None)

    try:
        response = duckdb_query.execute_federated_query(
            FederatedQueryRequest(
                sql="SELECT nextval('save_once') AS value",
                is_preview=False,
                save_as_table="saved_once",
            )
        )

        assert response["success"] is True
        assert response["data"]["data"] == [{"value": 1}]
        assert connection.execute("SELECT * FROM saved_once").fetchall() == [(1,)]
        assert connection.execute("SELECT currval('save_once')").fetchone() == (1,)
    finally:
        connection.close()


def test_inline_save_keeps_system_preview_limit_out_of_saved_table(monkeypatch):
    connection = duckdb.connect(":memory:")

    @contextmanager
    def connection_scope(_query_id, _sql):
        yield connection

    monkeypatch.setattr(duckdb_query, "interruptible_connection", connection_scope)
    monkeypatch.setattr(
        duckdb_query.config_manager,
        "get_app_config",
        lambda: SimpleNamespace(max_query_rows=2, federated_query_timeout=30),
    )
    monkeypatch.setattr(
        duckdb_query, "_log_query_metrics_in_conn", lambda *_args: 1.0
    )
    monkeypatch.setattr(duckdb_query.table_registry, "record_creation", lambda *_args: None)

    try:
        response = duckdb_query.execute_federated_query(
            FederatedQueryRequest(
                sql="SELECT * FROM range(5) AS t(value)",
                is_preview=True,
                save_as_table="saved_full",
            )
        )

        assert response["data"]["row_count"] == 2
        assert response["data"]["saved_table"] == "saved_full"
        assert response["data"]["save_error"] is None
        assert connection.execute("SELECT count(*) FROM saved_full").fetchone() == (5,)
    finally:
        connection.close()


def test_inline_save_preview_preserves_explicit_order_without_internal_column(monkeypatch):
    """Regression 2026-09-07: parallel CTAS must not scramble ordered preview rows."""
    connection = duckdb.connect(":memory:")
    connection.execute("SET threads=8")
    connection.execute("SET preserve_insertion_order=false")

    @contextmanager
    def connection_scope(_query_id, _sql):
        yield connection

    monkeypatch.setattr(duckdb_query, "interruptible_connection", connection_scope)
    monkeypatch.setattr(
        duckdb_query.config_manager,
        "get_app_config",
        lambda: SimpleNamespace(max_query_rows=3, federated_query_timeout=30),
    )
    monkeypatch.setattr(
        duckdb_query, "_log_query_metrics_in_conn", lambda *_args: 1.0
    )
    monkeypatch.setattr(duckdb_query.table_registry, "record_creation", lambda *_args: None)

    try:
        response = duckdb_query.execute_federated_query(
            FederatedQueryRequest(
                sql="SELECT range AS id FROM range(1000000) ORDER BY id DESC",
                is_preview=True,
                save_as_table="saved_ordered",
            )
        )

        assert response["data"]["data"] == [
            {"id": 999999},
            {"id": 999998},
            {"id": 999997},
        ]
        columns = connection.execute(
            "SELECT column_name FROM duckdb_columns() "
            "WHERE table_name='saved_ordered' ORDER BY column_index"
        ).fetchall()
        assert columns == [("id",)]
    finally:
        connection.close()
