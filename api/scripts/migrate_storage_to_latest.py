#!/usr/bin/env python3
"""
将 main.db / system.db 迁移到显式 storage compatibility 版本。

使用 DuckDB ``COPY FROM DATABASE`` 保留表、约束、索引、视图、序列与宏。

用法（先停止 API 服务，避免文件锁）:
    cd api
    python scripts/migrate_storage_to_latest.py --dry-run
    python scripts/migrate_storage_to_latest.py

可选:
    --only main|system   只迁移指定库
    --target-storage     目标格式（DuckQuery 2.0 默认 v2.0.0）
    --yes                跳过确认
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import duckdb

from core.common.config_manager import config_manager
from core.common.sql_identifiers import escape_string_literal, quote_identifier
from core.database.duckdb_storage import DUCKDB_STORAGE_COMPATIBILITY_VERSION

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class MigrationRecoveryError(RuntimeError):
    """The database/WAL pair could not be restored after a failed swap."""


def _marker_path(db_path: Path) -> Path:
    return db_path.with_name(f".{db_path.name}.storage-migration.json")


def _fsync_directory(directory: Path) -> None:
    """Durably persist directory entry changes where the platform supports it."""
    if os.name == "nt" or not hasattr(os, "O_DIRECTORY"):
        return
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _fsync_file(path: Path) -> None:
    with path.open("rb") as handle:
        os.fsync(handle.fileno())


def _write_marker(path: Path, payload: dict) -> None:
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.write-", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        _fsync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def _remove_marker(path: Path) -> None:
    path.unlink(missing_ok=True)
    _fsync_directory(path.parent)


def _validate_database_set(database_paths: list[Path]) -> list[Path]:
    """Validate the same complete input set for dry-run, backup and execution."""
    paths = [Path(path) for path in database_paths]
    if not paths or len({path.name for path in paths}) != len(paths):
        raise ValueError("Database backup filenames must be distinct")
    for path in paths:
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"Database file is missing or unsafe: {path}")
        wal = Path(f"{path}.wal")
        if wal.is_symlink():
            raise ValueError(f"Database WAL must not be a symbolic link: {wal}")
    return paths


def _validate_backup_directory(backup_directory: Path, database_paths: list[Path]) -> Path:
    """Accept only a migration backup beside the first configured database."""
    backup = Path(backup_directory)
    if (
        not re.fullmatch(r"backup_storage_migration_[A-Za-z0-9_-]+", backup.name)
        or backup.is_symlink()
        or not backup.is_dir()
        or backup.resolve().parent != Path(database_paths[0]).resolve().parent
    ):
        raise ValueError("Migration backup directory is outside the expected location")
    return backup


def migration_candidates(database_paths: list[Path], target_storage: str) -> list[Path]:
    """Return validated files that actually require migration."""
    return [
        path for path in _validate_database_set(database_paths)
        if _needs_migration(path, target_storage)
    ]


def backup_database_set(database_paths: list[Path]) -> Path:
    """Snapshot the complete offline set before any swap; never overwrite a backup."""
    database_paths = _validate_database_set(database_paths)
    sources = []
    for path in database_paths:
        for suffix in ("", ".wal"):
            source = Path(f"{path}{suffix}")
            if source.exists():
                sources.append(source)
    parent = database_paths[0].parent
    required = sum(source.stat().st_size for source in sources) + 64 * 1024 * 1024
    if shutil.disk_usage(parent).free < required:
        raise OSError("Insufficient disk space for complete database backup")
    directory = Path(tempfile.mkdtemp(prefix="backup_storage_migration_", dir=parent))
    for source in sources:
        destination = directory / source.name
        shutil.copy2(source, destination)
        _fsync_file(destination)
    _fsync_directory(directory)
    return directory


def _list_user_tables(conn: duckdb.DuckDBPyConnection) -> list[str]:
    rows = conn.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
          AND table_type = 'BASE TABLE'
          AND table_name NOT LIKE 'sqlite_%'
        ORDER BY table_name
        """
    ).fetchall()
    return [str(row[0]) for row in rows]


def _backup_db_files(db_path: Path, stamp: str) -> Path:
    backup_dir = db_path.parent / f"backup_storage_migration_{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    for suffix in ("", ".wal"):
        src = Path(f"{db_path}{suffix}")
        if src.exists():
            dest = backup_dir / src.name
            shutil.copy2(src, dest)
            _fsync_file(dest)
            logger.info("Backed up %s -> %s", src, dest)
    _fsync_directory(backup_dir)
    return backup_dir


