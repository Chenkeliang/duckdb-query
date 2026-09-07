"""Storage migration preserves schema objects and data (regression 2026-09-04)."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import pytest

import duckdb

import scripts.migrate_storage_to_latest as storage_migration
from scripts.migrate_storage_to_latest import migrate_database_file
from core.database.migration_validation import verify_migration


def test_manifest_rejects_missing_rows_and_objects(tmp_path):
    """Regression 2026-09-07: correct storage version alone cannot prove a safe copy."""
    con = duckdb.connect(str(tmp_path / "candidate.db"))
    try:
        con.execute("ATTACH ':memory:' AS src")
        con.execute("CREATE TABLE src.items AS SELECT 1 AS id")
        con.execute("CREATE TABLE items AS SELECT 1 AS id WHERE false")
        candidate = con.execute("SELECT current_database()").fetchone()[0]
        with pytest.raises(ValueError, match="row_counts"):
            verify_migration(con, "src", candidate)
        con.execute("INSERT INTO items VALUES (1)")
        verify_migration(con, "src", candidate)
        con.execute("CREATE MACRO src.double_it(x) AS x*2")
        with pytest.raises(ValueError, match="functions"):
            verify_migration(con, "src", candidate)
    finally:
        con.close()


def test_native_database_copy_preserves_schema_objects(tmp_path: Path):
    source = tmp_path / "legacy.db"
    con = duckdb.connect(
        str(source), config={"storage_compatibility_version": "v1.4.0"}
    )
    con.execute("CREATE SEQUENCE item_seq START 10")
    con.execute(
        "CREATE TABLE items("
        "id BIGINT PRIMARY KEY DEFAULT nextval('item_seq'), "
        "amount INTEGER CHECK (amount > 0))"
    )
    con.execute("CREATE INDEX items_amount_idx ON items(amount)")
    con.execute("INSERT INTO items(amount) VALUES (2), (3)")
    con.execute("CREATE VIEW positive_items AS SELECT * FROM items WHERE amount > 0")
    con.execute("CREATE MACRO add_one(value) AS value + 1")
    con.close()

    assert migrate_database_file(
        source,
        stamp="test",
        target_storage="v2.0.0",
    )
    assert storage_migration._file_storage_version(source).startswith("v2.0.0")

    migrated = duckdb.connect(str(source))
    try:
        assert migrated.execute("SELECT * FROM positive_items ORDER BY id").fetchall() == [
            (10, 2),
            (11, 3),
        ]
        assert migrated.execute("SELECT add_one(4)").fetchone() == (5,)
        assert migrated.execute("INSERT INTO items(amount) VALUES (4) RETURNING id").fetchone() == (12,)
        assert migrated.execute(
            "SELECT count(*) FROM duckdb_indexes() WHERE index_name='items_amount_idx'"
        ).fetchone() == (1,)
        try:
            migrated.execute("INSERT INTO items(amount) VALUES (0)")
        except duckdb.ConstraintException:
            pass
        else:
            raise AssertionError("CHECK constraint was not preserved")
    finally:
        migrated.close()

    assert (tmp_path / "backup_storage_migration_test" / "legacy.db").exists()


def test_native_database_copy_preserves_macro_without_tables(tmp_path: Path):
    quoted_dir = tmp_path / "quote's"
    quoted_dir.mkdir()
    source = quoted_dir / "macro_only.db"
    con = duckdb.connect(
        str(source), config={"storage_compatibility_version": "v1.4.0"}
    )
    con.execute("CREATE MACRO double_value(value) AS value * 2")
    con.close()

    assert migrate_database_file(
        source,
        stamp="macro",
        target_storage="v2.0.0",
    )
    migrated = duckdb.connect(str(source))
    try:
        assert migrated.execute("SELECT double_value(6)").fetchone() == (12,)
    finally:
        migrated.close()


def test_low_disk_failure_leaves_source_untouched(tmp_path: Path, monkeypatch):
    source = tmp_path / "low_space.db"
    con = duckdb.connect(
        str(source), config={"storage_compatibility_version": "v1.4.0"}
    )
    con.execute("CREATE TABLE original AS SELECT 42 AS value")
    con.close()

    monkeypatch.setattr(
        storage_migration, "_has_migration_space", lambda _path, **_kwargs: False
    )
    assert not migrate_database_file(
        source,
        stamp="low-space",
        target_storage="v2.0.0",
    )

    original = duckdb.connect(str(source), read_only=True)
    try:
        assert original.execute("SELECT value FROM original").fetchone() == (42,)
    finally:
        original.close()
    assert not source.with_suffix(".db.migrating").exists()


def test_backup_failure_leaves_source_and_removes_candidate(tmp_path: Path, monkeypatch):
    source = tmp_path / "backup_failure.db"
    con = duckdb.connect(
        str(source), config={"storage_compatibility_version": "v1.4.0"}
    )
    con.execute("CREATE TABLE original AS SELECT 7 AS value")
    con.close()

    def fail_backup(_path, _stamp):
        raise OSError("simulated backup failure")

    monkeypatch.setattr(storage_migration, "_backup_db_files", fail_backup)
    assert not migrate_database_file(
        source,
        stamp="backup-failure",
        target_storage="v2.0.0",
    )
    original = duckdb.connect(str(source), read_only=True)
    try:
        assert original.execute("SELECT value FROM original").fetchone() == (7,)
    finally:
        original.close()
    assert not source.with_suffix(".db.migrating").exists()


def test_wal_cleanup_failure_restores_original_database_pair(tmp_path: Path, monkeypatch):
    """2026-09-07: a post-swap WAL failure cannot leave a mixed-generation pair."""
    source = tmp_path / "main.db"
    candidate = tmp_path / "main.db.migrating"
    backup = tmp_path / "backup_storage_migration_test"
    backup.mkdir()
    source.write_bytes(b"old-db")
    Path(f"{source}.wal").write_bytes(b"old-wal")
    (backup / source.name).write_bytes(b"old-db")
    (backup / f"{source.name}.wal").write_bytes(b"old-wal")
    candidate.write_bytes(b"new-db")
    original_unlink = Path.unlink
    failed = False

    def fail_first_wal_unlink(path, *args, **kwargs):
        nonlocal failed
        if path == Path(f"{source}.wal") and not failed:
            failed = True
            raise OSError("simulated WAL cleanup failure")
        return original_unlink(path, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", fail_first_wal_unlink)
    with pytest.raises(OSError, match="WAL cleanup"):
        storage_migration._swap_database_pair(source, candidate, backup)
    assert source.read_bytes() == b"old-db"
    assert Path(f"{source}.wal").read_bytes() == b"old-wal"
    assert not candidate.exists()


def test_swap_refuses_missing_backup_before_replacing_database(tmp_path: Path):
    """2026-09-07: rollback evidence must exist before the formal path changes."""
    source = tmp_path / "main.db"
    candidate = tmp_path / "main.db.migrating"
    backup = tmp_path / "empty-backup"
    backup.mkdir()
    source.write_bytes(b"old-db")
    candidate.write_bytes(b"new-db")
    with pytest.raises(FileNotFoundError, match="missing database file"):
        storage_migration._swap_database_pair(source, candidate, backup)
    assert source.read_bytes() == b"old-db"
    assert candidate.read_bytes() == b"new-db"


def test_durable_marker_recovers_a_hard_crash_between_db_and_wal(tmp_path: Path):
    """2026-09-07: startup rollback covers process death after the DB replace."""
    source = tmp_path / "main.db"
    backup = tmp_path / "backup_storage_migration_crash"
    backup.mkdir()
    source.write_bytes(b"old-db")
    Path(f"{source}.wal").write_bytes(b"old-wal")
    (backup / source.name).write_bytes(b"old-db")
    (backup / f"{source.name}.wal").write_bytes(b"old-wal")
    storage_migration.prepare_migration_set([source], backup, "v2.0.0")
    source.write_bytes(b"new-db")  # exact hard-crash state: marker + new DB + old WAL

    recovered = storage_migration.recover_incomplete_migration_set([source])
    assert recovered == backup
    assert source.read_bytes() == b"old-db"
    assert Path(f"{source}.wal").read_bytes() == b"old-wal"
    assert not storage_migration._marker_path(source).exists()


def test_app_full_set_recovers_cli_only_marker(tmp_path: Path):
    """2026-09-07: a --only main marker is a safe subset of app main+system."""
    main = tmp_path / "main.db"
    system = tmp_path / "system.db"
    backup = tmp_path / "backup_storage_migration_only_main"
    backup.mkdir()
    main.write_bytes(b"old-main")
    system.write_bytes(b"system")
    (backup / main.name).write_bytes(b"old-main")
    storage_migration.prepare_migration_set([main], backup, "v2.0.0")
    main.write_bytes(b"new-main")

    assert storage_migration.recover_incomplete_migration_set([main, system]) == backup
    assert main.read_bytes() == b"old-main"
    assert system.read_bytes() == b"system"
    assert not storage_migration._marker_path(main).exists()


def test_cli_recovers_previous_marker_before_candidate_inspection(tmp_path: Path, monkeypatch):
    """2026-09-07: rerunning CLI cannot inspect or back up a mixed pair first."""
    paths = SimpleNamespace(
        database_path=tmp_path / "main.db",
        system_database_path=tmp_path / "system.db",
    )
    backup = tmp_path / "backup_storage_migration_cli_crash"
    backup.mkdir()
    for path in (paths.database_path, paths.system_database_path):
        path.write_bytes(f"old-{path.stem}".encode())
        (backup / path.name).write_bytes(path.read_bytes())
    storage_migration.prepare_migration_set(
        [paths.database_path, paths.system_database_path], backup, "v2.0.0"
    )
    paths.database_path.write_bytes(b"new-main")
    monkeypatch.setattr(storage_migration.config_manager, "get_duckdb_paths", lambda ensure_dirs=False: paths)
    monkeypatch.setattr(storage_migration.sys, "argv", ["migrate", "--yes"])
    with patch.object(storage_migration, "migration_candidates", return_value=[]) as candidates:
        assert storage_migration.main() == 0
    candidates.assert_called_once()
    assert paths.database_path.read_bytes() == b"old-main"
    assert not storage_migration._marker_path(paths.database_path).exists()


def test_completed_backup_is_not_counted_twice_in_space_budget(tmp_path: Path, monkeypatch):
    """2026-09-07: after backup, only candidate space plus margin remains required."""
    source = tmp_path / "main.db"
    source.write_bytes(b"0123456789")
    free = 64 * 1024 * 1024 + 15
    monkeypatch.setattr(storage_migration.shutil, "disk_usage", lambda _path: SimpleNamespace(free=free))
    assert storage_migration._has_migration_space(source, backup_created=True)
    assert not storage_migration._has_migration_space(source, backup_created=False)


@pytest.mark.parametrize("dry_run", [True, False])
def test_cli_missing_database_fails_the_same_preflight(tmp_path: Path, monkeypatch, dry_run):
    """2026-09-07: dry-run and execution share the complete-set existence rule."""
    paths = SimpleNamespace(
        database_path=tmp_path / "main.db",
        system_database_path=tmp_path / "missing-system.db",
    )
    paths.database_path.write_bytes(b"placeholder")
    monkeypatch.setattr(storage_migration.config_manager, "get_duckdb_paths", lambda ensure_dirs=False: paths)
    argv = ["migrate", "--yes"] + (["--dry-run"] if dry_run else [])
    monkeypatch.setattr(storage_migration.sys, "argv", argv)
    assert storage_migration.main() == 1
    assert not list(tmp_path.glob("backup_storage_migration_*"))


def test_cli_noop_does_not_create_backup(tmp_path: Path, monkeypatch):
    """2026-09-07: a fully migrated set exits before copying a backup."""
    paths = SimpleNamespace(
        database_path=tmp_path / "main.db",
        system_database_path=tmp_path / "system.db",
    )
    for path in (paths.database_path, paths.system_database_path):
        with duckdb.connect(str(path), config={"storage_compatibility_version": "v2.0.0"}) as con:
            con.execute("CREATE TABLE t AS SELECT 1 AS n")
    monkeypatch.setattr(storage_migration.config_manager, "get_duckdb_paths", lambda ensure_dirs=False: paths)
    monkeypatch.setattr(storage_migration.sys, "argv", ["migrate", "--yes"])
    with patch.object(storage_migration, "backup_database_set") as backup:
        assert storage_migration.main() == 0
    backup.assert_not_called()
