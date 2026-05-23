"""
Pytest session setup: isolate DuckDB files from developer machine paths.

Must set env vars before any test module imports `main` (which opens system.db).
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_test_root = Path(tempfile.mkdtemp(prefix="duckquery_pytest_"))
_duck_base = _test_root / "duckdb"
_duck_base.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("DUCKDB_DATA_DIR", str(_duck_base))
os.environ.setdefault("DUCKDB_DATABASE_PATH", str(_duck_base / "main.db"))