def _file_storage_version(db_path: Path) -> str | None:
    """从 duckdb_databases() 读取文件绑定的 storage_version（如 v1.5.0+ / v2.0.0+）。"""
    con = duckdb.connect(str(db_path), read_only=True)
    try:
        rows = con.execute("SELECT * FROM duckdb_databases()").fetchall()
    finally:
        con.close()

    resolved = str(db_path.resolve())
    for row in rows:
        if len(row) < 5:
            continue
        row_path = row[2]
        opts = row[4]
        if not row_path or not isinstance(opts, dict):
            continue
        if str(Path(str(row_path)).resolve()) != resolved:
            continue
        return str(opts.get("storage_version") or "")
    return None


def _needs_migration(db_path: Path, target_storage: str) -> bool:
    if not db_path.exists():
        return False
    sv = _file_storage_version(db_path)
    if target_storage != "latest" and sv and sv.startswith(target_storage):
        logger.info("Storage version %s already matches %s for %s", sv, target_storage, db_path)
        return False
    logger.info("Storage version %s must migrate to %s for %s", sv, target_storage, db_path)
    return True


def _has_migration_space(db_path: Path, *, backup_created: bool = False) -> bool:
    """Require candidate space, plus backup space only before a backup exists."""
    wal_path = Path(f"{db_path}.wal")
    source_bytes = db_path.stat().st_size + (
        wal_path.stat().st_size if wal_path.exists() else 0
    )
    required_bytes = source_bytes * (1 if backup_created else 2) + 64 * 1024 * 1024
    free_bytes = shutil.disk_usage(db_path.parent).free
    if free_bytes < required_bytes:
        logger.error(
            "Insufficient disk space for %s: need %d bytes, have %d bytes",
            db_path,
            required_bytes,
            free_bytes,
        )
        return False
    return True


def _atomic_restore_file(source: Path, destination: Path) -> None:
    """Copy a backup beside its destination, then atomically replace the target."""
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.restore-", dir=destination.parent
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        shutil.copy2(source, temporary)
        _fsync_file(temporary)
        os.replace(temporary, destination)
        _fsync_directory(destination.parent)
    finally:
        temporary.unlink(missing_ok=True)


def _restore_database_pair(db_path: Path, backup_directory: Path) -> None:
    """Restore the exact database/WAL generation captured before migration."""
    backup_db = backup_directory / db_path.name
    if not backup_db.is_file():
        raise FileNotFoundError(f"Migration backup is missing database file: {backup_db}")
    backup_wal = backup_directory / f"{db_path.name}.wal"
    wal_path = Path(f"{db_path}.wal")
    _atomic_restore_file(backup_db, db_path)
    if backup_wal.is_file():
        _atomic_restore_file(backup_wal, wal_path)
    else:
        wal_path.unlink(missing_ok=True)


def prepare_migration_set(
    database_paths: list[Path], backup_directory: Path, target_storage: str
) -> None:
    """Durably record a complete rollback set before the first formal swap."""
    paths = _validate_database_set(database_paths)
    backup_directory = _validate_backup_directory(backup_directory, paths)
    for path in paths:
        backup_db = backup_directory / path.name
        if not backup_db.is_file():
            raise FileNotFoundError(f"Migration backup is missing database file: {backup_db}")
    payload = {
        "backup_directory": str(backup_directory.resolve()),
        "target_storage": target_storage,
        "database_paths": [str(path.resolve()) for path in paths],
        "stage": "prepared",
    }
    for path in paths:
        _write_marker(_marker_path(path), payload)


def clear_migration_markers(database_paths: list[Path]) -> None:
    """Commit a successful set by durably removing all recovery intents."""
    for path in database_paths:
        _remove_marker(_marker_path(Path(path)))


def restore_migration_set(database_paths: list[Path], backup_directory: Path) -> None:
    """Restore every database/WAL pair in a prepared set, leaving markers on failure."""
    paths = [Path(path) for path in database_paths]
    try:
        for path in paths:
            _restore_database_pair(path, backup_directory)
    except Exception as exc:
        raise MigrationRecoveryError(
            f"Database set recovery failed; restore manually from {backup_directory}"
        ) from exc
    clear_migration_markers(paths)


