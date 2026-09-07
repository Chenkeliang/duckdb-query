"""Schedule and process offline DuckDB storage upgrades across app restarts."""

from __future__ import annotations

import json
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.common.config_manager import config_manager
from core.database.duckdb_storage import DUCKDB_STORAGE_COMPATIBILITY_VERSION

logger = logging.getLogger(__name__)

_REQUEST_FILE = "storage-upgrade-request.json"
_REPORT_FILE = "storage-upgrade-report.json"


def _request_path() -> Path:
    return config_manager.config_dir / _REQUEST_FILE


def _report_path() -> Path:
    return config_manager.config_dir / _REPORT_FILE


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else None
    except (OSError, ValueError):
        return None


def storage_upgrade_plan(main_version: str, system_version: str) -> dict[str, Any]:
    """Build a non-mutating migration plan from actual open-database versions."""
    paths = config_manager.get_duckdb_paths(ensure_dirs=False)
    database_paths = {
        "main": paths.database_path,
        "system": paths.system_database_path,
    }
    versions = {"main": main_version, "system": system_version}
    databases = {}
    source_bytes = 0
    for name, path in database_paths.items():
        size_bytes = path.stat().st_size if path.exists() else 0
        wal_path = Path(f"{path}.wal")
        wal_bytes = wal_path.stat().st_size if wal_path.exists() else 0
        source_bytes += size_bytes + wal_bytes
        databases[name] = {
            "version": versions[name],
            "size_bytes": size_bytes,
            "wal_size_bytes": wal_bytes,
        }
    required_bytes = source_bytes * 2 + 64 * 1024 * 1024
    free_bytes = shutil.disk_usage(paths.database_path.parent).free
    pending = _read_json(_request_path())
    from core.database.connection_registry import connection_registry

    return {
        "target_storage": DUCKDB_STORAGE_COMPATIBILITY_VERSION,
        "required": any(
            not version.startswith(DUCKDB_STORAGE_COMPATIBILITY_VERSION)
            for version in versions.values()
        ),
        "pending_restart": pending is not None,
        "main": databases["main"],
        "system": databases["system"],
        "required_bytes": required_bytes,
        "free_bytes": free_bytes,
        "active_queries": connection_registry.get_active_count(),
        "backup_directory": pending.get("backup_directory") if pending else None,
        "last_report": _read_json(_report_path()),
    }


def schedule_storage_upgrade() -> dict[str, Any]:
    """Persist an idempotent request that is consumed before the next DB startup."""
    existing = _read_json(_request_path())
    if existing:
        return existing
    paths = config_manager.get_duckdb_paths(ensure_dirs=False)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    request = {
        "target_storage": DUCKDB_STORAGE_COMPATIBILITY_VERSION,
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "stamp": stamp,
        "backup_directory": str(
            paths.database_path.parent / f"backup_storage_migration_{stamp}"
        ),
    }
    config_manager.atomic_write_json(_request_path(), request)
    return request


def process_pending_storage_upgrade() -> dict[str, Any] | None:
    """Run a scheduled migration before any application DuckDB connection opens."""
    request_path = _request_path()
    request = _read_json(request_path)
    if not request:
        return None
    target = str(request.get("target_storage") or "")
    stamp = str(request.get("stamp") or "")
    previous_report = _read_json(_report_path()) or {}
    backup = None
    report: dict[str, Any] = {
        "target_storage": target,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "backup_directory": previous_report.get("backup_directory"),
        "databases": {},
    }
    try:
        if target != DUCKDB_STORAGE_COMPATIBILITY_VERSION or not stamp:
            raise ValueError("Storage upgrade request target is invalid or stale")
        from scripts.migrate_storage_to_latest import backup_database_set, migrate_database_file

        paths = config_manager.get_duckdb_paths(ensure_dirs=False)
        backup = backup_database_set([paths.database_path, paths.system_database_path])
        report["backup_directory"] = str(backup)
        success = True
        for name, path in (
            ("main", paths.database_path),
            ("system", paths.system_database_path),
        ):
            migrated = migrate_database_file(
                path,
                stamp=stamp,
                target_storage=target,
                backup_created=True,
            )
            report["databases"][name] = {"success": migrated}
            success = success and migrated
            if not success:
                break
        report["status"] = "success" if success else "failed"
    except Exception as exc:  # pylint: disable=broad-exception-caught
        logger.exception("Pending storage upgrade failed")
        report["status"] = "failed"
        report["error"] = str(exc)[:500]
    report["completed_at"] = datetime.now(timezone.utc).isoformat()
    if backup is not None:
        config_manager.atomic_write_json(backup / "migration-report.json", report)
    config_manager.atomic_write_json(_report_path(), report)
    try:
        os.remove(request_path)
    except FileNotFoundError:
        pass
    return report
