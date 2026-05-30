# P0-b AI Settings — Backend (persistence + routers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist AI settings (providers/features/enabled) to a JSON file with encrypted keys, and expose `GET/PUT /api/settings/ai` (masked on read, encrypted on save) plus `POST /api/ai/providers/{provider_id}/test` (health-check a provider via a minimal completion).

**Architecture:** Extend `ai_config.py` (from P0) with file load/save using `config_manager.atomic_write_json`. A new thin router `routers/ai.py` wires the existing pure helpers (`prepare_for_read`/`prepare_for_storage`) and `LLMService` to HTTP. No frontend in this plan (that is P0-c).

**Tech Stack:** FastAPI, pytest + TestClient. Builds on P0 modules `core/common/crypto.py`, `core/services/ai_config.py`, `core/services/llm_service.py`.

**Spec ref:** `docs/superpowers/specs/2026-05-30-ai-assistant-design.md` §4 (provider management API). The settings-page UI is P0-c.

**Model tiering:** Task 1 (file persistence) is small/clear → **sonnet**. Task 2 (router + app wiring + TestClient tests + provider-test endpoint) → **opus**.

---

## File Structure

- `api/core/services/ai_config.py` (modify) — add `ai_settings_path`, `load_ai_settings`, `save_ai_settings`.
- `api/tests/test_ai_config_persistence.py` (create).
- `api/routers/ai.py` (create) — `GET/PUT /api/settings/ai`, `POST /api/ai/providers/{provider_id}/test`.
- `api/main.py` (modify) — `app.include_router(ai.router)`.
- `api/tests/test_ai_router.py` (create).

---

### Task 1: AI settings file persistence (sonnet)

**Files:**
- Modify: `api/core/services/ai_config.py`
- Test: `api/tests/test_ai_config_persistence.py`

- [ ] **Step 1: Write the failing test**

Create `api/tests/test_ai_config_persistence.py`:

```python
import importlib

from core.common import crypto
from core.services import ai_config


def test_load_returns_default_when_file_missing(tmp_path, monkeypatch):
    importlib.reload(ai_config)
    path = tmp_path / "ai_settings.json"
    cfg = ai_config.load_ai_settings(path)
    assert cfg["enabled"] is False
    assert cfg["providers"] == []


def test_save_then_load_round_trips_with_encrypted_key(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    importlib.reload(crypto)
    importlib.reload(ai_config)
    path = tmp_path / "ai_settings.json"

    ai_config.save_ai_settings({
        "enabled": True,
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-plain-9999",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {},
    }, path)

    # 落盘的是密文，不是明文
    raw = path.read_text(encoding="utf-8")
    assert "sk-plain-9999" not in raw

    loaded = ai_config.load_ai_settings(path)
    assert loaded["enabled"] is True
    assert crypto.decrypt_secret(loaded["providers"][0]["api_key"]) == "sk-plain-9999"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/test_ai_config_persistence.py -q`
Expected: FAIL (`load_ai_settings` / `save_ai_settings` not defined).

- [ ] **Step 3: Add the persistence functions**

Append to `api/core/services/ai_config.py` (after the existing functions). Add the imports `import json` and `from pathlib import Path` and `from typing import ... Optional` at the top if not already present (the file already imports `from typing import Any, Dict, Optional` — keep it):

```python
import json
from pathlib import Path

from core.common.config_manager import config_manager


def ai_settings_path() -> Path:
    return Path(config_manager._default_data_dir()) / "ai_settings.json"


def load_ai_settings(path: Optional[Path] = None) -> Dict[str, Any]:
    """读取持久化的 AI 设置（存储态，api_key 为密文）；文件不存在则返回默认。"""
    target = path or ai_settings_path()
    if not target.exists():
        return default_ai_config()
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except Exception:
        return default_ai_config()
    merged = default_ai_config()
    merged.update(data or {})
    return merged


def save_ai_settings(incoming: Dict[str, Any], path: Optional[Path] = None) -> None:
    """保存 AI 设置：明文 api_key 加密后落盘。"""
    target = path or ai_settings_path()
    stored = prepare_for_storage(incoming)
    target.parent.mkdir(parents=True, exist_ok=True)
    config_manager.atomic_write_json(target, stored)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/test_ai_config_persistence.py -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add api/core/services/ai_config.py api/tests/test_ai_config_persistence.py
git commit -m "feat(ai): persist AI settings to encrypted JSON file"
```

---

### Task 2: AI settings router (opus)

**Files:**
- Create: `api/routers/ai.py`
- Modify: `api/main.py`
- Test: `api/tests/test_ai_router.py`

- [ ] **Step 1: Write the failing test**

Create `api/tests/test_ai_router.py`:

