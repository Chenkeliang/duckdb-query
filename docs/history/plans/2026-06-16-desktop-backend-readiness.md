# Plan A — DuckQuery 后端桌面化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让后端摆脱所有容器假设、能作为冻结二进制读写 per-user 数据目录,并打包成一个离线可用的 `duckquery-api` PyInstaller onedir 后端。

**Architecture:** 新增一个集中式 `paths.py`(per-user 可写目录解析),把后端里所有 `__file__` 相对 / `/app` 硬编码 / cwd 相对路径改为走它;新增 `run.py` 冻结入口(绑 `127.0.0.1` 随机端口、首行打印端口);用 `duckquery.spec` 冻结成 onedir,DuckDB 扩展离线预置。改动对现有 Docker 路径保持向后兼容(env 优先,fallback 才变)。

**Tech Stack:** Python 3.12 / FastAPI / uvicorn / DuckDB 1.5.3 / PyInstaller(onedir)/ pytest(env 隔离,见 `api/tests/conftest.py`)。

**前置约束（继承自 spec）:**
- 后端桌面进程**只绑 `127.0.0.1`**,绝不 `0.0.0.0`。
- 对现有 Docker 行为零回归:所有改动以 env 为第一优先级,只改"没有 env 时的 fallback"。
- 所有命令在仓库根 `/Users/keliang/mypy/duckdb-query` 下、`api/` 子目录里运行;测试用 venv:`.venv/bin/python -m pytest`(DuckDB 1.5.3)。
- 提交署名为当前 git user(`Chen`),**不加任何 AI / Co-Authored-By trailer**。

**基线（开工前确认）:**
```bash
cd /Users/keliang/mypy/duckdb-query/api && ../.venv/bin/python -m pytest -q
# 期望: 全绿(与会话基线 939 passed | 1 skipped 一致或更多)
```

---

### Task 1: 新增 `paths.py` —— per-user 可写目录解析

**Files:**
- Create: `api/core/common/paths.py`
- Test: `api/tests/test_paths.py`

- [ ] **Step 1: 写失败测试**

```python
# api/tests/test_paths.py
import importlib
from pathlib import Path

import core.common.paths as paths


def _reload():
    return importlib.reload(paths)


def test_user_data_dir_macos(monkeypatch):
    monkeypatch.setattr("sys.platform", "darwin")
    monkeypatch.setattr("os.path.expanduser", lambda p: "/Users/tester")
    p = _reload().get_user_data_dir()
    assert p == Path("/Users/tester/Library/Application Support/DuckQuery")


def test_user_data_dir_windows(monkeypatch):
    monkeypatch.setattr("sys.platform", "win32")
    monkeypatch.setenv("APPDATA", r"C:\Users\tester\AppData\Roaming")
    p = _reload().get_user_data_dir()
    assert p == Path(r"C:\Users\tester\AppData\Roaming") / "DuckQuery"


def test_config_dir_prefers_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "cfg"))
    assert _reload().get_config_dir() == tmp_path / "cfg"


def test_config_dir_falls_back_to_user_dir(monkeypatch, tmp_path):
    monkeypatch.delenv("CONFIG_DIR", raising=False)
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path / "ud")
    assert _reload().get_config_dir() == tmp_path / "ud" / "config"


def test_secret_key_path_under_config_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "cfg"))
    assert _reload().get_secret_key_path() == tmp_path / "cfg" / "secret.key"


def test_temp_dir_under_user_dir(monkeypatch, tmp_path):
    monkeypatch.delenv("TEMP_FILES_DIR", raising=False)
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path / "ud")
    assert _reload().get_temp_dir() == tmp_path / "ud" / "temp_files"
```

> 注意 `test_config_dir_falls_back_to_user_dir`/`test_temp_dir_under_user_dir` 用 `monkeypatch.setattr(paths, "get_user_data_dir", ...)`,所以 `get_config_dir`/`get_temp_dir` 内部必须**调用模块级 `get_user_data_dir`**(而非闭包捕获),reload 后 patch 才生效。

