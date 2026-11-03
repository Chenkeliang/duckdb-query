"""Real Quack API regressions against isolated localhost data (2026-11-03)."""

from contextlib import contextmanager
import json

import pytest
from fastapi.testclient import TestClient

from core.database.connection_registry import connection_registry
from core.services import quack_service as service_module
from main import app
from routers import quack as routes
from test_quack_service import connected, quack_server, service  # noqa: F401


@pytest.fixture
def api(connected, monkeypatch):
    """Use main's actual routes, but only the synthetic service configuration."""
    implementation, identifier, server = connected
    monkeypatch.setattr(routes, "quack_service", implementation)
    monkeypatch.setattr(service_module, "quack_service", implementation)
    # API test is the user-triggered installation path, but the test itself
    # stays offline: actual signed extensions are already available in fixture.
    original = implementation._connection
    @contextmanager
    def installed(config, allow_install=False):
        with original(config, allow_install=False) as connection:
            yield connection
    monkeypatch.setattr(implementation, "_connection", installed)
    return TestClient(app), implementation, identifier, server


def test_services_crud_standard_envelopes_and_no_token(api):
    """2026-11-03: all CRUD responses mask credentials and preserve edit token."""
    client, implementation, identifier, info = api
    response = client.get("/api/quack/services")
    assert response.status_code == 200
    assert response.json()["data"]["total"] == 1
    assert info["token"] not in response.text
    created = client.post("/api/quack/services", json={"name": "Other", "uri": info["uri"], "token": "another-private"})
    assert created.status_code == 200 and created.json()["success"]
    other_id = created.json()["data"]["id"]
    assert "token" not in created.json()["data"]
    updated = client.put(f"/api/quack/services/{other_id}", json={"name": "Changed", "uri": info["uri"]})
    assert updated.json()["data"]["has_token"]
    assert implementation._credentials(other_id)["token"] == "another-private"
    assert client.delete(f"/api/quack/services/{other_id}").json()["data"] == {"id": other_id}
    missing = client.delete(f"/api/quack/services/{other_id}")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "QUACK_SERVICE_NOT_FOUND"


def test_saved_and_unsaved_real_authentication(api):
    """2026-11-03: token authentication is real, never a success-only mock."""
    client, _implementation, identifier, info = api
    for path, payload in [
        (f"/api/quack/services/{identifier}/test", None),
        ("/api/quack/services/test", {"name": "Unsaved", "uri": info["uri"], "token": info["token"]}),
    ]:
        response = client.post(path, json=payload)
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["connected"] and data["server_version"] == "v2.0.0"
        assert data["application_read_only"] and not data["server_read_only_verified"]
    failed = client.post("/api/quack/services/test", json={"name": "Wrong token", "uri": info["uri"], "token": "wrong-private-token"})
    assert failed.status_code == 400
    assert failed.json()["error"]["code"] == "QUACK_CONNECTION_FAILED"
    assert "wrong-private-token" not in failed.text and info["token"] not in failed.text


@pytest.mark.parametrize("endpoint,params,expected", [
    ("catalogs", {}, "memory"),
    ("schemas", {"catalog": "memory"}, "main"),
    ("tables", {"catalog": "memory", "schema": "main"}, "records"),
    ("columns", {"catalog": "memory", "schema": "main", "table": "exact_values"}, "amount"),
])
def test_real_metadata_routes(api, endpoint, params, expected):
    """2026-11-03: all four metadata endpoints return actual remote metadata."""
    client, _implementation, identifier, info = api
    params = {key: (info["catalog"] if key == "catalog" else value) for key, value in params.items()}
    if endpoint == "catalogs":
        expected = info["catalog"]
    response = client.get(f"/api/quack/services/{identifier}/{endpoint}", params=params)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["total"] == len(data["items"])
    assert any(item["name"] == expected for item in data["items"])


@pytest.mark.parametrize("headers,request_id", [({"X-Request-ID": "quack-api-header"}, "body-ignored"), ({}, "quack-api-body")])
def test_execute_real_precision_and_request_id(api, headers, request_id):
    """2026-11-03: header wins over body ID; foreground ownership is released."""
    client, _implementation, identifier, _info = api
    response = client.post(f"/api/quack/services/{identifier}/execute", headers=headers, json={
        "sql": "SELECT amount,big FROM exact_values", "is_preview": False, "request_id": request_id,
    })
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["row_count"] == 1 and data["quack_service_id"] == identifier
    assert data["data"] == [{"amount": "1234567890123456789.1234567890123456789", "big": "170141183460469231731687303715884105727"}]
    effective = headers.get("X-Request-ID", request_id)
    assert connection_registry.get(f"sync:{effective}") is None
    from core.services.foreground_queries import foreground_queries
    assert effective not in foreground_queries._active


@pytest.mark.parametrize("sql", ["DELETE FROM records", "SELECT * FROM catalog.\"query\"('DELETE FROM records RETURNING *')", "SELECT * FROM \"postgres_query\"('x','DELETE FROM records RETURNING *')"])
def test_execute_rejects_outer_select_write_wrappers(api, sql):
    """2026-11-03: quoted dynamic SQL must never mutate the remote server."""
    client, implementation, identifier, info = api
    response = client.post(f"/api/quack/services/{identifier}/execute", json={"sql": sql})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "QUACK_READ_ONLY_REQUIRED"
    assert info["server"].execute("SELECT count(*) FROM records").fetchone() == (100001,)


def test_unknown_service_execute_standard_not_found(api):
    """2026-11-03: foreground source lookup may not bypass the error envelope."""
    client, *_rest = api
    response = client.post("/api/quack/services/not-found/execute", headers={"X-Request-ID": "missing-service"}, json={"sql": "SELECT 1"})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "QUACK_SERVICE_NOT_FOUND"


def test_validation_error_never_echoes_token(api):
    """2026-11-03: invalid request handling must omit secret inputs too."""
    client, *_rest = api
    response = client.post("/api/quack/services", json={"name": "", "uri": "bad", "token": "private-request-token"})
    assert response.status_code == 422
    assert "private-request-token" not in response.text


def test_execute_preview_has_standard_result_shape(api):
    """2026-11-03: API preview bounds rows, not the remote aggregate input."""
    client, _implementation, identifier, _info = api
    from core.common.config_manager import config_manager
    response = client.post(f"/api/quack/services/{identifier}/execute", json={"sql": "SELECT * FROM records"})
    assert response.status_code == 200
    result = response.json()["data"]
    assert result["row_count"] == config_manager.get_app_config().max_query_rows
    assert result["preview_limit_applied"] == result["row_count"]
    assert result["columns"] == ["id", "status"]
    assert result["column_types"] == [{"name": "id", "duckdb_type": "INTEGER"}, {"name": "status", "duckdb_type": "INTEGER"}]
    assert result["execution_time_ms"] >= 0
