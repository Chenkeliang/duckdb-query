"""Read-only inspection and desktop reveal of the latest migration backup."""
import os
from pathlib import Path
import re
import subprocess
import sys

import duckdb

from core.common.config_manager import config_manager
from core.database.storage_upgrade import _read_json, _report_path


def inspect_latest_backup() -> dict:
    """Resolve only the report's backup beneath the configured database directory."""
    report = _read_json(_report_path()) or {}
    result = {"available": False, "directory": None, "files": [], "error": None}
    raw = report.get("backup_directory")
    if not isinstance(raw, str) or not raw:
        result["error"] = "No migration backup recorded"
        return result
    paths = config_manager.get_duckdb_paths(ensure_dirs=False)
    directory = Path(raw)
    if (not re.fullmatch(r"backup_storage_migration_[A-Za-z0-9_-]+", directory.name)
            or directory.is_symlink()
            or directory.resolve().parent != Path(paths.database_path).resolve().parent):
        result["error"] = "Backup directory is outside the expected location"
        return result
    result["directory"] = str(directory.resolve())
    for label, source in (("main", paths.database_path), ("system", paths.system_database_path)):
        path = directory / Path(source).name
        entry = {"name": label, "present": False, "readable": False, "size_bytes": 0, "wal_present": False}
        result["files"].append(entry)
        wal = Path(f"{path}.wal")
        if path.is_symlink() or wal.is_symlink() or not path.is_file():
            continue
        entry.update(present=True, size_bytes=path.stat().st_size, wal_present=wal.is_file())
        try:
            with duckdb.connect(str(path), read_only=True) as connection:
                connection.execute("SELECT count(*) FROM duckdb_tables()").fetchone()
            entry["readable"] = True
        except duckdb.Error:
            pass
    result["available"] = all(entry["readable"] for entry in result["files"])
    if not result["available"]:
        result["error"] = "Backup files are missing or cannot be opened read-only"
    return result


def open_latest_backup() -> bool:
    """Reveal a validated complete backup; no caller-controlled path or shell."""
    from utils.local_export import desktop_local_export_enabled
    from core.common.exceptions import BaseAPIException
    if not desktop_local_export_enabled():
        raise BaseAPIException("Opening folders is available only in the desktop app", 403, "FORBIDDEN")
    status = inspect_latest_backup()
    if not status["available"]:
        raise BaseAPIException(status["error"], 400, "BACKUP_UNAVAILABLE")
    directory = status["directory"]
    if sys.platform == "win32":
        os.startfile(directory)  # pylint: disable=no-member
    else:
        subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", directory],  # pylint: disable=consider-using-with
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return True
