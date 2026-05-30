# P0 LLM Foundation — Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the testable backend heart of the AI foundation — a Fernet key-encryption helper, an AI config store (providers/features/enabled with encrypted keys + masked reads), and an `LLMService` that resolves a feature's provider+model and calls the model via LiteLLM — all behind an opt-in switch, all unit-tested with the LLM mocked.

**Architecture:** Three focused modules with one responsibility each: `core/common/crypto.py` (secret encryption), `core/services/ai_config.py` (load/save AI settings), `core/services/llm_service.py` (provider resolution + completion via LiteLLM). No router/UI in this plan — those are P0-b. The LLM call layer is the only thing that imports `litellm`; everything else is pure and offline-testable.

**Tech Stack:** Python, FastAPI project conventions, `litellm` (provider abstraction), `cryptography` (Fernet), pytest.

**Spec ref:** `docs/superpowers/specs/2026-05-30-ai-assistant-design.md` §3, §4, §7. This plan delivers the P0 modules `crypto`, `ai_config`, `llm_service` (the settings tab + SSE routers are P0-b).

**Model tiering for execution:** Tasks 1–2 are small and well-specified → dispatch to **sonnet** subagents. Task 3 (LiteLLM integration, provider resolution edge cases) is more nuanced → **opus** if a sonnet attempt isn't confident.

---

## File Structure

- `api/requirements.txt` (modify) — add `litellm`, `cryptography`.
- `api/core/common/crypto.py` (create) — `encrypt_secret`, `decrypt_secret`, `mask_secret`. Single responsibility: symmetric secret encryption.
- `api/tests/test_crypto.py` (create).
- `api/core/services/ai_config.py` (create) — typed AI settings (providers/features/enabled), load from `config_manager`, save with key encryption, read with key masking.
- `api/tests/test_ai_config.py` (create).
- `api/core/services/llm_service.py` (create) — resolve provider+model per feature; `complete(feature, messages)` via LiteLLM.
- `api/tests/test_llm_service.py` (create).

---

### Task 1: Fernet secret encryption helper (sonnet)

**Files:**
- Create: `api/core/common/crypto.py`
- Test: `api/tests/test_crypto.py`
- Modify: `api/requirements.txt`

- [ ] **Step 1: Add dependency**

Append to `api/requirements.txt` (keep alphabetical-ish, just add the line):

```
cryptography
```

Then install: `cd /Users/keliang/mypy/duckdb-query && .venv/bin/pip install cryptography`

- [ ] **Step 2: Write the failing test**

Create `api/tests/test_crypto.py`:

```python
import importlib

from core.common import crypto


def test_encrypt_decrypt_round_trip(monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret-key-please-change")
    importlib.reload(crypto)
    token = crypto.encrypt_secret("sk-abc123")
    assert token != "sk-abc123"
    assert crypto.decrypt_secret(token) == "sk-abc123"


def test_mask_secret_keeps_only_a_hint():
    assert crypto.mask_secret("sk-abcdef123456") == "****3456"
    assert crypto.mask_secret("") == ""
    assert crypto.mask_secret(None) == ""


def test_decrypt_empty_returns_empty(monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret-key-please-change")
    importlib.reload(crypto)
    assert crypto.decrypt_secret("") == ""
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/test_crypto.py -q`
Expected: FAIL (module `core.common.crypto` does not exist).

- [ ] **Step 4: Write the implementation**

Create `api/core/common/crypto.py`:

```python
"""对称加密用户密钥（如 LLM API Key）。密钥来自环境变量 LLM_KEY_SECRET。"""

from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet

_DEFAULT_SECRET = "duckdb-query-default-llm-key-secret-change-me"


def _fernet() -> Fernet:
    secret = os.getenv("LLM_KEY_SECRET") or _DEFAULT_SECRET
    # 从任意长度的 secret 派生 32 字节 Fernet key
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    if not token:
        return ""
    return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")


def mask_secret(value: str | None) -> str:
    """仅保留尾 4 位作为提示，其余以 **** 代替；空值返回空串。"""
    if not value:
        return ""
    tail = value[-4:] if len(value) >= 4 else value
    return f"****{tail}"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/test_crypto.py -q`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add api/core/common/crypto.py api/tests/test_crypto.py api/requirements.txt
git commit -m "feat(ai): Fernet secret encryption helper for LLM keys"
```

---

### Task 2: AI config store (sonnet)

**Files:**
- Create: `api/core/services/ai_config.py`
- Test: `api/tests/test_ai_config.py`

Defines the in-memory shape of AI settings and pure transforms (encrypt-on-save, mask-on-read). This task does NOT persist to disk — it operates on a plain dict so it stays fully unit-testable; wiring into `config_manager` jsonc is P0-b.

- [ ] **Step 1: Write the failing test**

Create `api/tests/test_ai_config.py`:

```python
import importlib

from core.common import crypto
from core.services import ai_config


def test_default_config_is_disabled():
    cfg = ai_config.default_ai_config()
    assert cfg["enabled"] is False
    assert cfg["providers"] == []