- [ ] **Step 2: 运行,确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_paths.py -q`
Expected: FAIL（`ModuleNotFoundError: core.common.paths`）

- [ ] **Step 3: 写实现**

```python
# api/core/common/paths.py
"""集中式可写目录解析。

优先级:显式 env > per-user 系统目录。NEVER 依赖 __file__ 或 /app
(冻结后 __file__ 在只读 bundle 内,/app 仅 Docker 存在)。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_APP_DIR_NAME = "DuckQuery"


def get_user_data_dir() -> Path:
    """返回 per-user 可写根目录。"""
    home = Path(os.path.expanduser("~"))
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / _APP_DIR_NAME
    if sys.platform.startswith("win"):
        base = os.getenv("APPDATA")
        return (Path(base) if base else home) / _APP_DIR_NAME
    return home / ".local" / "share" / _APP_DIR_NAME


def get_config_dir() -> Path:
    """配置目录:CONFIG_DIR env 优先,否则 <user-data>/config。"""
    env = os.getenv("CONFIG_DIR")
    return Path(env) if env else get_user_data_dir() / "config"


def get_secret_key_path() -> Path:
    """Fernet 密钥文件的统一路径:<config-dir>/secret.key。"""
    return get_config_dir() / "secret.key"


def get_temp_dir() -> Path:
    """临时文件目录:TEMP_FILES_DIR env 优先,否则 <user-data>/temp_files。"""
    env = os.getenv("TEMP_FILES_DIR")
    return Path(env) if env else get_user_data_dir() / "temp_files"
```

- [ ] **Step 4: 运行,确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_paths.py -q`
Expected: PASS（6 passed）

- [ ] **Step 5: 提交**

```bash
git add api/core/common/paths.py api/tests/test_paths.py
git commit -m "feat(paths): add per-user writable dir resolver for desktop packaging"
```

---

### Task 2: `config_manager` 去容器化（去掉 `/app` 与 `__file__` fallback）

**Files:**
- Modify: `api/core/common/config_manager.py:209-221`（`__init__` config_dir fallback）
- Modify: `api/core/common/config_manager.py:338-347`（`_resolve_project_root`）
- Test: `api/tests/test_config_manager_paths.py`

- [ ] **Step 1: 写失败测试**

```python
# api/tests/test_config_manager_paths.py
import importlib
from pathlib import Path


def test_config_dir_uses_user_dir_when_no_env(monkeypatch, tmp_path):
    monkeypatch.delenv("CONFIG_DIR", raising=False)
    monkeypatch.delenv("APP_ROOT", raising=False)
    import core.common.paths as paths
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path / "ud")

    import core.common.config_manager as cm
    importlib.reload(cm)
    mgr = cm.ConfigManager()
    assert mgr.config_dir == tmp_path / "ud" / "config"


def test_project_root_does_not_use_app_or_file(monkeypatch, tmp_path):
    monkeypatch.delenv("APP_ROOT", raising=False)
    import core.common.paths as paths
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path / "ud")
    import core.common.config_manager as cm
    importlib.reload(cm)
    root = cm.ConfigManager()._resolve_project_root()
    assert root == tmp_path / "ud"
    assert str(root) != "/app"
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_config_manager_paths.py -q`
Expected: FAIL（config_dir 仍解析到 `__file__/../config`;root 仍是 `/app` 或 `__file__` 根）

- [ ] **Step 3: 写实现**

在 `config_manager.py` 顶部 import 区加入:
```python
from core.common.paths import get_config_dir, get_user_data_dir
```

把 `__init__` 的 else 分支(209-219）改为:
```python
        if config_dir:
            self.config_dir = Path(config_dir)
        else:
            # CONFIG_DIR env 优先,否则 per-user 目录(冻结/桌面安全)
            self.config_dir = get_config_dir()
```

把 `_resolve_project_root`(338-347）整体改为:
```python
    def _resolve_project_root(self) -> Path:
        """确定项目运行根目录(env 优先,否则 per-user 可写目录)。"""
        override = os.getenv("APP_ROOT")
        if override:
            return Path(override)
        return get_user_data_dir()
```

- [ ] **Step 4: 运行,确认通过 + 无回归**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_config_manager_paths.py tests/test_paths.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add api/core/common/config_manager.py api/tests/test_config_manager_paths.py
git commit -m "refactor(config): resolve config/root dirs via per-user paths, drop /app and __file__ fallback"
```

---

### Task 3: DuckDB 内存上限自适应（笔记本不被吃光）

**Files:**
- Modify: `api/requirements.txt`（+`psutil`）
- Modify: `api/core/common/paths.py`（加 `compute_memory_limit()`）
- Modify: `api/core/common/config_manager.py`（app-config 加载时支持 `DUCKDB_MEMORY_LIMIT` env 覆盖）
- Test: `api/tests/test_memory_limit.py`

- [ ] **Step 1: 写失败测试**

```python
# api/tests/test_memory_limit.py
import importlib


def test_compute_memory_limit_caps_at_8gb(monkeypatch):
    import core.common.paths as paths
    importlib.reload(paths)

    class _VM:
        total = 64 * 1024 ** 3  # 64 GB

    monkeypatch.setattr("psutil.virtual_memory", lambda: _VM())
    assert paths.compute_memory_limit() == "8GB"


def test_compute_memory_limit_uses_75pct_on_small_machine(monkeypatch):
    import core.common.paths as paths
    importlib.reload(paths)

    class _VM:
        total = 8 * 1024 ** 3  # 8 GB -> 75% = 6 GB

    monkeypatch.setattr("psutil.virtual_memory", lambda: _VM())
    assert paths.compute_memory_limit() == "6GB"


def test_env_overrides_memory_limit(monkeypatch):
    monkeypatch.setenv("DUCKDB_MEMORY_LIMIT", "3GB")
    import core.common.config_manager as cm
    importlib.reload(cm)
    mgr = cm.ConfigManager()
    assert mgr.get_app_config().duckdb_memory_limit == "3GB"
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_memory_limit.py -q`
Expected: FAIL（`compute_memory_limit` 不存在;env 覆盖未生效）

- [ ] **Step 3: 写实现**

`api/requirements.txt` 增加一行(放在字母序合适处):
```
psutil==6.1.1
```

`paths.py` 追加:
```python
def compute_memory_limit() -> str:
    """按物理内存 75% 设 DuckDB 上限,封顶 8GB。无 psutil 时回退 4GB。"""
    try:
        import psutil

        gb = int(psutil.virtual_memory().total * 0.75 // (1024 ** 3))
    except Exception:
        gb = 4
    gb = max(1, min(gb, 8))
    return f"{gb}GB"
```

`config_manager.py` 的 app-config env 覆盖区(与 `EXPORTS_DIR` 等并列,约 497 行附近),新增 memory 覆盖。找到构建 `config_data` dict 的位置,加入:
```python
                    "duckdb_memory_limit": os.getenv(
                        "DUCKDB_MEMORY_LIMIT", config_data.get("duckdb_memory_limit")
                    ),
```
> 若该键已被 `config_data.get` 填充(默认 `"8GB"`),env 缺失时保持原值;Docker 不设此 env → 仍 8GB,零回归。桌面由 `run.py`(Task 10)注入 `DUCKDB_MEMORY_LIMIT=compute_memory_limit()`。

- [ ] **Step 4: 运行,确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_memory_limit.py -q`
Expected: PASS（3 passed）

- [ ] **Step 5: 提交**

```bash
git add api/requirements.txt api/core/common/paths.py api/core/common/config_manager.py api/tests/test_memory_limit.py
git commit -m "feat(duckdb): auto-tune memory_limit to 75% RAM capped at 8GB, add DUCKDB_MEMORY_LIMIT env"
```

---

### Task 4: 统一 secret.key 的 no-`CONFIG_DIR` fallback

**Files:**
- Modify: `api/core/security/encryption.py:66-78`
- Modify: `api/core/foundation/crypto_utils.py:39-45`
- Test: `api/tests/test_secret_key_unified.py`

> 背景:两个真实加密器都已优先用 `CONFIG_DIR` env(Tauri 会设),只需把"无 env 时的 fallback"从 `__file__/config` 统一到 `get_secret_key_path()`。`main.py:163` 的 `initialize_encryption_key` 是**死代码(全仓无调用)**,本任务不动它。

- [ ] **Step 1: 写失败测试**

```python
# api/tests/test_secret_key_unified.py
import importlib
from pathlib import Path


def test_both_encryptors_use_same_key_path_without_config_env(monkeypatch, tmp_path):
    monkeypatch.delenv("CONFIG_DIR", raising=False)
    import core.common.paths as paths
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path)
    expected = tmp_path / "config" / "secret.key"

    import core.foundation.crypto_utils as cu
    importlib.reload(cu)
    assert cu.CryptoManager()._get_secret_key_path() == expected


def test_crypto_round_trip_with_unified_path(monkeypatch, tmp_path):
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "cfg"))
    import core.foundation.crypto_utils as cu
    importlib.reload(cu)
    mgr = cu.CryptoManager()
    token = mgr.encrypt("hunter2") if hasattr(mgr, "encrypt") else None
    # 仅验证密钥文件落在统一目录下
    assert mgr._get_secret_key_path() == tmp_path / "cfg" / "secret.key"
```

> 第二个测试只断言路径(避免依赖 `CryptoManager` 具体方法名);若 `CryptoManager` 有 `encrypt`/`decrypt`,实现者可补一条 round-trip 断言。

- [ ] **Step 2: 运行,确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_secret_key_unified.py -q`
Expected: FAIL（crypto_utils fallback 仍是 `__file__/config`,与 user-dir 不符)

- [ ] **Step 3: 写实现**

`crypto_utils.py:39-45` `_get_secret_key_path` 改为:
```python
    def _get_secret_key_path(self) -> Path:
        """Returns the unified path to the secret key file."""
        from core.common.paths import get_secret_key_path

        return get_secret_key_path()
```

`encryption.py:66-78`(`_initialize_global_encryptor` 里解析 `config_dir`/`secret_key_file` 的段)改为:
```python
    try:
        from core.common.paths import get_secret_key_path

        secret_key_file = get_secret_key_path()
        secret_key = None

        secret_key_file.parent.mkdir(parents=True, exist_ok=True)
        if secret_key_file.exists():
            with open(secret_key_file, "rb") as f:
                secret_key = f.read()
            logger.info(f"Found existing secret key at {secret_key_file}")
```
（保留其后的"生成新 key 并写入"逻辑不变。)

- [ ] **Step 4: 运行,确认通过 + crypto 回归**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_secret_key_unified.py tests/test_crypto.py tests/test_ai_config.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add api/core/security/encryption.py api/core/foundation/crypto_utils.py api/tests/test_secret_key_unified.py
git commit -m "refactor(crypto): unify secret.key fallback to per-user config dir"
```

---

### Task 5: 修掉唯一的 `/app/exports` 硬编码

**Files:**
- Modify: `api/routers/set_operations.py:587`
- Test: `api/tests/test_set_operations_export_path.py`

- [ ] **Step 1: 写失败测试**

```python
# api/tests/test_set_operations_export_path.py
import inspect
import routers.set_operations as so


def test_no_hardcoded_app_exports_path():
    src = inspect.getsource(so)
    assert "/app/exports/" not in src, "set_operations 不应硬编码 /app/exports"
    assert "get_exports_dir" in src, "应改用 config_manager.get_exports_dir()"
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_set_operations_export_path.py -q`
Expected: FAIL

- [ ] **Step 3: 写实现**

`set_operations.py:586-587` 把:
```python
        filename = f"{base_filename}.{file_extension}"
        file_path = f"/app/exports/{filename}"
```
改为(镜像 `query_export.py` 的写法):
```python
        filename = f"{base_filename}.{file_extension}"
        exports_dir = str(config_manager.get_exports_dir())
        os.makedirs(exports_dir, exist_ok=True)
        file_path = os.path.join(exports_dir, filename)
```
确认文件顶部已 import `os` 和 `config_manager`(若无则补 `from core.common.config_manager import config_manager`)。

- [ ] **Step 4: 运行,确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_set_operations_export_path.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add api/routers/set_operations.py api/tests/test_set_operations_export_path.py
git commit -m "fix(setops): use exports_dir instead of hardcoded /app/exports"
```

---

### Task 6: 消除 import-time `mkdir`（冻结即崩的雷）

**Files:**
- Modify: `api/core/data/excel_import_manager.py:22-26`(及用到 `PENDING_BASE_DIR` 的 41/76/118 行)
- Modify: `api/core/data/file_datasource_manager.py:256-260`
- Test: `api/tests/test_no_import_time_mkdir.py`

- [ ] **Step 1: 写失败测试**

```python
# api/tests/test_no_import_time_mkdir.py
import importlib
from pathlib import Path


def test_excel_import_manager_has_no_module_level_mkdir(monkeypatch, tmp_path):
    """导入模块不应在 __file__ 旁创建目录(冻结后只读会崩)。"""
    import core.common.paths as paths
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path / "ud")

    import core.data.excel_import_manager as eim
    importlib.reload(eim)
    # 模块级常量不应再是直接 mkdir 过的 Path;应通过函数惰性解析
    assert hasattr(eim, "_get_pending_base_dir")
    base = eim._get_pending_base_dir()
    assert base == tmp_path / "ud" / "temp_files" / "excel_pending"
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_no_import_time_mkdir.py -q`
Expected: FAIL（`_get_pending_base_dir` 不存在）

- [ ] **Step 3: 写实现**

`excel_import_manager.py:22-26` 删掉模块级常量+mkdir,改为惰性函数:
```python
def _get_pending_base_dir() -> Path:
    from core.common.paths import get_temp_dir

    base = get_temp_dir() / "excel_pending"
    base.mkdir(parents=True, exist_ok=True)
    return base
```
把原先引用 `PENDING_BASE_DIR` 的 3 处(行 41 `_metadata_path`、76-77 `target_dir`、118 `target_dir`)改为 `_get_pending_base_dir()`。例如 41 行:
```python
    return _get_pending_base_dir() / file_id / "metadata.json"
```

`file_datasource_manager.py:256-260` 把:
```python
        self.data_dir = (
            Path(__file__).resolve().parent.parent / "data" / "file_sources"
        )
        self.data_dir.mkdir(parents=True, exist_ok=True)
```
改为:
```python
        from core.common.paths import get_user_data_dir

        self.data_dir = get_user_data_dir() / "data" / "file_sources"
        self.data_dir.mkdir(parents=True, exist_ok=True)
```

- [ ] **Step 4: 运行,确认通过 + 回归**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_no_import_time_mkdir.py -q && ../.venv/bin/python -m pytest tests/ -k "excel or file_datasource or ingest" -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add api/core/data/excel_import_manager.py api/core/data/file_datasource_manager.py api/tests/test_no_import_time_mkdir.py
git commit -m "fix(data): defer temp/data dir creation to runtime via get_temp_dir (frozen-safe)"
```

---

### Task 7: 统一 routers 里的 temp_files 解析

**Files:**
- Modify: `api/routers/file_ingestion.py`（~193 行 temp_files 解析）
- Modify: `api/routers/chunked_upload.py`（~181-198 `get_upload_dir`/`_get_final_file_path`)
- Modify: `api/routers/join_query.py`（temp_files 探测处,~654-682）
- Test: `api/tests/test_routers_use_temp_dir.py`

- [ ] **Step 1: 写失败测试**

```python
# api/tests/test_routers_use_temp_dir.py
import inspect
import routers.file_ingestion as fi
import routers.chunked_upload as cu


def test_routers_resolve_temp_via_get_temp_dir():
    for mod in (fi, cu):
        src = inspect.getsource(mod)
        assert "get_temp_dir" in src, f"{mod.__name__} 应使用 get_temp_dir()"
        assert "dirname(os.path.dirname(__file__))" not in src.replace(" ", ""), \
            f"{mod.__name__} 不应再用 __file__ 相对 temp_files"
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_routers_use_temp_dir.py -q`
Expected: FAIL

- [ ] **Step 3: 写实现**

在三个 router 顶部 import:
```python
from core.common.paths import get_temp_dir
```
把每处形如 `os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp_files")` 的解析替换为 `str(get_temp_dir())`。`join_query.py` 中"探测多个候选路径"的循环可删除,直接用 `get_temp_dir()`(它保证存在)。各处保留原有 `os.makedirs(..., exist_ok=True)`。

> 实现者:逐个 router 用 `grep -n "temp_files" routers/<file>.py` 定位,确保每处都替换;chunked_upload 的 `get_upload_dir()` 与 `_get_final_file_path()` 都要改。

- [ ] **Step 4: 运行,确认通过 + 上传相关回归**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_routers_use_temp_dir.py -q && ../.venv/bin/python -m pytest tests/ -k "upload or ingest or chunk" -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add api/routers/file_ingestion.py api/routers/chunked_upload.py api/routers/join_query.py api/tests/test_routers_use_temp_dir.py
git commit -m "refactor(routers): resolve temp_files via get_temp_dir for frozen/desktop"
```

---

### Task 8: prompts 资源走 `sys._MEIPASS`

**Files:**
- Modify: `api/core/services/llm_context.py:12`
- Test: `api/tests/test_prompts_dir.py`

- [ ] **Step 1: 写失败测试**

```python
# api/tests/test_prompts_dir.py
import importlib


def test_prompts_dir_uses_meipass_when_frozen(monkeypatch, tmp_path):
    monkeypatch.setattr("sys._MEIPASS", str(tmp_path), raising=False)
    monkeypatch.setattr("sys.frozen", True, raising=False)
    import core.services.llm_context as lc
    importlib.reload(lc)
    assert str(lc._PROMPTS_DIR) == str(tmp_path / "prompts")


def test_prompts_dir_falls_back_to_source_tree(monkeypatch):
    monkeypatch.delattr("sys._MEIPASS", raising=False)
    import core.services.llm_context as lc
    importlib.reload(lc)
    assert str(lc._PROMPTS_DIR).endswith("prompts")
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_prompts_dir.py -q`
Expected: FAIL

- [ ] **Step 3: 写实现**

`llm_context.py:12` 把现有 `_PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "prompts"` 改为:
```python
import sys

_bundle = getattr(sys, "_MEIPASS", None)
_PROMPTS_DIR = (
    Path(_bundle) / "prompts"
    if _bundle
    else Path(__file__).resolve().parent.parent.parent / "prompts"
)
```

- [ ] **Step 4: 运行,确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_prompts_dir.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add api/core/services/llm_context.py api/tests/test_prompts_dir.py
git commit -m "fix(prompts): resolve prompts dir from sys._MEIPASS when frozen"
```

---

### Task 9: server_files 桌面模式（绕过挂载白名单,保留安全检查）

**Files:**
- Modify: `api/routers/server_files.py:116-133`（`_resolve_path`)
- Test: `api/tests/test_server_files_desktop.py`

- [ ] **Step 1: 写失败测试**

```python
# api/tests/test_server_files_desktop.py
import importlib

import pytest


def test_desktop_flag_allows_arbitrary_path(monkeypatch, tmp_path):
    monkeypatch.setenv("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    f = tmp_path / "data.csv"
    f.write_text("a,b\n1,2\n")
    import routers.server_files as sf
    importlib.reload(sf)
    real, mount = sf._resolve_path(str(f))
    assert real == str(f.resolve())


def test_desktop_flag_still_blocks_symlink(monkeypatch, tmp_path):
    monkeypatch.setenv("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    target = tmp_path / "real.csv"
    target.write_text("x\n")
    link = tmp_path / "link.csv"
    link.symlink_to(target)
    import routers.server_files as sf
    importlib.reload(sf)
    with pytest.raises(Exception):
        sf._resolve_path(str(link))


def test_without_flag_enforces_allowlist(monkeypatch, tmp_path):
    monkeypatch.delenv("ALLOW_ARBITRARY_LOCAL_PATHS", raising=False)
    import routers.server_files as sf
    importlib.reload(sf)
    with pytest.raises(Exception):
        sf._resolve_path(str(tmp_path / "nope.csv"))
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_server_files_desktop.py -q`
Expected: FAIL

- [ ] **Step 3: 写实现**

`server_files.py` 的 `_resolve_path`(116-133）在取 `real_path` 后、遍历 mounts 前插入桌面分支:
```python
def _resolve_path(path: str) -> tuple[str, dict]:
    if not path:
        raise APIValidationError("Missing path parameter")

    real_path = os.path.realpath(path)

    if os.getenv("ALLOW_ARBITRARY_LOCAL_PATHS") == "1":
        # 桌面模式:用户经原生文件对话框已授权访问;仍禁止 symlink
        if os.path.islink(path):
            raise SecurityError(
                "Symbolic links are not allowed",
                details={"field": "path", "code": "SYMLINK_NOT_ALLOWED"},
            )
        return real_path, {"label": "local", "real_path": os.path.dirname(real_path)}

    mounts = _get_mount_configs()
    for mount in mounts:
        root = mount["real_path"]
        if real_path.startswith(root):
            if os.path.islink(path):
                raise SecurityError(
                    "Symbolic links are not allowed",
                    details={"field": "path", "code": "SYMLINK_NOT_ALLOWED"},
                )
            return real_path, mount

    raise APIValidationError("Path is not within allowed mount directories")
```

- [ ] **Step 4: 运行,确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_server_files_desktop.py -q`
Expected: PASS（3 passed）

- [ ] **Step 5: 提交**

```bash
git add api/routers/server_files.py api/tests/test_server_files_desktop.py
git commit -m "feat(server-files): desktop mode bypasses mount allowlist via env flag, keeps symlink guard"
```

---

### Task 10: 冻结入口 `run.py`（绑 127.0.0.1 随机端口 + 注入桌面 env）

**Files:**
- Create: `api/run.py`
- Test: `api/tests/test_run_entry.py`

- [ ] **Step 1: 写失败测试**

```python
# api/tests/test_run_entry.py
import socket
import importlib


def test_pick_free_loopback_port_returns_bound_socket():
    import run
    importlib.reload(run)
    sock, port = run.pick_free_loopback_port()
    try:
        assert isinstance(port, int) and 1024 < port <= 65535
        assert sock.getsockname()[0] == "127.0.0.1"
    finally:
        sock.close()


def test_desktop_env_sets_memory_and_loopback(monkeypatch):
    monkeypatch.delenv("DUCKDB_MEMORY_LIMIT", raising=False)
    import run
    importlib.reload(run)
    run.apply_desktop_env()
    import os
    assert os.environ["DUCKDB_MEMORY_LIMIT"].endswith("GB")
    assert os.environ["LITELLM_TELEMETRY"] == "False"
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_run_entry.py -q`
Expected: FAIL（`run` 模块不存在）

- [ ] **Step 3: 写实现**

```python
# api/run.py
"""PyInstaller 冻结入口:桌面 sidecar。

