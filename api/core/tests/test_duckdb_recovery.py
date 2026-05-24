"""DuckDB WAL 恢复工具测试"""

from pathlib import Path

from core.database.duckdb_recovery import (
    is_wal_replay_error,
    quarantine_wal_for_database,
)


def test_is_wal_replay_error():
    assert is_wal_replay_error("Failure while replaying WAL file")
    assert not is_wal_replay_error("Catalog Error: table not found")


def test_quarantine_wal_for_database(tmp_path: Path):
    db = tmp_path / "main.db"
    db.write_text("")
    wal = Path(f"{db}.wal")
    wal.write_text("broken wal")
    moved = quarantine_wal_for_database(db)
    assert len(moved) == 1
    assert not wal.exists()
    assert moved[0].name.startswith("main.db.wal.broken.")
