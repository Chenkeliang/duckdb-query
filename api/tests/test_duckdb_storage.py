"""DuckQuery 2.0 storage connection and format assertions."""

import tempfile
from pathlib import Path

import pytest

duckdb = pytest.importorskip("duckdb")

from core.database.duckdb_storage import (
    DUCKDB_STORAGE_COMPATIBILITY_VERSION,
    connect_duckdb_database,
    duckdb_connect_config,
)


def test_connect_config_pins_duckquery_v2_storage():
    assert duckdb_connect_config() == {
        "storage_compatibility_version": DUCKDB_STORAGE_COMPATIBILITY_VERSION
    }
    assert DUCKDB_STORAGE_COMPATIBILITY_VERSION == "v2.0.0"


def test_new_database_supports_variant_table():
    major, minor, *_ = (int(x) for x in duckdb.__version__.split(".")[:3])
    if (major, minor) < (1, 5):
        pytest.skip(f"requires duckdb>=1.5.3, have {duckdb.__version__}")

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "v2.db"
        con = connect_duckdb_database(str(db_path))
        try:
            con.execute("CREATE TABLE t (payload VARIANT)")
            con.execute("INSERT INTO t VALUES ('{\"a\":1}'::VARIANT)")
            assert con.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 1
            rows = con.execute("SELECT * FROM duckdb_databases()").fetchall()
            storage_versions = [
                row[4].get("storage_version")
                for row in rows
                if len(row) >= 5 and isinstance(row[4], dict) and row[2]
            ]
            assert any(str(sv).startswith("v2.0.0") for sv in storage_versions)
        finally:
            con.close()


def test_opening_legacy_storage_does_not_silently_migrate_it():
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "legacy.db"
        legacy = duckdb.connect(
            str(db_path), config={"storage_compatibility_version": "v1.5.0"}
        )
        legacy.execute("CREATE TABLE t AS SELECT 1 AS value")
        legacy.close()

        current = connect_duckdb_database(str(db_path))
        current.execute("INSERT INTO t VALUES (2)")
        current.execute("CHECKPOINT")
        current.close()

        verify = duckdb.connect(str(db_path), read_only=True)
        try:
            tags = verify.execute(
                "SELECT tags FROM duckdb_databases() "
                "WHERE database_name=current_database()"
            ).fetchone()[0]
            assert str(tags["storage_version"]).startswith("v1.5.0")
            assert verify.execute("SELECT sum(value) FROM t").fetchone() == (3,)
        finally:
            verify.close()
