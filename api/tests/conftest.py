"""
Pytest session setup: isolate DuckDB files from developer machine paths.

Must set env vars before any test module imports `main` (which opens system.db).

CONFIG_DIR/APP_ROOT 必须一并隔离:config_manager.update_app_config 持久化时会把
env 注入的 DUCKDB_DATA_DIR 等运行时值一起写盘。若 CONFIG_DIR 指向开发者真实的
用户配置目录,任何调用 update_app_config 的测试都会把 pytest 临时路径污染进真实
app-config.json —— 2026-07 实际发生过:桌面端重启后按毒化路径解析 system.db,
所有已保存连接"消失"。
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_test_root = Path(tempfile.mkdtemp(prefix="duckquery_pytest_"))
_duck_base = _test_root / "duckdb"
_duck_base.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("APP_ROOT", str(_test_root))
os.environ.setdefault("CONFIG_DIR", str(_test_root / "config"))
os.environ.setdefault("TEMP_FILES_DIR", str(_test_root / "temp_files"))
os.environ.setdefault("DUCKDB_DATA_DIR", str(_duck_base))
os.environ.setdefault("DUCKDB_DATABASE_PATH", str(_duck_base / "main.db"))
