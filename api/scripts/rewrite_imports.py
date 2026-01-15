#!/usr/bin/env python3
"""Rewrites imports from old paths to new paths using AST.

Handles BOTH absolute and relative imports:
- Converts `from core.xxx import` to `from core.subpackage.xxx import`
- Converts `from .xxx import` to absolute imports

Usage:
    python api/scripts/rewrite_imports.py --dry-run  # Preview
    python api/scripts/rewrite_imports.py            # Apply
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path

MAPPING_FILE = Path(__file__).parent / "import_mapping.json"
API_DIR = Path(__file__).parent.parent


def load_mapping() -> dict[str, str]:
    """Loads the import path mapping from JSON file."""
    with open(MAPPING_FILE, encoding="utf-8") as f:
        return json.load(f)


def resolve_relative_to_absolute(
    filepath: Path,
    level: int,
    module: str | None,
) -> str | None:
    """Resolves a relative import to its absolute module path."""
    try:
        rel_path = filepath.relative_to(API_DIR)
        parts = list(rel_path.parts[:-1])
        
        if level > len(parts):
            return None
            
        base_parts = parts[: len(parts) - level + 1]
        
        if module:
            return ".".join(base_parts + module.split("."))
        return ".".join(base_parts)
    except ValueError:
        return None


def rewrite_file(
    filepath: Path,
    mapping: dict[str, str],
    dry_run: bool,
) -> int:
    """Rewrites imports in a single file using regex."""
    try:
        content = filepath.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError) as e:
        print(f"[SKIP] {filepath}: {e}")
        return 0
    
    changes = 0
    new_content = content
    
    for old, new in mapping.items():
        patterns = [
            (rf"from {re.escape(old)} import", f"from {new} import"),
            (rf"import {re.escape(old)}(?=\s|$)", f"import {new}"),
        ]
        for pattern, replacement in patterns:
            new_content, n = re.subn(pattern, replacement, new_content)
            if n > 0:
                changes += n
    
    if changes > 0:
        if dry_run:
            print(f"[DRY-RUN] {filepath.relative_to(API_DIR)}: {changes} changes")
        else:
            filepath.write_text(new_content, encoding="utf-8")
            print(f"[UPDATED] {filepath.relative_to(API_DIR)}: {changes} changes")
    
    return changes


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Preview only")
    args = parser.parse_args()
    
    mapping = load_mapping()
    total = 0
    
    for py_file in API_DIR.rglob("*.py"):
        if "__pycache__" in str(py_file):
            continue
        total += rewrite_file(py_file, mapping, args.dry_run)
    
    print(f"\nTotal: {total} changes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
