import os

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from main import app
from core.config_manager import config_manager
from core.duckdb_engine import get_db_connection


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

    con = get_db_connection()
    con.execute('DROP TABLE IF EXISTS "server_file_sample"')


client = TestClient(app)


def test_list_server_mounts(server_mount):
    response = client.get("/api/server_files/mounts")
    assert response.status_code == 200
    mounts = response.json().get("mounts", [])
    assert any(m["label"] == "TestMount" for m in mounts)


def test_browse_server_directory(server_mount):
    mount_dir, _ = server_mount
    response = client.get("/api/server_files", params={"path": mount_dir})
    assert response.status_code == 200
    payload = response.json()
    assert payload["entries"]
    entry_paths = [entry["path"] for entry in payload["entries"]]
    assert any(p.endswith("sample.csv") for p in entry_paths)


def test_import_server_file(server_mount):
    _, sample_file = server_mount
    response = client.post(
        "/api/server_files/import",
        json={"path": sample_file, "table_alias": "server_file_sample"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["table_name"] == "server_file_sample"

    con = get_db_connection()
    result = con.execute('SELECT COUNT(*) FROM "server_file_sample"').fetchone()
    assert result[0] == 2
