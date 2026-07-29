"""DuckDB WAL replay error detection."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

WAL_REPLAY_MARKERS = (
    "Failure while replaying WAL",
    "replaying WAL file",
    "GetDefaultDatabase with no default database set",
)


def is_wal_replay_error(message: str) -> bool:
    text = message or ""
    return any(marker in text for marker in WAL_REPLAY_MARKERS)


def try_recover_database_after_wal_error(
    database_path: Path, error_message: str
) -> bool:
    """Report WAL replay failure without mutating recovery files.

    Automatic quarantine used to reopen the last checkpoint and silently hide
    every committed change that existed only in the WAL. Recovery now fails
    closed so the original connection error reaches the caller and the WAL
    remains available for explicit repair.
    """
    if not is_wal_replay_error(error_message):
        return False
    logger.error(
        "DuckDB WAL replay failed for %s; preserving WAL and aborting recovery",
        database_path,
    )
    return False
