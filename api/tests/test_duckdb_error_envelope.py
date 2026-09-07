"""DuckDB 路由标准错误信封。"""

import os
import sys
from unittest.mock import MagicMock, Mock, patch

from tests.pool_mock import bind_mock_duckdb_pool

from fastapi.testclient import TestClient

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from main import app

client = TestClient(app, raise_server_exceptions=False)


def test_duckdb_table_detail_not_found_envelope():
    mock_con = Mock()
    mock_con.execute.return_value.fetchall.return_value = [("other_table",)]
    with patch("routers.duckdb_query.with_duckdb_connection") as mock_pool:
        bind_mock_duckdb_pool(mock_pool, mock_con)
        response = client.get("/api/duckdb/tables/detail/__missing_table__")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_NOT_FOUND"


def test_duckdb_execute_empty_sql_validation():
    with patch("routers.duckdb_query.with_duckdb_connection", MagicMock()):
        response = client.post(
            "/api/duckdb/execute",
            json={"sql": "   ", "is_preview": True},
        )
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_duckdb_execute_includes_structured_sql_error_location():
    """Regression 2026-09-04: the editor must not parse human error text itself."""
    response = client.post(
        "/api/duckdb/execute",
        json={"sql": "SELECT 1 + missing", "is_preview": True},
    )
    assert response.status_code == 500
    body = response.json()
    assert body["error"]["details"]["sql_location"] == {
        "line": 1,
        "column": 12,
        "end_column": 19,
    }
    identity = body["error"]["details"]["sql_identity"]
    assert identity["sha256"]
    assert not body["error"]["message"].lstrip().startswith("{")


def test_federated_query_missing_connection_envelope():
    with patch("routers.duckdb_query.db_manager") as mock_db_manager:
        mock_db_manager.get_connection.return_value = None
        response = client.post(
            "/api/duckdb/federated-query",
            json={
                "sql": "SELECT 1",
                "attach_databases": [
                    {"alias": "ext_db", "connection_id": "missing-conn"}
                ],
                "is_preview": False,
            },
        )
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_NOT_FOUND"
    assert "missing-conn" in body["error"]["message"]