def recover_incomplete_migration_set(database_paths: list[Path]) -> Path | None:
    """Recover a set left between durable prepare and commit after process death."""
    paths = [Path(path) for path in database_paths]
    configured_by_resolved = {str(path.resolve()): path for path in paths}
    marker_paths = [_marker_path(path) for path in paths]
    existing = [path for path in marker_paths if path.is_file()]
    if not existing:
        return None
    try:
        markers = [json.loads(path.read_text(encoding="utf-8")) for path in existing]
        marker = markers[0]
        recorded_values = [str(Path(value).resolve()) for value in marker["database_paths"]]
        if (
            not recorded_values
            or len(set(recorded_values)) != len(recorded_values)
            or not set(recorded_values).issubset(configured_by_resolved)
        ):
            raise ValueError("Migration recovery marker contains an unauthorized database path")
        recorded_paths = [configured_by_resolved[value] for value in recorded_values]
        backup_directory = _validate_backup_directory(
            Path(str(marker["backup_directory"])), recorded_paths
        )
        expected_payload = (
            str(backup_directory.resolve()),
            tuple(recorded_values),
        )
        for candidate in markers[1:]:
            candidate_payload = (
                str(Path(candidate["backup_directory"]).resolve()),
                tuple(str(Path(value).resolve()) for value in candidate["database_paths"]),
            )
            if candidate_payload != expected_payload:
                raise ValueError("Migration recovery markers disagree on the rollback set")
        restore_migration_set(recorded_paths, backup_directory)
        return backup_directory
    except MigrationRecoveryError:
        raise
    except Exception as exc:
        raise MigrationRecoveryError("Migration recovery marker is invalid") from exc


def _swap_database_pair(
    db_path: Path,
    new_path: Path,
    backup_directory: Path,
    *,
    migration_set_prepared: bool = False,
    target_storage: str = DUCKDB_STORAGE_COMPATIBILITY_VERSION,
) -> None:
    """Install a candidate and restore the original pair if WAL cleanup fails."""
    backup_db = backup_directory / db_path.name
    if not backup_db.is_file():
        raise FileNotFoundError(f"Migration backup is missing database file: {backup_db}")
    if not migration_set_prepared:
        prepare_migration_set([db_path], backup_directory, target_storage)
    replaced = False
    try:
        os.replace(new_path, db_path)
        replaced = True
        _fsync_file(db_path)
        _fsync_directory(db_path.parent)
        Path(f"{db_path}.wal").unlink(missing_ok=True)
        _fsync_directory(db_path.parent)
    except Exception as swap_error:
        if replaced:
            try:
                _restore_database_pair(db_path, backup_directory)
            except Exception as restore_error:
                raise MigrationRecoveryError(
                    f"Database pair recovery failed; restore manually from {backup_directory}"
                ) from restore_error
        if not migration_set_prepared:
            clear_migration_markers([db_path])
        raise swap_error
    if not migration_set_prepared:
        clear_migration_markers([db_path])


