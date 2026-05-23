# API Core 目录重构 - 设计文档

> **版本**: 2.5 (最终版 - 完善覆盖范围与配置化)  
> **创建时间**: 2026-01-15  
> **状态**: 📐 设计完成  
> **2026-05 注**：`visual_query_generator` 已拆为 `pivot_query_generator` / `table_metadata_service` / `set_operation_generator`；集合操作模型在 `models/set_operation_models.py`。

---

## 📐 架构设计

### 分层目录结构

```
api/core/
├── __init__.py              # 仅版本信息，不做 Re-export
├── foundation/              # Layer 0: 零依赖基础工具
│   ├── __init__.py
│   ├── encoding_utils.py
│   ├── crypto_utils.py
│   └── timezone_utils.py
├── common/                  # Layer 1: 仅依赖 foundation
│   ├── __init__.py
│   ├── config_manager.py
│   ├── validators.py
│   ├── exceptions.py
│   ├── error_codes.py
│   ├── cache_manager.py
│   ├── utils.py
│   └── enhanced_error_handler.py
├── database/                # Layer 2: 可依赖 L0, L1
│   └── ...
├── security/                # Layer 2: 可依赖 L0, L1
│   └── ...
├── data/                    # Layer 2: 可依赖 L0, L1
│   └── ...
└── services/                # Layer 3: 可依赖所有低层
    └── ...
```

---

## 📜 Google Python Style Guide 自动化验证

### Ruff 配置（核心）

**文件**: `api/pyproject.toml` 或 `api/ruff.toml`

```toml
[tool.ruff]
target-version = "py311"
line-length = 100
src = ["api"]

[tool.ruff.lint]
select = [
    "E",      # pycodestyle errors
    "F",      # pyflakes
    "I",      # isort
    "D",      # pydocstyle (docstrings)
    "ANN",    # flake8-annotations
    "LOG",    # flake8-logging-format
    "TID252", # 禁止相对导入
]
ignore = [
    "D100",   # Missing docstring in public module
    "D104",   # Missing docstring in public package
    "ANN101", # Missing type annotation for self
    "ANN102", # Missing type annotation for cls
]

[tool.ruff.lint.pydocstyle]
convention = "google"

[tool.ruff.lint.flake8-tidy-imports]
ban-relative-imports = "all"  # ✅ 核心：禁止所有相对导入
```

> [!IMPORTANT]
> **作用域确认**：`ruff check api/` 命令会递归检查 `api/core/**/*.py`、`api/routers/**/*.py` 等所有子目录。迁移完成后应运行 `ruff check api/ --statistics` 确认覆盖全部文件。

### CI 配置

**文件**: `.github/workflows/lint.yml`

```yaml
name: Lint

on: [push, pull_request]

jobs:
  ruff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/ruff-action@v1
        with:
          args: "check api/"
          
  import-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Install dependencies
        run: pip install -r api/requirements.txt
      - name: Check layer constraints
        run: |
          cd api && python -m scripts.check_layer_constraints
      - name: Test all imports
        run: |
          cd api && python -m scripts.test_all_imports
```

---

## 🔧 关键设计

### 1. crypto_utils.py（线程安全版）

**文件**: `api/core/foundation/crypto_utils.py`

