"""Deterministic native-module destinations for frozen desktop updates."""

from __future__ import annotations

import importlib.machinery
from pathlib import PurePosixPath
import sys


def canonicalize_duckdb_binary(
    entries: list[tuple[str, str, str]],
    *,
    platform: str | None = None,
    extension_suffix: str | None = None,
) -> list[tuple[str, str, str]]:
    """Keep Windows DuckDB at the ABI-tagged path preferred by CPython.

    Old installers shipped that path. Always overwriting it prevents an older
    binary from shadowing a newer wheel's bare ``_duckdb.pyd`` after an update.
    Sources, other modules and non-Windows layouts remain unchanged.
    """
    if (platform or sys.platform) != 'win32':
        return list(entries)
    suffix = extension_suffix or importlib.machinery.EXTENSION_SUFFIXES[0]
    if not suffix.startswith('.cp') or not suffix.endswith('.pyd'):
        raise ValueError('Windows packaging requires an ABI-tagged extension suffix')
    matches = [index for index, (name, _, _) in enumerate(entries)
               if PurePosixPath(name.replace('\\', '/')).name.startswith('_duckdb.')
               and name.endswith('.pyd')]
    if len(matches) != 1:
        raise ValueError('Expected exactly one DuckDB native module in the frozen bundle')
    result = list(entries)
    index = matches[0]
    name, source, kind = result[index]
    result[index] = (str(PurePosixPath(name.replace('\\', '/')).with_name('_duckdb'+suffix)), source, kind)
    return result
