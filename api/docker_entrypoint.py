"""Seed immutable image extensions into the writable volume, then start the API."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from core.database.extension_seed import seed_extension_tree
from core.database.storage_upgrade import process_pending_storage_upgrade


def main() -> None:
    runtime_dir = Path(
        os.environ.get("DUCKDB_EXTENSION_DIRECTORY", "/app/data/duckdb/extensions")
    )
    runtime_dir.mkdir(parents=True, exist_ok=True)
    seed_extension_tree("/opt/duckquery/extensions", runtime_dir)
    process_pending_storage_upgrade()
    command = sys.argv[1:] or [
        "uvicorn",
        "main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
    ]
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
