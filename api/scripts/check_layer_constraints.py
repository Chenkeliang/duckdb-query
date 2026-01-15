#!/usr/bin/env python3
"""Detects layer constraint violations in imports.

Supports both absolute and relative imports by resolving them to
absolute module paths before checking against the blacklist.

Usage:
    python api/scripts/check_layer_constraints.py
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

API_DIR = Path(__file__).parent.parent
CORE_DIR = API_DIR / "core"

LAYER_BLACKLIST: dict[str, list[str]] = {
    "foundation": [
        "core.common", "core.database", "core.security",
        "core.data", "core.services",
    ],
    "common": ["core.database", "core.security", "core.data", "core.services"],
    # L2 layers (database, security, data) can inter-depend, only prohibit services
    "database": ["core.services"],
    "security": ["core.services"],
    "data": ["core.services"],
}


def resolve_relative_import(filepath: Path, node: ast.ImportFrom) -> str:
    """Resolves a relative import to its absolute module path."""
    if node.level == 0:
        return node.module or ""
    
    try:
        rel_path = filepath.relative_to(API_DIR)
        parts = list(rel_path.parts[:-1])
        
        if node.level > len(parts):
            return ""
        
        base_parts = parts[: len(parts) - node.level + 1]
        
        if node.module:
            return ".".join(base_parts + node.module.split("."))
        return ".".join(base_parts)
    except ValueError:
        return ""


def get_imports(filepath: Path) -> list[tuple[str, int, str]]:
    """Extracts all imports from a file."""
    try:
        content = filepath.read_text(encoding="utf-8")
        tree = ast.parse(content)
    except (SyntaxError, UnicodeDecodeError):
        return []
    
    imports: list[tuple[str, int, str]] = []
    lines = content.splitlines()
    
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                line = lines[node.lineno - 1] if node.lineno <= len(lines) else ""
                imports.append((alias.name, node.lineno, line.strip()))
        elif isinstance(node, ast.ImportFrom):
            resolved = resolve_relative_import(filepath, node)
            if resolved:
                line = lines[node.lineno - 1] if node.lineno <= len(lines) else ""
                imports.append((resolved, node.lineno, line.strip()))
    
    return imports


def check_file(filepath: Path, layer: str) -> list[str]:
    """Checks a file for layer constraint violations."""
    violations: list[str] = []
    blacklist = LAYER_BLACKLIST.get(layer, [])
    
    for module_path, lineno, original in get_imports(filepath):
        for forbidden in blacklist:
            if module_path.startswith(forbidden):
                violations.append(
                    f"{filepath.relative_to(API_DIR)}:{lineno}: "
                    f"'{original}' resolves to '{module_path}', "
                    f"violates {layer} layer constraint"
                )
    
    return violations


def main() -> int:
    """Main entry point."""
    all_violations: list[str] = []
    
    for layer in LAYER_BLACKLIST:
        layer_dir = CORE_DIR / layer
        if not layer_dir.exists():
            continue
        for py_file in layer_dir.rglob("*.py"):
            if "__pycache__" in str(py_file):
                continue
            all_violations.extend(check_file(py_file, layer))
    
    if all_violations:
        print("❌ Layer constraint violations found:")
        for v in all_violations:
            print(f"  - {v}")
        return 1
    
    print("✅ All layer constraints satisfied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
