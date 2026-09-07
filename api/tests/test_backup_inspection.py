"""Regression 2026-09-07: recovery UI must never open arbitrary or incomplete backups."""
from types import SimpleNamespace
from unittest.mock import Mock
import duckdb
import pytest
from core.database import backup_inspection as backup
from core.common.exceptions import BaseAPIException


def setup_backup(monkeypatch, tmp_path):
    folder = tmp_path / "backup_storage_migration_test"
    folder.mkdir()
    paths = SimpleNamespace(database_path=tmp_path / "main.db", system_database_path=tmp_path / "system.db")
    monkeypatch.setattr(backup, "config_manager", Mock(get_duckdb_paths=Mock(return_value=paths)))
    monkeypatch.setattr(backup, "_read_json", lambda _: {"backup_directory": str(folder)})
    return folder


def test_valid_backup_and_missing_peer(monkeypatch, tmp_path):
    folder = setup_backup(monkeypatch, tmp_path)
    for name in ("main.db", "system.db"):
        with duckdb.connect(str(folder / name)) as con:
            con.execute("CREATE TABLE t AS SELECT 42 n")
    assert backup.inspect_latest_backup()["available"]
    (folder / "system.db").unlink()
    assert not backup.inspect_latest_backup()["available"]


def test_symlink_and_unrelated_directory_rejected(monkeypatch, tmp_path):
    folder = setup_backup(monkeypatch, tmp_path)
    (folder / "main.db").symlink_to(tmp_path / "live.db")
    assert not backup.inspect_latest_backup()["available"]
    monkeypatch.setattr(backup, "_read_json", lambda _: {"backup_directory": str(tmp_path)})
    result = backup.inspect_latest_backup()
    assert not result["available"] and result["directory"] is None


def test_corrupt_backup_is_not_reported_ready(monkeypatch, tmp_path):
    folder = setup_backup(monkeypatch, tmp_path)
    for name in ("main.db", "system.db"):
        (folder / name).write_bytes(b"not a database")
    assert not backup.inspect_latest_backup()["available"]


def test_server_cannot_launch_file_manager(monkeypatch):
    monkeypatch.delenv("ALLOW_ARBITRARY_LOCAL_PATHS", raising=False)
    with pytest.raises(BaseAPIException) as exc:
        backup.open_latest_backup()
    assert exc.value.status_code == 403


def test_management_endpoints_use_standard_responses(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from main import app
    setup_backup(monkeypatch, tmp_path)
    client = TestClient(app)
    response = client.get("/api/storage-upgrade/backup")
    assert response.status_code == 200
    assert response.json()["data"]["available"] is False
    assert client.get("/api/resource-budget").json()["success"] is True
    monkeypatch.delenv("ALLOW_ARBITRARY_LOCAL_PATHS", raising=False)
    assert client.post("/api/storage-upgrade/open-backup").status_code == 403
