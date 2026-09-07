"""App feature metadata exposes explicit DuckDB version boundaries."""

from fastapi.testclient import TestClient

from main import app


def test_app_features_reports_python_engine_and_storage_versions():
    response = TestClient(app).get("/api/app-config/features")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["duckdb_python_version"]
    assert data["duckdb_engine_version"].startswith("v")
    assert data["duckdb_storage_compatibility_version"] == "v2.0.0"
    assert data["duckdb_main_storage_version"]
    assert data["duckdb_system_storage_version"]
    assert isinstance(data["duckdb_storage_upgrade_required"], bool)


def test_engine_major_matches_the_selected_release_matrix():
    response = TestClient(app).get("/api/app-config/features")
    engine_version = response.json()["data"]["duckdb_engine_version"]
    assert engine_version.startswith("v2.")