```python
"""Cryptographic utilities for password and secret management.

This module provides low-level encryption primitives. It has ZERO dependencies
on other core submodules to avoid circular imports.

Thread Safety:
    Uses threading.Lock to ensure safe initialization in multi-threaded
    environments (e.g., Gunicorn with multiple workers starting simultaneously).
"""

from __future__ import annotations

import base64
import logging
import os
import threading
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_SECRET_KEY_FILENAME = "secret.key"
_DEFAULT_PASSWORD_KEYS = ("password", "secret", "token", "api_key")


class CryptoManager:
    """Thread-safe manager for encryption/decryption operations.
    
    Attributes:
        _fernet: Lazily initialized Fernet instance.
        _lock: Threading lock for safe initialization.
    """
    
    def __init__(self) -> None:
        self._fernet: Fernet | None = None
        self._lock = threading.Lock()
    
    def _get_secret_key_path(self) -> Path:
        """Returns the path to the secret key file.
        
        The path is determined by:
        1. CONFIG_DIR environment variable (if set)
        2. Default: <project_root>/config/secret.key
        
        Raises:
            PermissionError: If the key directory is not writable.
        """
        config_dir = os.getenv(
            "CONFIG_DIR",
            str(Path(__file__).parent.parent.parent.parent / "config")
        )
        return Path(config_dir) / _SECRET_KEY_FILENAME
    
    def _get_fernet(self) -> Fernet:
        """Returns the Fernet instance, creating one if necessary.
        
        Thread-safe: Uses double-checked locking pattern.
        
        Returns:
            A Fernet instance for encryption/decryption.
            
        Raises:
            PermissionError: If unable to write new key file.
            OSError: If unable to read existing key file.
        """
        if self._fernet is not None:
            return self._fernet
            
        with self._lock:
            # Double-check after acquiring lock
            if self._fernet is not None:
                return self._fernet
                
            key_path = self._get_secret_key_path()
            
            if key_path.exists():
                key = key_path.read_bytes()
                logger.debug("Loaded encryption key from: %s", key_path)
            else:
                key = Fernet.generate_key()
                try:
                    key_path.parent.mkdir(parents=True, exist_ok=True)
                    key_path.write_bytes(key)
                    logger.info("Generated new encryption key: %s", key_path)
                except PermissionError:
                    logger.warning(
                        "Cannot write key to %s (read-only filesystem?). "
                        "Using ephemeral key - encrypted data won't persist.",
                        key_path,
                    )
                    
            self._fernet = Fernet(key)
            return self._fernet


# Module-level singleton
_crypto_manager = CryptoManager()


def encrypt_string(plaintext: str) -> str:
    """Encrypts a plaintext string using Fernet symmetric encryption.
    
    Args:
        plaintext: The string to encrypt. If empty, returns as-is.
        
    Returns:
        Base64-encoded encrypted string.
    """
    if not plaintext:
        return plaintext
    encrypted = _crypto_manager._get_fernet().encrypt(plaintext.encode())
    return base64.urlsafe_b64encode(encrypted).decode()


def decrypt_string(ciphertext: str) -> str:
    """Decrypts an encrypted string.
    
    Args:
        ciphertext: Base64-encoded encrypted string. If empty, returns as-is.
        
    Returns:
        The decrypted plaintext. If decryption fails, returns the original
        input (assumes it may have been stored in plaintext).
    """
    if not ciphertext:
        return ciphertext
    try:
        encrypted = base64.urlsafe_b64decode(ciphertext.encode())
        return _crypto_manager._get_fernet().decrypt(encrypted).decode()
    except (InvalidToken, TypeError, ValueError) as e:
        logger.warning("Decryption failed, returning original: %s", e)
        return ciphertext


def decrypt_config_passwords(
    config: dict[str, Any],
    keys: tuple[str, ...] | None = None,
) -> dict[str, Any]:
    """Decrypts password fields in a configuration dictionary.
    
    Args:
        config: Configuration dictionary that may contain encrypted values.
        keys: Field names to decrypt. Defaults to common password field names.
        
    Returns:
        A copy of the config with specified fields decrypted.
    """
    keys = keys or _DEFAULT_PASSWORD_KEYS
    result = config.copy()
    for key in keys:
        if key in result and result[key]:
            result[key] = decrypt_string(result[key])
    return result
```

---

### 2. AST 导入改写脚本（处理相对导入）

**文件**: `api/scripts/rewrite_imports.py`

