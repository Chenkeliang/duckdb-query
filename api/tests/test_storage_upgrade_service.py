"""Offline storage-upgrade scheduling and restart processing."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from core.database import storage_upgrade
from main import app


def _configure(monkeypatch, tmp_path: Path):
    config_dir = tmp_path / "config"
    data_dir = tmp_path / "data"
    config_dir.mkdir()
    data_dir.mkdir()
    paths = SimpleNamespace(
        database_path=data_dir / "main.db",
        system_database_path=data_dir / "system.db",
    )
    monkeypatch.setattr(storage_upgrade.config_manager, "config_dir", config_dir)
    monkeypatch.setattr(
        storage_upgrade.config_manager,
        "get_duckdb_paths",
        lambda ensure_dirs=False: paths,
    )
    return config_dir, paths


def test_schedule_only_writes_idempotent_restart_request(monkeypatch, tmp_path):
    config_dir, _paths = _configure(monkeypatch, tmp_path)
    first = storage_upgrade.schedule_storage_upgrade()
    second = storage_upgrade.schedule_storage_upgrade()
    assert first == second
    assert first["target_storage"] == "v2.0.0"
    assert (config_dir / "storage-upgrade-request.json").exists()
    assert not (config_dir / "storage-upgrade-report.json").exists()


def test_restart_processes_both_databases_and_records_report(monkeypatch, tmp_path):
    config_dir, paths = _configure(monkeypatch, tmp_path)
    for path in (paths.database_path, paths.system_database_path):
        path.write_bytes(b"placeholder")
    storage_upgrade.schedule_storage_upgrade()

    with patch(
        "scripts.migrate_storage_to_latest.migrate_database_file",
        return_value=True,
    ) as migrate:
        report = storage_upgrade.process_pending_storage_upgrade()

    assert report and report["status"] == "success"
    assert [call.args[0] for call in migrate.call_args_list] == [
        paths.database_path,
        paths.system_database_path,
    ]
    assert not (config_dir / "storage-upgrade-request.json").exists()
    assert (config_dir / "storage-upgrade-report.json").exists()


def test_schedule_endpoint_requires_both_irreversible_confirmations():
    client = TestClient(app, raise_server_exceptions=False)
    response = client.post(
        "/api/storage-upgrade/schedule",
        json={"confirm_backup": True, "confirm_no_downgrade": False},
    )
    assert response.status_code == 400


def test_schedule_endpoint_registers_restart_without_migrating():
    client = TestClient(app, raise_server_exceptions=False)
    plan = {
        "target_storage": "v2.0.0",
        "required": True,
        "pending_restart": False,
        "main": {"version": "v1.5.0+", "size_bytes": 1, "wal_size_bytes": 0},
        "system": {"version": "v1.5.0+", "size_bytes": 1, "wal_size_bytes": 0},
        "required_bytes": 10,
        "free_bytes": 100,
        "active_queries": 0,
        "backup_directory": None,
        "last_report": None,
    }
    with patch("routers.config_api._current_storage_upgrade_plan", return_value=plan), patch(
        "routers.config_api.schedule_storage_upgrade",
        return_value={"backup_directory": "/backup"},
    ):
        response = client.post(
            "/api/storage-upgrade/schedule",
            json={"confirm_backup": True, "confirm_no_downgrade": True},
        )
    assert response.status_code == 200
    assert response.json()["data"]["pending_restart"] is True


def test_schedule_endpoint_rejects_active_queries():
    client = TestClient(app, raise_server_exceptions=False)
    plan = {
        "required": True,
        "free_bytes": 100,
        "required_bytes": 10,
        "active_queries": 1,
    }
    with patch("routers.config_api._current_storage_upgrade_plan", return_value=plan):
        response = client.post(
            "/api/storage-upgrade/schedule",
            json={"confirm_backup": True, "confirm_no_downgrade": True},
        )
    assert response.status_code == 400


def test_mixed_versions_have_complete_backup_before_first_swap(monkeypatch, tmp_path):
    """2026-09-07: already-v2 main must still be part of the migration backup."""
    import duckdb
    _, paths = _configure(monkeypatch, tmp_path)
    for path, version in ((paths.database_path, "v2.0.0"), (paths.system_database_path, "v1.5.0")):
        with duckdb.connect(str(path), config={"storage_compatibility_version": version}) as conn:
            conn.execute("CREATE TABLE t AS SELECT 42 AS n")
    originals = {p.name: p.read_bytes() for p in (paths.database_path, paths.system_database_path)}
    storage_upgrade.schedule_storage_upgrade()
    report = storage_upgrade.process_pending_storage_upgrade()
    assert report["status"] == "success"
    directory = Path(report["backup_directory"])
    for name, content in originals.items():
        assert (directory / name).read_bytes() == content
    assert (directory / "migration-report.json").exists()


def test_second_database_failure_retry_keeps_both_backup_sets(monkeypatch, tmp_path):
    """2026-09-07: retry cannot overwrite the original complete recovery set."""
    _, paths = _configure(monkeypatch, tmp_path)
    for path in (paths.database_path, paths.system_database_path):
        path.write_bytes(b"original")
    Path(f"{paths.system_database_path}.wal").write_bytes(b"wal")
    def migrate(path, **_kwargs):
        if path == paths.database_path:
            path.write_bytes(b"upgraded")
            return True
        return False
    storage_upgrade.schedule_storage_upgrade()
    with patch("scripts.migrate_storage_to_latest.migrate_database_file", side_effect=migrate):
        first = storage_upgrade.process_pending_storage_upgrade()
    assert first["status"] == "failed"
    first_dir = Path(first["backup_directory"])
    storage_upgrade.schedule_storage_upgrade()
    with patch("scripts.migrate_storage_to_latest.migrate_database_file", return_value=True):
        second = storage_upgrade.process_pending_storage_upgrade()
    assert second["status"] == "success"
    assert second["backup_directory"] != first["backup_directory"]
    assert (first_dir / "main.db").read_bytes() == b"original"
    assert (first_dir / "system.db.wal").read_bytes() == b"wal"
    assert (Path(second["backup_directory"]) / "main.db").read_bytes() == b"upgraded"


def test_backup_failure_prevents_any_swap(monkeypatch, tmp_path):
    """2026-09-07: a failed complete snapshot must prevent all migration writes."""
    _, paths = _configure(monkeypatch, tmp_path)
    paths.database_path.write_bytes(b"original")
    paths.system_database_path.write_bytes(b"original")
    storage_upgrade.schedule_storage_upgrade()
    with patch("scripts.migrate_storage_to_latest.shutil.copy2", side_effect=OSError("disk full")), patch(
        "scripts.migrate_storage_to_latest.migrate_database_file"
    ) as migrate:
        report = storage_upgrade.process_pending_storage_upgrade()
    assert report["status"] == "failed"
    migrate.assert_not_called()
    assert paths.database_path.read_bytes() == b"original"