def migrate_database_file(
    db_path: Path,
    *,
    dry_run: bool = False,
    stamp: str,
    target_storage: str = DUCKDB_STORAGE_COMPATIBILITY_VERSION,
    backup_directory: Path | None = None,
    migration_set_prepared: bool = False,
) -> bool:
    if not db_path.exists():
        logger.info("Skip %s: file does not exist", db_path)
        return True

    if not _needs_migration(db_path, target_storage):
        logger.info("Skip %s: storage already matches target", db_path)
        return True
    if not dry_run and not _has_migration_space(
        db_path, backup_created=backup_directory is not None
    ):
        return False

    old_conn = duckdb.connect(str(db_path), read_only=True)
    try:
        tables = _list_user_tables(old_conn)
    finally:
        old_conn.close()

    logger.info("%s: %d user table(s) to copy: %s", db_path, len(tables), tables)
    if dry_run:
        return True

    new_path = db_path.with_suffix(db_path.suffix + ".migrating")
    if new_path.exists():
        new_path.unlink()

    new_conn = duckdb.connect(
        str(new_path), config={"storage_compatibility_version": target_storage}
    )
    attach_alias = "legacy_src"
    try:
        escaped = escape_string_literal(db_path)
        new_conn.execute(f"ATTACH '{escaped}' AS {attach_alias} (READ_ONLY)")
        logger.info("Copying database schema and data with native COPY FROM DATABASE")
        target_catalog = str(new_conn.execute("SELECT current_database()").fetchone()[0])
        new_conn.execute(
            f"COPY FROM DATABASE {quote_identifier(attach_alias)} "
            f"TO {quote_identifier(target_catalog)}"
        )
        from core.database.migration_validation import verify_migration
        verify_migration(new_conn, attach_alias, target_catalog)
        new_conn.execute(f"DETACH {attach_alias}")
        new_conn.execute("CHECKPOINT")
    except Exception:
        logger.exception("Migration failed for %s", db_path)
        new_conn.close()
        if new_path.exists():
            new_path.unlink()
        return False
    finally:
        try:
            new_conn.close()
        except Exception:
            pass

    migrated_version = _file_storage_version(new_path)
    if (
        target_storage != "latest"
        and (not migrated_version or not migrated_version.startswith(target_storage))
    ):
        logger.error(
            "Migration verification failed for %s: expected %s, got %s",
            db_path,
            target_storage,
            migrated_version,
        )
        new_path.unlink(missing_ok=True)
        return False

    try:
        rollback_backup = backup_directory or _backup_db_files(db_path, stamp)
        _swap_database_pair(
            db_path,
            new_path,
            rollback_backup,
            migration_set_prepared=migration_set_prepared,
            target_storage=target_storage,
        )
    except MigrationRecoveryError:
        raise
    except Exception:
        logger.exception("Atomic migration swap failed for %s", db_path)
        new_path.unlink(missing_ok=True)
        return False
    logger.info("Replaced %s with migrated database (storage %s)", db_path, target_storage)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate DuckDB files to a target storage version")
    parser.add_argument("--dry-run", action="store_true", help="Only list tables / checks")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    parser.add_argument(
        "--target-storage",
        default=DUCKDB_STORAGE_COMPATIBILITY_VERSION,
        help="DuckDB storage compatibility version (DuckQuery 2.0 default: v2.0.0)",
    )
    parser.add_argument(
        "--only",
        choices=("main", "system", "all"),
        default="all",
        help="Which database file to migrate",
    )
    args = parser.parse_args()

    paths = config_manager.get_duckdb_paths(ensure_dirs=False)
    targets: list[tuple[str, Path]] = []
    if args.only in ("main", "all"):
        targets.append(("main", paths.database_path))
    if args.only in ("system", "all"):
        targets.append(("system", paths.system_database_path))

    logger.info("DuckDB paths: main=%s system=%s", paths.database_path, paths.system_database_path)

    if not args.dry_run and not args.yes:
        print(
            f"Will back up and rebuild these files with storage {args.target_storage}. "
            "Stop uvicorn/API first.\n"
            "输入 yes 继续: ",
            end="",
            flush=True,
        )
        if input().strip().lower() != "yes":
            logger.info("Aborted by user")
            return 1

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    all_paths = [path for _, path in targets]
    try:
        recovered = recover_incomplete_migration_set(all_paths)
    except MigrationRecoveryError as exc:
        logger.critical("Previous migration recovery failed: %s", exc)
        return 2
    if recovered is not None:
        logger.warning("Recovered an interrupted migration from %s before retry", recovered)
    try:
        candidates = set(migration_candidates(all_paths, args.target_storage))
    except (OSError, ValueError, duckdb.Error) as exc:
        logger.error("Migration preflight failed: %s", exc)
        return 1
    if not candidates:
        logger.info("All selected database files already use storage %s", args.target_storage)
        return 0
    backup_dir = None
    if not args.dry_run:
        backup_dir = backup_database_set(all_paths)
        logger.info("Complete migration backup: %s", backup_dir)
        prepare_migration_set(all_paths, backup_dir, args.target_storage)
    ok = True
    try:
        for label, db_path in targets:
            if db_path not in candidates:
                logger.info("=== Skipping %s: already at target storage ===", label)
                continue
            logger.info("=== Migrating %s (%s) ===", label, db_path)
            if not migrate_database_file(
                db_path,
                dry_run=args.dry_run,
                stamp=stamp,
                target_storage=args.target_storage,
                backup_directory=backup_dir,
                migration_set_prepared=not args.dry_run,
            ):
                ok = False
                break
    except MigrationRecoveryError:
        logger.exception("Migration stopped after an unrecovered swap failure")
        ok = False

    if not args.dry_run and backup_dir is not None:
        if ok:
            clear_migration_markers(all_paths)
        else:
            try:
                restore_migration_set(all_paths, backup_dir)
                logger.error("Migration failed; restored the complete original database set")
            except MigrationRecoveryError:
                logger.exception(
                    "Automatic set recovery failed; startup will remain blocked by migration markers"
                )
                return 2

    if args.dry_run:
        logger.info("Dry run complete.")
    elif ok:
        logger.info(
            "Migration complete. Restart the API. Backup directory: %s",
            backup_dir,
        )
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
