"""Storage migration preserves schema objects and data (regression 2026-09-04)."""

from pathlib import Path
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

    monkeypatch.setattr(storage_migration, "_has_migration_space", lambda _path: False)
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
