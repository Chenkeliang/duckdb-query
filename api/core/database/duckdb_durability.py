"""Durability helpers for the local DuckDB database."""

from __future__ import annotations

from pathlib import Path
from typing import Any


def checkpoint_database_if_needed(connection: Any, database_path: Path) -> bool:
    """Checkpoint committed changes when the database has a non-empty WAL."""
    wal_path = Path(f"{database_path}.wal")
    try:
        if wal_path.stat().st_size == 0:
            return False
    except FileNotFoundError:
        return False

    connection.execute("CHECKPOINT")
    return True
