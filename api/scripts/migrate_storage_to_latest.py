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
import logging
import os
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


def backup_database_set(database_paths: list[Path]) -> Path:
    """Snapshot the complete offline set before any swap; never overwrite a backup."""
    if not database_paths or len({path.name for path in database_paths}) != len(database_paths):
        raise ValueError("Database backup filenames must be distinct")
    sources = []
    for path in database_paths:
        if not path.is_file() or path.is_symlink():
            raise ValueError("All database files must exist before migration")
        for suffix in ("", ".wal"):
            source = Path(f"{path}{suffix}")
            if source.is_symlink():
                raise ValueError("Database backup sources must not be symbolic links")
            if source.exists():
                sources.append(source)
    parent = database_paths[0].parent
    required = sum(source.stat().st_size for source in sources) + 64 * 1024 * 1024
    if shutil.disk_usage(parent).free < required:
        raise OSError("Insufficient disk space for complete database backup")
    directory = Path(tempfile.mkdtemp(prefix="backup_storage_migration_", dir=parent))
    for source in sources:
        shutil.copy2(source, directory / source.name)
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
            logger.info("Backed up %s -> %s", src, dest)
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


def _has_migration_space(db_path: Path) -> bool:
    """Require room for both the migrating file and the rollback backup."""
    wal_path = Path(f"{db_path}.wal")
    source_bytes = db_path.stat().st_size + (
        wal_path.stat().st_size if wal_path.exists() else 0
    )
    required_bytes = source_bytes * 2 + 64 * 1024 * 1024
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


def migrate_database_file(
    db_path: Path,
    *,
    dry_run: bool = False,
    stamp: str,
    target_storage: str = DUCKDB_STORAGE_COMPATIBILITY_VERSION,
    backup_created: bool = False,
) -> bool:
    if not db_path.exists():
        logger.info("Skip %s: file does not exist", db_path)
        return True

    if not _needs_migration(db_path, target_storage):
        logger.info("Skip %s: storage already matches target", db_path)
        return True
    if not dry_run and not _has_migration_space(db_path):
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
        if not backup_created:
            _backup_db_files(db_path, stamp)
        os.replace(new_path, db_path)
        wal_path = Path(f"{db_path}.wal")
        if wal_path.exists():
            wal_path.unlink()
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
    if not args.dry_run:
        backup_dir = backup_database_set([path for _, path in targets])
        logger.info("Complete migration backup: %s", backup_dir)
    ok = True
    for label, db_path in targets:
        logger.info("=== Migrating %s (%s) ===", label, db_path)
        if not migrate_database_file(
            db_path,
            dry_run=args.dry_run,
            stamp=stamp,
            target_storage=args.target_storage,
            backup_created=not args.dry_run,
        ):
            ok = False
            break

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
