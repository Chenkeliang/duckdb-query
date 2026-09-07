"""Shared user-database RAM, spill and admission budgets."""
from pathlib import Path
import re
import shutil
import psutil
from core.common.exceptions import BaseAPIException


def memory_capacity_bytes() -> int:
    """Use physical RAM constrained by standard cgroup v1/v2 memory ceilings."""
    capacity = int(psutil.virtual_memory().total)
    for path in ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"):
        try:
            value = int(Path(path).read_text(encoding="ascii").strip())
            if value > 0:
                capacity = min(capacity, value)
        except (OSError, ValueError):
            continue
    return capacity


def parse_size(value: str, capacity: int) -> int:
    """Parse finite byte sizes and percentages without accepting SQL fragments."""
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|KIB|MIB|GIB|TIB|%)?", str(value).strip().upper())
    if not match:
        raise ValueError("Resource size must be a positive byte size or percentage")
    units = {"B": 1, "KB": 1000, "MB": 1000**2, "GB": 1000**3, "TB": 1000**4,
             "KIB": 1024, "MIB": 1024**2, "GIB": 1024**3, "TIB": 1024**4, "%": capacity / 100}
    size = int(float(match.group(1)) * units[match.group(2) or "B"])
    if size <= 0:
        raise ValueError("Resource size must be positive")
    return size


def get_resource_budget(config) -> dict:
    """Leave at least 25 percent RAM outside the DuckDB buffer budget."""
    capacity = memory_capacity_bytes()
    return {
        "memory_capacity_bytes": capacity,
        "memory_limit_bytes": min(parse_size(config.duckdb_memory_limit, capacity), int(capacity * 0.75)),
        "temp_limit_bytes": parse_size(getattr(config, "duckdb_max_temp_directory_size", "4GB"), capacity),
        "max_connections": max(1, min(int(config.pool_max_connections), int(getattr(config, "max_concurrent_queries", 4)))),
        "min_free_disk_bytes": max(0, int(getattr(config, "min_free_disk_bytes", 256 * 1024 * 1024))),
    }


def apply_resource_budget(connection, config) -> None:
    """Apply budgets after normal or fallback engine setup."""
    budget = get_resource_budget(config)
    connection.execute(f"SET memory_limit='{budget['memory_limit_bytes']}B'")
    connection.execute(f"SET max_temp_directory_size='{budget['temp_limit_bytes']}B'")


def ensure_disk_reserve(paths, reserve: int) -> None:
    """Reject new user work if either database or spill filesystem lacks reserve."""
    for path in (Path(paths.database_path).parent, Path(paths.temp_dir)):
        while not path.exists() and path != path.parent:
            path = path.parent
        if shutil.disk_usage(path).free < reserve:
            raise BaseAPIException("Insufficient free disk space for a new query", 507,
                                   "INSUFFICIENT_DISK_SPACE", {"required_free_bytes": reserve})