```python
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
import sys
from pathlib import Path

MAPPING_FILE = Path(__file__).parent / "import_mapping.json"
API_DIR = Path(__file__).parent.parent
CORE_DIR = API_DIR / "core"


def load_mapping() -> dict[str, str]:
    """Loads the import path mapping from JSON file."""
    with open(MAPPING_FILE, encoding="utf-8") as f:
        return json.load(f)


def resolve_relative_to_absolute(
    filepath: Path,
    level: int,
    module: str | None,
) -> str | None:
    """Resolves a relative import to its absolute module path.
    
    Args:
        filepath: Path to the file containing the import.
        level: Number of dots in relative import (1 for ., 2 for ..).
        module: The module name after the dots.
        
    Returns:
        Absolute module path, or None if resolution fails.
    """
    try:
        rel_path = filepath.relative_to(API_DIR)
        parts = list(rel_path.parts[:-1])  # Remove filename
        
        if level > len(parts):
            return None
            
        base_parts = parts[: len(parts) - level + 1]
        
        if module:
            return ".".join(base_parts + module.split("."))
        return ".".join(base_parts)
    except ValueError:
        return None


class ImportRewriter(ast.NodeTransformer):
    """AST transformer that rewrites imports."""
    
    def __init__(
        self,
        filepath: Path,
        mapping: dict[str, str],
    ) -> None:
        self.filepath = filepath
        self.mapping = mapping
        self.changes: list[tuple[int, str, str]] = []
    
    def visit_ImportFrom(self, node: ast.ImportFrom) -> ast.ImportFrom:
        """Transforms ImportFrom nodes."""
        original_module = node.module or ""
        
        # Handle relative imports
        if node.level > 0:
            resolved = resolve_relative_to_absolute(
                self.filepath, node.level, node.module
            )
            if resolved and resolved in self.mapping:
                new_module = self.mapping[resolved]
                self.changes.append((
                    node.lineno,
                    f"from {'.' * node.level}{original_module}",
                    f"from {new_module}",
                ))
                node.level = 0
                node.module = new_module
        # Handle absolute imports
        elif original_module in self.mapping:
            new_module = self.mapping[original_module]
            self.changes.append((
                node.lineno,
                f"from {original_module}",
                f"from {new_module}",
            ))
            node.module = new_module
            
        return node


def rewrite_file(
    filepath: Path,
    mapping: dict[str, str],
    dry_run: bool,
) -> int:
    """Rewrites imports in a single file using AST.
    
    Args:
        filepath: Path to the Python file.
        mapping: Old path -> new path mapping.
        dry_run: If True, only print changes without modifying.
        
    Returns:
        Number of changes made.
    """
    try:
        content = filepath.read_text(encoding="utf-8")
        tree = ast.parse(content)
    except (SyntaxError, UnicodeDecodeError) as e:
        print(f"[SKIP] {filepath}: {e}")
        return 0
    
    rewriter = ImportRewriter(filepath, mapping)
    new_tree = rewriter.visit(tree)
    
    if not rewriter.changes:
        return 0
    
    if dry_run:
        for lineno, old, new in rewriter.changes:
            print(f"[DRY-RUN] {filepath}:{lineno}: {old} -> {new}")
    else:
        # Regenerate source from AST
        try:
            import astor
            new_content = astor.to_source(new_tree)
        except ImportError:
            # Fallback: simple regex replacement
            new_content = content
            for _, old, new in rewriter.changes:
                new_content = new_content.replace(old, new)
        
        filepath.write_text(new_content, encoding="utf-8")
        for lineno, old, new in rewriter.changes:
            print(f"[UPDATED] {filepath}:{lineno}: {old} -> {new}")
    
    return len(rewriter.changes)


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
```

---

### 3. 相对导入检测脚本（独立验证）

**文件**: `api/scripts/check_relative_imports.py`

```python
#!/usr/bin/env python3
"""Detects and reports any relative imports in core modules.

This is a standalone check to enforce absolute imports per Google Style Guide.
Run as CI gate to prevent accidental relative imports.

Usage:
    python api/scripts/check_relative_imports.py
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

API_DIR = Path(__file__).parent.parent


def check_file(filepath: Path) -> list[str]:
    """Checks a file for relative imports.
    
    Returns:
        List of violation messages.
    """
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
    
    # Check ALL api/ subdirectories (core, routers, tests, scripts, tools, etc.)
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
```

---

### 4. 全量导入测试（带可配置跳过列表）

**文件**: `api/scripts/test_all_imports.py`

```python
#!/usr/bin/env python3
"""Tests all .py files can be imported without errors.

Some modules with external dependencies or side effects are skipped.
Skip list can be extended via SKIP_MODULES environment variable.

Usage:
    python api/scripts/test_all_imports.py
    
    # Add extra modules to skip:
    SKIP_MODULES="core/database/database_manager.py,core/external/..." python api/scripts/test_all_imports.py
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

API_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(API_DIR))

# Pattern-based skip (always applied)
SKIP_PATTERNS = [
    "test_",
    "conftest",
    "__pycache__",
]

# Default modules to skip (require external resources)
# Add paths relative to api/, e.g., "core/database/database_manager.py"
DEFAULT_SKIP_MODULES: list[str] = [
    # Example: "core/database/external_conn.py"  # Needs live DB
]


def get_skip_modules() -> set[str]:
    """Returns the combined skip modules from default and environment variable."""
    modules = set(DEFAULT_SKIP_MODULES)
    
    # Allow adding extra modules via environment variable
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
            errors.append(f"{py_file.relative_to(API_DIR)}: {e}")
    
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
```

---

## 🤖 运行环境配置

### Makefile（推荐）

**文件**: `api/Makefile`