def test_save_encrypts_key_and_read_masks_it(monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    importlib.reload(crypto)
    importlib.reload(ai_config)

    incoming = {
        "enabled": True,
        "providers": [
            {"id": "openai-1", "type": "openai", "base_url": None,
             "api_key": "sk-plain-123456", "models": ["gpt-4o-mini"], "enabled": True}
        ],
        "features": {},
    }
    stored = ai_config.prepare_for_storage(incoming)
    # 存储态：key 被加密，不是明文
    assert stored["providers"][0]["api_key"] != "sk-plain-123456"
    assert crypto.decrypt_secret(stored["providers"][0]["api_key"]) == "sk-plain-123456"

    public = ai_config.prepare_for_read(stored)
    # 读取态：key 被掩码
    assert public["providers"][0]["api_key"] == "****3456"


def test_resolve_feature_falls_back_to_default():
    cfg = {
        "enabled": True,
        "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "models": ["gpt-4o"]}],
        "features": {"nl_to_sql": {"enabled": True, "provider": None, "model": None}},
    }
    resolved = ai_config.resolve_feature(cfg, "nl_to_sql")
    assert resolved["provider"]["id"] == "p1"
    assert resolved["model"] == "gpt-4o"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/test_ai_config.py -q`
Expected: FAIL (module `core.services.ai_config` does not exist).

- [ ] **Step 3: Write the implementation**

Create `api/core/services/ai_config.py`:

```python
"""AI 设置的内存形态与纯变换（加密存、掩码读、按功能解析 provider/model）。"""

from __future__ import annotations

import copy
from typing import Any, Dict, Optional

from core.common import crypto


def default_ai_config() -> Dict[str, Any]:
    return {
        "enabled": False,
        "default_provider": None,
        "providers": [],
        "features": {},
        "timeout_seconds": 30,
        "num_retries": 2,
        "log_usage": True,
        "log_full_prompts": False,
    }


def prepare_for_storage(incoming: Dict[str, Any]) -> Dict[str, Any]:
    """保存前：把明文 api_key 加密。"""
    cfg = copy.deepcopy(incoming)
    for provider in cfg.get("providers", []):
        key = provider.get("api_key")
        if key:
            provider["api_key"] = crypto.encrypt_secret(key)
    return cfg


def prepare_for_read(stored: Dict[str, Any]) -> Dict[str, Any]:
    """返回前端前：把 api_key 掩码（解密出明文仅用于取尾 4 位提示）。"""
    cfg = copy.deepcopy(stored)
    for provider in cfg.get("providers", []):
        token = provider.get("api_key")
        plain = crypto.decrypt_secret(token) if token else ""
        provider["api_key"] = crypto.mask_secret(plain)
    return cfg


def get_provider(cfg: Dict[str, Any], provider_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not provider_id:
        return None
    for provider in cfg.get("providers", []):
        if provider.get("id") == provider_id:
            return provider
    return None


def resolve_feature(cfg: Dict[str, Any], feature: str) -> Dict[str, Any]:
    """解析某功能实际用的 provider(对象) 与 model；功能未指定则回落默认。"""
    feat = cfg.get("features", {}).get(feature, {}) or {}
    provider_id = feat.get("provider") or cfg.get("default_provider")
    provider = get_provider(cfg, provider_id)
    model = feat.get("model")
    if not model and provider:
        models = provider.get("models") or []
        model = models[0] if models else None
    return {"provider": provider, "model": model}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/test_ai_config.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add api/core/services/ai_config.py api/tests/test_ai_config.py
git commit -m "feat(ai): AI config store (encrypt-on-save, mask-on-read, feature resolution)"
```

---

### Task 3: LLMService completion via LiteLLM (opus if sonnet not confident)

**Files:**
- Create: `api/core/services/llm_service.py`
- Test: `api/tests/test_llm_service.py`
- Modify: `api/requirements.txt`

- [ ] **Step 1: Add dependency**

Append to `api/requirements.txt`:

```
litellm
```

Install: `cd /Users/keliang/mypy/duckdb-query && .venv/bin/pip install litellm`

- [ ] **Step 2: Write the failing test**

Create `api/tests/test_llm_service.py`. The test mocks `litellm.completion` so no network is used:

```python
import importlib
from unittest.mock import MagicMock, patch

from core.common import crypto
from core.services import llm_service


def _cfg(monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    importlib.reload(crypto)
    importlib.reload(llm_service)
    return {
        "enabled": True,
        "default_provider": "p1",
        "providers": [{
            "id": "p1", "type": "openai", "base_url": None,
            "api_key": crypto.encrypt_secret("sk-real-123456"),
            "models": ["gpt-4o-mini"], "enabled": True,
        }],
        "features": {"explain": {"enabled": True, "provider": None, "model": None}},
        "timeout_seconds": 30, "num_retries": 2,
    }


def test_complete_resolves_model_and_decrypts_key(monkeypatch):
    cfg = _cfg(monkeypatch)
    svc = llm_service.LLMService(cfg)

    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(content="hello"))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake) as m:
        out = svc.complete("explain", [{"role": "user", "content": "hi"}])

    assert out == "hello"
    kwargs = m.call_args.kwargs
    assert kwargs["model"] == "openai/gpt-4o-mini"      # type/model 组合
    assert kwargs["api_key"] == "sk-real-123456"        # 已解密
    assert kwargs["messages"][0]["content"] == "hi"


def test_complete_raises_when_ai_disabled(monkeypatch):
    cfg = _cfg(monkeypatch)
    cfg["enabled"] = False
    svc = llm_service.LLMService(cfg)
    try:
        svc.complete("explain", [{"role": "user", "content": "hi"}])
        assert False, "should have raised"
    except llm_service.AIDisabledError:
        pass


def test_complete_raises_when_feature_has_no_provider(monkeypatch):
    cfg = _cfg(monkeypatch)
    cfg["default_provider"] = None
    cfg["features"]["explain"] = {"enabled": True, "provider": None, "model": None}
    svc = llm_service.LLMService(cfg)
    try:
        svc.complete("explain", [{"role": "user", "content": "hi"}])
        assert False, "should have raised"
    except llm_service.AIConfigError:
        pass
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/test_llm_service.py -q`
Expected: FAIL (module `core.services.llm_service` does not exist).

- [ ] **Step 4: Write the implementation**

Create `api/core/services/llm_service.py`:

```python
"""LLM 调用服务：按功能解析 provider/model，解密 key，经 LiteLLM 调用。"""

from __future__ import annotations

from typing import Any, Dict, List

import litellm

from core.common import crypto
from core.services import ai_config


class AIDisabledError(RuntimeError):
    """AI 总开关关闭。"""


class AIConfigError(RuntimeError):
    """功能未配置可用的 provider/model。"""


# LiteLLM 的 model 前缀：把我们的 provider type 映射为 LiteLLM 约定
_TYPE_PREFIX = {
    "openai": "openai",
    "anthropic": "anthropic",
    "ollama": "ollama",
    "openai_compatible": "openai",  # 通用 OpenAI 兼容端点
}


class LLMService:
    def __init__(self, cfg: Dict[str, Any]):
        self._cfg = cfg

    def complete(self, feature: str, messages: List[Dict[str, str]]) -> str:
        if not self._cfg.get("enabled"):
            raise AIDisabledError("AI features are disabled")

        resolved = ai_config.resolve_feature(self._cfg, feature)
        provider = resolved["provider"]
        model = resolved["model"]
        if not provider or not model:
            raise AIConfigError(f"No provider/model configured for feature '{feature}'")

        prefix = _TYPE_PREFIX.get(provider.get("type"), "openai")
        kwargs: Dict[str, Any] = {
            "model": f"{prefix}/{model}",
            "messages": messages,
            "timeout": self._cfg.get("timeout_seconds", 30),
            "num_retries": self._cfg.get("num_retries", 2),
        }
        api_key = crypto.decrypt_secret(provider.get("api_key") or "")
        if api_key:
            kwargs["api_key"] = api_key
        if provider.get("base_url"):
            kwargs["api_base"] = provider["base_url"]

        response = litellm.completion(**kwargs)
        return response.choices[0].message.content
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/test_llm_service.py -q`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full backend suite (no regressions)**

Run: `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/ -q`
Expected: all pass (332 + 9 new), 3 skipped.

- [ ] **Step 7: Commit**

```bash
git add api/core/services/llm_service.py api/tests/test_llm_service.py api/requirements.txt
git commit -m "feat(ai): LLMService — feature-resolved completion via LiteLLM"
```

---

## Self-Review

**Spec coverage:** Implements §3 (`llm_service`, partial — completion only, streaming is P0-b), §4 (config shape + encryption + feature resolution, the persistence wiring to jsonc is P0-b), §7 (opt-in `enabled`, key encryption, masking). Settings tab + SSE routers + streaming are explicitly P0-b (next plan).

**Placeholder scan:** No TBD/TODO. All code blocks are complete.

**Type consistency:** `resolve_feature` returns `{"provider", "model"}` (Task 2) and `LLMService.complete` consumes `resolved["provider"]`/`resolved["model"]` (Task 3). `crypto.encrypt_secret/decrypt_secret/mask_secret` (Task 1) used consistently in Tasks 2–3. Config dict keys (`enabled`, `providers`, `default_provider`, `features`, `timeout_seconds`, `num_retries`) consistent across tasks.

**Scope:** Backend core only; UI/router/streaming deferred to P0-b. Tractable for one plan.

---

## Next plan (P0-b)
Settings page «AI/模型» tab (provider CRUD + test-connection), `routers/ai.py` (`GET/PUT /api/settings/ai`, `POST /api/ai/providers/{id}/test`, SSE skeleton), config_manager jsonc persistence, frontend `aiApi.ts` + SSE via `@microsoft/fetch-event-source`.
