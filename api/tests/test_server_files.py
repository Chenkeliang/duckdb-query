import os
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from main import app
from core.common.config_manager import config_manager
from tests.pool_mock import bind_mock_duckdb_pool


@pytest.fixture(scope="module", autouse=True)
def server_mount(tmp_path_factory):
    mount_dir = tmp_path_factory.mktemp("server_mount")
    sample_file = mount_dir / "sample.csv"
    sample_file.write_text("city,pop\nshanghai,1\nchengdu,2\n", encoding="utf-8")

    app_config = config_manager.get_app_config()
    app_config.server_data_mounts = [
        {"label": "TestMount", "path": str(mount_dir)},
    ]
    yield str(mount_dir), str(sample_file)


client = TestClient(app, raise_server_exceptions=False)


def _unwrap(body: dict) -> dict:
    return body.get("data", body) if isinstance(body, dict) else {}


def test_list_server_mounts(server_mount):
    response = client.get("/api/server-files/mounted")
    assert response.status_code == 200
    mounts = _unwrap(response.json()).get("mounts", [])
    assert any(m["label"] == "TestMount" for m in mounts)


def test_browse_server_directory(server_mount):
    mount_dir, _ = server_mount
    response = client.get("/api/server-files/browse", params={"path": mount_dir})
    assert response.status_code == 200
    payload = _unwrap(response.json())
    assert payload["entries"]
    entry_paths = [entry["path"] for entry in payload["entries"]]
    assert any(p.endswith("sample.csv") for p in entry_paths)


def test_import_server_file(server_mount):
    _, sample_file = server_mount
    ingest_result = SimpleNamespace(
        table_name="server_file_sample",
        row_count=2,
        column_count=2,
        columns=["city", "pop"],
        column_profiles=[],
    )
    with (
        patch("core.database.duckdb_engine.with_duckdb_connection") as mock_pool,
        patch(
            "core.services.file_ingestion_service.ingest_server_tabular",
            return_value=ingest_result,
        ),
        patch("core.services.file_ingestion_service.save_file_metadata"),
        patch(
            "core.data.file_datasource_manager.file_datasource_manager.save_file_datasource",
            return_value=True,
        ),
    ):
        bind_mock_duckdb_pool(mock_pool, Mock())
        response = client.post(
            "/api/server-files/import",
            json={"path": sample_file, "table_alias": "server_file_sample"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body.get("success") is True
    data = _unwrap(body)
    assert data["table_name"] == "server_file_sample"
    assert data["row_count"] == 2
