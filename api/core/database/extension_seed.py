"""Copy versioned DuckDB extension artifacts into a writable runtime directory."""

from __future__ import annotations

import shutil
from pathlib import Path


def seed_extension_tree(bundled_dir: str | Path, runtime_dir: str | Path) -> int:
    """Copy missing extension artifacts and return the number of seeded files."""
    source = Path(bundled_dir)
    target = Path(runtime_dir)
    if not source.is_dir():
        return 0
    copied = 0
    for extension_file in source.rglob("*.duckdb_extension"):
        destination = target / extension_file.relative_to(source)
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(extension_file, destination)
        copied += 1
    return copied
