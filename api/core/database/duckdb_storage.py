"""DuckDB file connections pinned to the DuckQuery major-version format."""

from __future__ import annotations

import logging
from typing import Any, Dict

import duckdb

logger = logging.getLogger(__name__)

# Pin the major format explicitly: a future DuckDB 2.1 dependency update must not
# silently rewrite newly created files to another storage generation.
DUCKDB_STORAGE_COMPATIBILITY_VERSION = "v2.0.0"


def duckdb_connect_config() -> Dict[str, str]:
    return {"storage_compatibility_version": DUCKDB_STORAGE_COMPATIBILITY_VERSION}


def connect_duckdb_database(
    db_path: str,
    *,
    read_only: bool = False,
) -> duckdb.DuckDBPyConnection:
    """Open a persistent DuckDB file; new files use the v2.0.0 storage format."""
    kwargs: Dict[str, Any] = {
        "database": db_path,
        "config": duckdb_connect_config(),
    }
    if read_only:
        kwargs["read_only"] = True
    return duckdb.connect(**kwargs)
