"""DuckDB WAL 恢复工具测试"""

from pathlib import Path

from core.database.duckdb_recovery import (
    is_wal_replay_error,
    try_recover_database_after_wal_error,
)


def test_is_wal_replay_error():
    assert is_wal_replay_error("Failure while replaying WAL file")
    assert not is_wal_replay_error("Catalog Error: table not found")


def test_wal_replay_error_preserves_wal_and_fails_closed(tmp_path: Path):
    """Regression 2026-07-28: never reopen a stale snapshot automatically."""
    db = tmp_path / "main.db"
    db.write_text("")
    wal = Path(f"{db}.wal")
    wal.write_text("broken wal")

    recovered = try_recover_database_after_wal_error(
        db, "Failure while replaying WAL file"
    )

    assert recovered is False
    assert wal.read_text() == "broken wal"
    assert list(tmp_path.glob("main.db.wal.broken.*")) == []
