"""
DuckDB WAL 损坏时的隔离与恢复（仅移动 .wal，不删 main.db）
"""

from __future__ import annotations

import logging
import shutil
import time
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


def quarantine_wal_for_database(database_path: Path) -> list[Path]:
    """
    将 database_path 对应的 .wal（及 .wal.backup）移到 *.broken.<ts>。
    返回已移动的文件列表；无文件可移时返回空列表。
    """
    database_path = database_path.resolve()
    moved: list[Path] = []
    ts = int(time.time())

    candidates = [
        Path(f"{database_path}.wal"),
        Path(f"{database_path}.wal.backup"),
    ]
    for wal in candidates:
        if not wal.is_file():
            continue
        dest = wal.with_name(f"{wal.name}.broken.{ts}")
        try:
            shutil.move(str(wal), str(dest))
            moved.append(dest)
            logger.warning("Quarantined DuckDB WAL file: %s -> %s", wal, dest)
        except OSError as exc:
            logger.error("Failed to quarantine WAL %s: %s", wal, exc)

    return moved


def try_recover_database_after_wal_error(
    database_path: Path, error_message: str
) -> bool:
    """若为 WAL 回放错误则隔离 .wal；成功移动至少一个文件时返回 True。"""
    if not is_wal_replay_error(error_message):
        return False
    moved = quarantine_wal_for_database(database_path)
    return len(moved) > 0
