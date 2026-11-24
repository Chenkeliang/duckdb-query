"""Doris read-only query routing and returned values."""

from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from pymysql.constants import FIELD_TYPE

from core.common.exceptions import ValidationError
from core.database import doris_source


def test_workbench_alias_and_preview_limit():
    sql, limit = doris_source._prepare_doris_sql(
        'SELECT * FROM doris_reporting."Order Detail"', "doris_reporting", "reporting", 20
    )
    assert sql == "SELECT * FROM `reporting`.`Order Detail` LIMIT 20"
    assert limit == 20

    sql, limit = doris_source._prepare_doris_sql(
        "SELECT * FROM reporting.orders LIMIT 3", "doris_reporting", "reporting", 20
    )
    assert sql.endswith("LIMIT 3")
    assert limit is None


@pytest.mark.parametrize(
    "sql",
    ["SET query_timeout=5", "SELECT 1; SELECT 2", "SELECT * FROM another.orders",
     "SELECT 1 INTO stored_value"],
)
def test_doris_rejects_other_databases_and_non_read_only_requests(sql):
    with pytest.raises(ValidationError):
        doris_source._prepare_doris_sql(sql, "doris_reporting", "reporting", None)


def test_direct_result_retains_large_integer_and_decimal(monkeypatch):
    connection = MagicMock()
    cursor = connection.__enter__.return_value.cursor.return_value.__enter__.return_value
    cursor.description = [("id", FIELD_TYPE.LONGLONG), ("amount", FIELD_TYPE.NEWDECIMAL)]
    cursor.fetchall.return_value = [(9007199254740993, Decimal("2.0100"))]
    monkeypatch.setattr(doris_source, "connect_doris", lambda _config: connection)

    data = doris_source.execute_doris_query(
        "SELECT id, amount FROM doris_reporting.orders",
        "doris_reporting",
        {"database": "reporting"},
        is_preview=False,
    )

    cursor.execute.assert_called_once_with("SELECT id, amount FROM `reporting`.orders")
    assert data["data"] == [{"id": "9007199254740993", "amount": "2.0100"}]
    assert data["column_types"] == [
        {"name": "id", "duckdb_type": "BIGINT"},
        {"name": "amount", "duckdb_type": "DECIMAL"},
    ]


def test_native_endpoint_accepts_doris_comments_before_execution(monkeypatch):
    """2026-11-24: the DuckDB guard rejected valid Doris # comments."""
    from main import app

    alias = "doris_reporting"
    monkeypatch.setattr("routers.duckdb_query.resolve_attach_configs", lambda _: [
        (alias, {"type": "doris", "database": "reporting"}),
    ])
    executed = []

    def fake_adapter(sql, alias, config, **_kwargs):
        prepared, _ = doris_source._prepare_doris_sql(sql, alias, config["database"], None)
        executed.append(prepared)
        return {"doris_native": True, "sql_query": sql}

    monkeypatch.setattr("routers.duckdb_query.execute_doris_query", fake_adapter)
    with TestClient(app) as client:
        for sql in (
            "SELECT id FROM doris_reporting.orders; # notes",
            "SELECT COUNT(`id`) FROM (SELECT id FROM doris_reporting.orders # update label\n) AS _src",
        ):
            response = client.post("/api/duckdb/federated-query", json={
                "sql": sql, "attach_databases": [{"alias": alias, "connection_id": "fixture"}],
            })
            assert response.status_code == 200, response.text
            assert response.json()["data"]["sql_query"] == sql
        response = client.post("/api/duckdb/federated-query", json={
            "sql": "SELECT 1; # notes\nSELECT 2",
            "attach_databases": [{"alias": alias, "connection_id": "fixture"}],
        })
        assert response.status_code == 400, response.text
    assert executed == [
        "SELECT id FROM `reporting`.orders",
        "SELECT COUNT(`id`) FROM (SELECT id FROM `reporting`.orders) AS _src",
    ]
