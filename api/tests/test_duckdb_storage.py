"""DuckDB storage latest 连接与迁移探测。"""

import tempfile
from pathlib import Path

import pytest

duckdb = pytest.importorskip("duckdb")

from core.database.duckdb_storage import (
    DUCKDB_STORAGE_COMPATIBILITY_VERSION,
    connect_duckdb_database,
    duckdb_connect_config,
)


def test_connect_config_uses_latest():
    assert duckdb_connect_config() == {
        "storage_compatibility_version": DUCKDB_STORAGE_COMPATIBILITY_VERSION
    }
    assert DUCKDB_STORAGE_COMPATIBILITY_VERSION == "latest"


def test_new_database_supports_variant_table():
    major, minor, *_ = (int(x) for x in duckdb.__version__.split(".")[:3])
    if (major, minor) < (1, 5):
        pytest.skip(f"requires duckdb>=1.5.3, have {duckdb.__version__}")

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "latest.db"
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
            assert any(str(sv).startswith("v1.5") for sv in storage_versions)
        finally:
            con.close()