```makefile
.PHONY: lint test import-check layer-check

# 确保 PYTHONPATH 包含 api/
export PYTHONPATH := $(shell pwd)

lint:
	ruff check .

lint-fix:
	ruff check --fix .

test:
	pytest tests/ -v

import-check:
	python -m scripts.test_all_imports

layer-check:
	python -m scripts.check_layer_constraints

relative-check:
	python -m scripts.check_relative_imports

# 完整验证流程
verify: lint relative-check layer-check import-check test
	@echo "✅ All checks passed"
```

### sys.path 确保脚本

**文件**: `api/scripts/__init__.py`

```python
"""Ensures api/ is in sys.path when running scripts.

Usage:
    cd api && python -m scripts.check_layer_constraints
"""

import sys
from pathlib import Path

API_DIR = Path(__file__).parent.parent

if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))
```

---

## 🧪 验收检查清单

### 自动化验证（CI 必须通过）

| 检查项 | 命令 | 说明 |
|--------|------|------|
| Ruff 风格检查 | `ruff check api/` | Docstring/类型注解/日志格式 |
| 相对导入检测 | `python -m scripts.check_relative_imports` | 禁止相对导入 |
| 分层约束检测 | `python -m scripts.check_layer_constraints` | 层级依赖规则 |
| 全量导入测试 | `python -m scripts.test_all_imports` | 无 ImportError |
| 单元测试 | `pytest api/tests/` | 功能回归 |

### 所有 27 个文件的风格补全

| 任务 | 文件范围 |
|------|---------|
| 添加 Google Docstring | 所有公共函数/类 |
| 添加类型注解 | 所有公共函数参数和返回值 |
| 异常具体化 | 替换 `except Exception` 为具体类型 |
| 日志格式 | 替换 f-string 为 `%` 占位符 |

---

## 📦 `__init__.py` 处理规范

### core/__init__.py（迁移后保留）

迁移完成后，`api/core/__init__.py` **仅保留版本信息，不导出任何子模块**：

```python
"""Core package for the DuckDB Query API.

This package provides database connection management, configuration,
security utilities, and data processing services.

Usage:
    from core.database.duckdb_engine import get_db_connection
    from core.common.config_manager import config_manager
"""

__version__ = "2.0.0"
```

> [!WARNING]
> **不要添加 Re-export**：如 `from core.common.config_manager import config_manager`。
> 这会导致 lint/导入测试误以为旧路径仍可用。

### 子包 `__init__.py`

每个子包（foundation/common/database/security/data/services）的 `__init__.py` 保持空或仅含 docstring：

```python
"""Common utilities and configuration management."""
```

---

## 🔄 迁移后导入改写

> [!IMPORTANT]
> **导入改写需在迁移完成后再运行一次**，以捕获迁移过程中可能新增的相对导入或路径遗漏。

```bash
# 迁移前：预览
python api/scripts/rewrite_imports.py --dry-run

# 迁移后：最终改写
python api/scripts/rewrite_imports.py

# 验证无遗漏
python api/scripts/check_relative_imports.py
grep -rn "from core\." api/ --include="*.py" | grep -v "__pycache__"
```

## 📊 导入映射

**文件**: `api/scripts/import_mapping.json`

```json
{
  "core.timezone_utils": "core.foundation.timezone_utils",
  "core.config_manager": "core.common.config_manager",
  "core.validators": "core.common.validators",
  "core.exceptions": "core.common.exceptions",
  "core.error_codes": "core.common.error_codes",
  "core.cache_manager": "core.common.cache_manager",
  "core.utils": "core.common.utils",
  "core.enhanced_error_handler": "core.common.enhanced_error_handler",
  "core.duckdb_engine": "core.database.duckdb_engine",
  "core.duckdb_pool": "core.database.duckdb_pool",
  "core.database_manager": "core.database.database_manager",
  "core.connection_registry": "core.database.connection_registry",
  "core.metadata_manager": "core.database.metadata_manager",
  "core.table_metadata_cache": "core.database.table_metadata_cache",
  "core.encryption": "core.security.encryption",
  "core.security": "core.security.security",
  "core.sql_injection_protection": "core.security.sql_injection_protection",
  "core.rate_limiter": "core.security.rate_limiter",
  "core.file_datasource_manager": "core.data.file_datasource_manager",
  "core.excel_import_manager": "core.data.excel_import_manager",
  "core.file_utils": "core.data.file_utils",
  "core.task_manager": "core.services.task_manager",
  "core.task_utils": "core.services.task_utils",
  "core.visual_query_generator": "core.services.visual_query_generator",
  "core.cleanup_scheduler": "core.services.cleanup_scheduler",
  "core.resource_manager": "core.services.resource_manager"
}
```
