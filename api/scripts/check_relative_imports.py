#!/usr/bin/env python3
"""Detects and reports any relative imports in api/ modules.

This is a standalone check to enforce absolute imports per Google Style Guide.

Usage:
    python api/scripts/check_relative_imports.py
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

API_DIR = Path(__file__).parent.parent


def check_file(filepath: Path) -> list[str]:
    """Checks a file for relative imports."""
    violations: list[str] = []
    
    try:
        content = filepath.read_text(encoding="utf-8")
        tree = ast.parse(content)
    except (SyntaxError, UnicodeDecodeError):
        return []
    
    lines = content.splitlines()
    
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.level > 0:
            line = lines[node.lineno - 1].strip() if node.lineno <= len(lines) else ""
            violations.append(
                f"{filepath.relative_to(API_DIR)}:{node.lineno}: "
                f"Relative import found: '{line}'"
            )
    
    return violations


def main() -> int:
    """Main entry point."""
    all_violations: list[str] = []
    
    for py_file in API_DIR.rglob("*.py"):
        if "__pycache__" in str(py_file):
            continue
        all_violations.extend(check_file(py_file))
    
    if all_violations:
        print("❌ Relative imports found (violates Google Style Guide):")
        for v in all_violations:
            print(f"  - {v}")
        print(f"\nTotal: {len(all_violations)} violations")
        print("Fix: Convert to absolute imports, e.g., 'from core.xxx import'")
        return 1
    
    print("✅ No relative imports found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
