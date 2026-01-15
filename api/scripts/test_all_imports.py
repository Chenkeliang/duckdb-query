#!/usr/bin/env python3
"""Tests all .py files can be imported without errors.

Some modules with external dependencies or side effects are skipped.
Skip list can be extended via SKIP_MODULES environment variable.

Usage:
    python api/scripts/test_all_imports.py
    
    # Add extra modules to skip:
    SKIP_MODULES="core/database/database_manager.py" python api/scripts/test_all_imports.py
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

API_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(API_DIR))

SKIP_PATTERNS = [
    "test_",
    "conftest",
    "__pycache__",
]

DEFAULT_SKIP_MODULES: list[str] = []


def get_skip_modules() -> set[str]:
    """Returns the combined skip modules from default and environment variable."""
    modules = set(DEFAULT_SKIP_MODULES)
    
    env_skips = os.getenv("SKIP_MODULES", "")
    if env_skips:
        modules.update(m.strip() for m in env_skips.split(",") if m.strip())
    
    return modules


def should_skip(filepath: Path, skip_modules: set[str]) -> bool:
    """Determines if a file should be skipped."""
    path_str = str(filepath)
    
    for pattern in SKIP_PATTERNS:
        if pattern in path_str:
            return True
    
    rel_path = str(filepath.relative_to(API_DIR))
    return rel_path in skip_modules


def main() -> int:
    """Main entry point."""
    errors: list[str] = []
    skipped = 0
    tested = 0
    skip_modules = get_skip_modules()
    
    if skip_modules:
        print(f"Skip modules: {', '.join(skip_modules)}")
    
    for py_file in API_DIR.rglob("*.py"):
        if should_skip(py_file, skip_modules):
            skipped += 1
            continue
        
        try:
            spec = importlib.util.spec_from_file_location("mod", py_file)
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
            tested += 1
        except Exception as e:
            errors.append(f"{py_file.relative_to(API_DIR)}: {type(e).__name__}: {e}")
    
    print(f"Tested: {tested}, Skipped: {skipped}")
    
    if errors:
        print(f"\n❌ Import errors ({len(errors)}):")
        for err in errors:
            print(f"  - {err}")
        return 1
    
    print("✅ All imports successful")
    return 0


if __name__ == "__main__":
    sys.exit(main())