```python
from unittest.mock import MagicMock, patch

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

import routers.ai as ai_router
from main import app

client = TestClient(app)


def test_put_then_get_masks_key(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)

    payload = {
        "enabled": True,
        "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "base_url": None,
                       "api_key": "sk-secret-4242", "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {"explain": {"enabled": True, "provider": None, "model": None}},
    }
    put = client.put("/api/settings/ai", json=payload)
    assert put.status_code == 200

    got = client.get("/api/settings/ai")
    assert got.status_code == 200
    data = got.json()["data"]
    assert data["enabled"] is True
    # 返回前端的 key 被掩码，绝不回传明文
    assert data["providers"][0]["api_key"] == "****4242"
    assert "sk-secret-4242" not in got.text


def test_provider_test_endpoint_pings_model(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)

    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x-1111",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {},
    })

    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(content="pong"))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake):
        resp = client.post("/api/ai/providers/p1/test")
    assert resp.status_code == 200
    assert resp.json()["data"]["ok"] is True


def test_provider_test_unknown_id_returns_error(tmp_path, monkeypatch):
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    resp = client.post("/api/ai/providers/does-not-exist/test")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/test_ai_router.py -q`
Expected: FAIL (`routers.ai` does not exist).

- [ ] **Step 3: Create the router**

Create `api/routers/ai.py`:

```python
"""AI 设置与供应商管理路由。"""

from __future__ import annotations

from typing import Any, Dict

from core.common.exceptions import ResourceNotFoundError
from core.services import ai_config
from core.services.llm_service import LLMService
from fastapi import APIRouter
from pydantic import BaseModel
from utils.response_helpers import (
    MessageCode,
    create_success_response,
    error_json_response,
)

router = APIRouter()


class AISettingsPayload(BaseModel):
    enabled: bool = False
    default_provider: str | None = None
    providers: list[Dict[str, Any]] = []
    features: Dict[str, Any] = {}
    timeout_seconds: int = 30
    num_retries: int = 2


@router.get("/api/settings/ai", tags=["AI"])
def get_ai_settings():
    stored = ai_config.load_ai_settings()
    public = ai_config.prepare_for_read(stored)
    return create_success_response(data=public, message_code=MessageCode.OPERATION_SUCCESS)


@router.put("/api/settings/ai", tags=["AI"])
def put_ai_settings(payload: AISettingsPayload):
    ai_config.save_ai_settings(payload.model_dump())
    return create_success_response(
        data={"saved": True}, message_code=MessageCode.OPERATION_SUCCESS
    )


@router.post("/api/ai/providers/{provider_id}/test", tags=["AI"])
def test_provider(provider_id: str):
    stored = ai_config.load_ai_settings()
    provider = ai_config.get_provider(stored, provider_id)
    if not provider:
        raise ResourceNotFoundError("Provider", provider_id)

    # 临时构造一个仅启用该 provider 的配置做最小 ping
    models = provider.get("models") or []
    probe_cfg = {
        **stored,
        "enabled": True,
        "default_provider": provider_id,
        "features": {"_probe": {"enabled": True, "provider": provider_id,
                                "model": models[0] if models else None}},
    }
    try:
        out = LLMService(probe_cfg).complete(
            "_probe", [{"role": "user", "content": "ping"}]
        )
        return create_success_response(
            data={"ok": True, "sample": (out or "")[:40]},
            message_code=MessageCode.OPERATION_SUCCESS,
        )
    except Exception as exc:  # noqa: BLE001
        return error_json_response(
            502, MessageCode.OPERATION_FAILED, f"Provider test failed: {exc}"
        )
```

- [ ] **Step 4: Wire the router into the app**

In `api/main.py`, find the block of `app.include_router(...)` lines (around line 127-136) and add, alongside the others:

```python
from routers import ai as ai_router
app.include_router(ai_router.router)
```

(Place the import with the other `from routers import ...` imports if that style is used, otherwise add the two lines together near the other `include_router` calls. Match the file's existing import style.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/test_ai_router.py -q`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full backend suite (no regressions)**

Run: `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/ -q`
Expected: all pass (341 + 5 new = 346), 3 skipped.

- [ ] **Step 7: Commit**

```bash
git add api/routers/ai.py api/main.py api/tests/test_ai_router.py
git commit -m "feat(ai): /api/settings/ai GET/PUT + provider test endpoint"
```

---

## Self-Review

**Spec coverage:** Implements §4 backend — `GET/PUT /api/settings/ai` (masked read via `prepare_for_read`, encrypted save via `prepare_for_storage`/`save_ai_settings`) and `POST /api/ai/providers/{id}/test`. Persistence to a JSON file with `atomic_write_json`. UI tab is P0-c.

**Placeholder scan:** No TBD/TODO. Step 4 (main.py wiring) describes matching the file's existing import style — the executor must read main.py's current import block; the two lines to add are given exactly.

**Type consistency:** `load_ai_settings`/`save_ai_settings`/`ai_settings_path`/`get_provider`/`prepare_for_read`/`prepare_for_storage`/`resolve_feature` all from `ai_config` (defined in P0 + Task 1). `LLMService.complete(feature, messages)` matches P0. The test monkeypatches `ai_router.ai_config.ai_settings_path` — `ai_settings_path` is defined as a module function in Task 1, so it is patchable.

**Note for executor:** `ResourceNotFoundError("Provider", provider_id)` — confirm this constructor signature in `api/core/common/exceptions.py` (it takes `resource_type, resource_id` per the existing class). If the signature differs, adapt the call.

---

## Next plan (P0-c)
Frontend: `api/aiApi.ts` (getAiSettings/saveAiSettings/testProvider), `Settings/AISettings.tsx` (provider CRUD cards + test button + per-feature model + master switch), integrate into `SettingsPage.tsx`.
