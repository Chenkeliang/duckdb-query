"""DuckDB durability regression tests."""

from __future__ import annotations

import importlib
from pathlib import Path

import duckdb


def test_checkpoint_database_if_needed_compacts_pending_wal(tmp_path: Path):
    """Regression 2026-07-28: committed tables must not remain WAL-only."""
    database_path = tmp_path / "main.db"
    connection = duckdb.connect(str(database_path))
    wal_path = Path(f"{database_path}.wal")
    try:
        connection.execute(
            "CREATE TABLE imported AS "
            "SELECT range AS id, repeat('x', 200) AS payload FROM range(3940)"
        )
        assert wal_path.stat().st_size > 0

        durability = importlib.import_module("core.database.duckdb_durability")
        assert durability.checkpoint_database_if_needed(
            connection, database_path
        ) is True
        assert not wal_path.exists() or wal_path.stat().st_size == 0
    finally:
        connection.close()

    reopened = duckdb.connect(str(database_path), read_only=True)
    try:
        assert reopened.execute("SELECT count(*) FROM imported").fetchone() == (3940,)
    finally:
        reopened.close()


def test_checkpoint_database_if_needed_skips_database_without_wal(tmp_path: Path):
    durability = importlib.import_module("core.database.duckdb_durability")

    class _UnexpectedConnection:
        def execute(self, _sql):
            raise AssertionError("CHECKPOINT must not run without a pending WAL")

    assert durability.checkpoint_database_if_needed(
        _UnexpectedConnection(), tmp_path / "missing.db"
    ) is False
