"""Copy versioned DuckDB extension artifacts into a writable runtime directory."""

from __future__ import annotations

import shutil
from filecmp import cmp
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
        info_file = extension_file.with_suffix(".duckdb_extension.info")
        destination_info = destination.with_suffix(".duckdb_extension.info")
        if destination.exists():
            # Restore install metadata only for the exact same signed binary.
            if (
                info_file.is_file()
                and not destination_info.exists()
                and cmp(extension_file, destination, shallow=False)
            ):
                shutil.copy2(info_file, destination_info)
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        if info_file.is_file():
            shutil.copy2(info_file, destination_info)
        shutil.copy2(extension_file, destination)
        copied += 1
    return copied