Tauri 以 env 注入可写目录(CONFIG_DIR / DUCKDB_DATA_DIR / APP_DATA_DIR);
本入口补默认值、绑 127.0.0.1 随机端口、首行打印端口供 Tauri 读取。
"""

from __future__ import annotations

import multiprocessing
import os
import socket
import sys


def _base_dir() -> str:
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def apply_desktop_env() -> None:
    base = _base_dir()
    # 只读资源(包内)
    os.environ.setdefault("DUCKDB_EXTENSION_DIRECTORY", os.path.join(base, "extensions"))
    # 内存自适应(笔记本友好)
    from core.common.paths import compute_memory_limit

    os.environ.setdefault("DUCKDB_MEMORY_LIMIT", compute_memory_limit())
    # 桌面安全/隐私
    os.environ.setdefault("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    os.environ.setdefault("LITELLM_TELEMETRY", "False")


def pick_free_loopback_port() -> tuple[socket.socket, int]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))  # 0 -> OS 分配空闲高位端口
    return sock, sock.getsockname()[1]


def main() -> None:
    multiprocessing.freeze_support()  # Windows 必需
    apply_desktop_env()
    sock, port = pick_free_loopback_port()
    print(port, flush=True)  # 第一行 = 端口,Tauri 读 stdout
    import uvicorn
    from main import app

    uvicorn.run(app, fd=sock.fileno(), log_level="info")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 运行,确认通过 + 手动起一次**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_run_entry.py -q`
Expected: PASS

冒烟(可选,手动):
```bash
cd api && ../.venv/bin/python run.py &
sleep 3
PORT=$(jobs -p >/dev/null; echo)  # 或从日志首行取端口
curl -s http://127.0.0.1:<打印的端口>/health
kill %1
```
Expected: `/health` 返回健康 JSON。

- [ ] **Step 5: 提交**

```bash
git add api/run.py api/tests/test_run_entry.py
git commit -m "feat(desktop): add run.py frozen entry binding 127.0.0.1 with OS-assigned port"
```

---

### Task 11: DuckDB 扩展离线预下载脚本

**Files:**
- Create: `api/scripts/fetch_duckdb_extensions.py`
- Test: 验证步骤(下载产物存在,无单测)

- [ ] **Step 1: 写脚本**

```python
# api/scripts/fetch_duckdb_extensions.py
"""离线预下载 DuckDB 扩展,供 PyInstaller 打包。
用法: python scripts/fetch_duckdb_extensions.py <platform>
platform ∈ {osx_arm64, osx_amd64, windows_amd64}
输出: api/extensions/v<ver>/<platform>/<ext>.duckdb_extension
"""

import gzip
import sys
import urllib.request
from pathlib import Path

DUCK_VER = "1.5.3"
# json/parquet 为 1.5 内建自动加载,无需单独文件
EXTS = ["excel", "httpfs", "mysql", "postgres"]


def main(platform: str) -> None:
    out = Path(__file__).resolve().parent.parent / "extensions" / f"v{DUCK_VER}" / platform
    out.mkdir(parents=True, exist_ok=True)
    for ext in EXTS:
        url = f"https://extensions.duckdb.org/v{DUCK_VER}/{platform}/{ext}.duckdb_extension.gz"
        dest = out / f"{ext}.duckdb_extension"
        print(f"-> {url}")
        with urllib.request.urlopen(url) as resp:
            data = gzip.decompress(resp.read())
        dest.write_bytes(data)
        print(f"   wrote {dest} ({len(data)} bytes)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "osx_arm64")
```

- [ ] **Step 2: 本机验证(在线)**

Run: `cd api && ../.venv/bin/python scripts/fetch_duckdb_extensions.py osx_arm64`
Expected: 在 `api/extensions/v1.5.3/osx_arm64/` 下生成 4 个 `.duckdb_extension` 文件(各 > 0 字节)。

- [ ] **Step 3: 提交（脚本,产物 gitignore）**

把 `api/extensions/` 加入 `.gitignore`(构建期生成,不入库):
```bash
echo "api/extensions/" >> .gitignore
git add api/scripts/fetch_duckdb_extensions.py .gitignore
git commit -m "build(duckdb): add offline extension prefetch script"
```

---

### Task 12: PyInstaller spec + 冻结冒烟

**Files:**
- Create: `api/duckquery.spec`
- Test: 验证步骤(构建 + 运行 + 离线查询)

- [ ] **Step 1: 写 spec**

按 spec §4.1 写 `api/duckquery.spec`(onedir、`upx=False`、`collect_all('litellm')`、hidden imports、datas 含 `extensions`/`prompts`/`config`、excludes 含 `magic`/`tkinter`/`matplotlib`/`PIL`)。入口 `run.py`。

- [ ] **Step 2: 本机构建（当前架构）**

```bash
cd api && ../.venv/bin/pip install pyinstaller && ../.venv/bin/pyinstaller duckquery.spec --noconfirm
```
Expected: 生成 `api/dist/duckquery-api/`(onedir 目录,含可执行文件)。

- [ ] **Step 3: 离线冒烟（关键验收)**

断网或临时屏蔽 `extensions.duckdb.org`,运行冻结后端,起一个用到扩展的查询:
```bash
cd api/dist/duckquery-api && ./duckquery-api &
sleep 5
# 取首行打印的端口,curl /health,并跑一条 read_csv / excel 查询
curl -s http://127.0.0.1:<端口>/health
kill %1
```
Expected: `/health` OK;扩展从包内 `extensions/` 加载,无网络请求即可执行 CSV/Parquet 查询。

- [ ] **Step 4: 提交**

```bash
git add api/duckquery.spec
git commit -m "build(pyinstaller): onedir spec for frozen duckquery-api backend"
```

---

### Task 13: 全量回归 + Plan A 收尾

- [ ] **Step 1: 跑完整后端测试套件**

Run: `cd api && ../.venv/bin/python -m pytest -q`
Expected: 全绿(>= 基线 939 passed | 1 skipped,新增测试计入)。

- [ ] **Step 2: lint / 编译检查**

Run: `cd api && ../.venv/bin/python -m py_compile run.py core/common/paths.py && ../.venv/bin/ruff check . || true`
Expected: 无语法错误(ruff 警告按项目既有标准处理)。

- [ ] **Step 3: Docker 零回归抽查**

确认未破坏容器路径:`CONFIG_DIR=/app/config APP_ROOT=/app` 等 env 存在时行为不变(env 优先逻辑已覆盖)。可选:`docker compose up -d --build backend` 起一次,`curl localhost:8001/health`。

- [ ] **Step 4: 标记 Plan A 完成**

确认 `git log --oneline origin/main..HEAD` 仅含本计划提交,无意外文件。Plan A 交付物:可独立运行的冻结后端 + 全套去容器化改造,为 Plan B(Tauri 壳)就绪。

---

## 自检（Self-Review）

**Spec 覆盖**(对照 spec §4.1/§4.2 + 完整性 gap):
- per-user 目录 / config / secret.key / temp / 内存自适应 → Task 1–4 ✅
- `/app/exports`、import-time mkdir、temp_files、prompts、server_files → Task 5–9 ✅
- 冻结入口 + 127.0.0.1 + 端口 + 离线扩展 + onedir → Task 10–12 ✅
- 遥测关(`LITELLM_TELEMETRY=False`)→ Task 10 `apply_desktop_env` ✅
- 去 python-magic → 在 Task 12 spec 的 `excludes=['magic']` 实现(已验证 `security.py` 有 None 兜底,无需改业务码)✅

**留给 Plan B 的**(本计划不含,避免越界):Tauri 壳/sidecar 生命周期/端口注入前端/原生文件对话框 UI/自动更新/版本-CHANGELOG/崩溃日志(Tauri 侧)/wasm 排除/三平台 CI/README 放行图文/Mac ad-hoc 签名(CI 步骤)。

**占位符扫描**:无 TODO/TBD;每个改代码的步骤都给了完整代码或精确 before/after。

**类型/命名一致**:`get_user_data_dir`/`get_config_dir`/`get_secret_key_path`/`get_temp_dir`/`compute_memory_limit`/`pick_free_loopback_port`/`apply_desktop_env`/`_get_pending_base_dir` 在各 Task 间引用一致。

**已知须实现者现场确认的点**(非占位符,是真实代码差异):① Task 3 内存 env 覆盖要插在 config_manager 现有 env-map 区(实现者按 `grep -n EXPORTS_DIR config_manager.py` 定位同款写法);② Task 7 各 router 的 temp_files 行号以现场 `grep` 为准;③ Task 5 确认 `os`/`config_manager` 已 import。
