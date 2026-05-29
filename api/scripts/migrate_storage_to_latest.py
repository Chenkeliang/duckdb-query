#!/usr/bin/env python3
"""
将 main.db / system.db 迁移到 storage_compatibility_version=latest（支持 VARIANT 等 v1.5+）。

适用：表不多、数据量不大（脚本逐表 CREATE TABLE AS SELECT）。

用法（先停止 API 服务，避免文件锁）:
    cd api
    python scripts/migrate_storage_to_latest.py --dry-run
    python scripts/migrate_storage_to_latest.py

可选:
    --only main|system   只迁移指定库
    --yes                跳过确认
"""

from __future__ import annotations

import argparse
import logging
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import duckdb

from core.common.config_manager import config_manager
from core.database.duckdb_storage import connect_duckdb_database

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


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
    """从 duckdb_databases() 读取文件绑定的 storage_version（如 v1.0.0+ / v1.5.0+）。"""
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


def _storage_supports_variant(storage_version: str | None) -> bool:
    if not storage_version:
        return False
    return storage_version.startswith("v1.5")


def _needs_migration(db_path: Path) -> bool:
    if not db_path.exists():
        return False
    sv = _file_storage_version(db_path)
    if _storage_supports_variant(sv):
        logger.info("Storage version %s — no migration needed for %s", sv, db_path)
        return False
    logger.info("Storage version %s — migration required for %s", sv, db_path)
    return True


def migrate_database_file(
    db_path: Path,
    *,
    dry_run: bool = False,
    stamp: str,
) -> bool:
    if not db_path.exists():
        logger.info("Skip %s: file does not exist", db_path)
        return True

    if not _needs_migration(db_path):
        logger.info("Skip %s: already supports VARIANT / latest storage", db_path)
        return True

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

    new_conn = connect_duckdb_database(str(new_path))
    attach_alias = "legacy_src"
    try:
        if tables:
            escaped = str(db_path).replace("'", "''")
            new_conn.execute(f"ATTACH '{escaped}' AS {attach_alias} (READ_ONLY)")
            for table in tables:
                logger.info("Copying table %s ...", table)
                new_conn.execute(
                    f'CREATE TABLE "{table}" AS SELECT * FROM {attach_alias}."{table}"'
                )
            new_conn.execute(f"DETACH {attach_alias}")
        else:
            logger.info("No user tables; creating empty database with latest storage")
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

    _backup_db_files(db_path, stamp)
    for suffix in ("", ".wal"):
        live = Path(f"{db_path}{suffix}")
        if live.exists():
            live.unlink()

    shutil.move(str(new_path), str(db_path))
    logger.info("Replaced %s with migrated database (storage latest)", db_path)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate DuckDB files to storage latest")
    parser.add_argument("--dry-run", action="store_true", help="Only list tables / checks")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
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
            "将备份并重建上述 .db 文件（storage latest）。请先停止 uvicorn/API。\n"
            "输入 yes 继续: ",
            end="",
            flush=True,
        )
        if input().strip().lower() != "yes":
            logger.info("Aborted by user")
            return 1

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ok = True
    for label, db_path in targets:
        logger.info("=== Migrating %s (%s) ===", label, db_path)
        if not migrate_database_file(db_path, dry_run=args.dry_run, stamp=stamp):
            ok = False

    if args.dry_run:
        logger.info("Dry run complete.")
    elif ok:
        logger.info(
            "Migration complete. Restart the API. Backups under data/duckdb/backup_storage_migration_%s/",
            stamp,
        )
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
