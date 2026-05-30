# P1-Stage1 LLM Error Doctor ("Explain & Fix") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** When a query fails, let the user click «AI 解释并修复» to get a plain-language explanation and a corrected, **read-only** SQL (editable, never auto-run). Builds on the P0 `LLMService` and the existing deterministic did-you-mean (Stage 0).

**Architecture:** A pure `ai_error_doctor.explain_and_fix(llm, sql, error, schema_text, locale)` that prompts the model, parses a JSON reply, and runs a SELECT-only safety gate using **DuckDB's own parser** (no sqlglot — avoids a new hard dependency). A router `POST /api/ai/error-fix` builds schema context from the table names the frontend passes (DESCRIBE) and returns the result. Frontend wires a button into the ResultPanel error area, gated on AI being enabled.

**No new dependencies.** Safety gate reuses `duckdb.extract_statements` + `StatementType.SELECT` (already used in `query_export._ensure_read_only`). litellm stays optional.

**Model tiering:** Task 3 (frontend aiApi addition, small) → sonnet. Tasks 1–2 + Task 4 (service/router/UI with contract alignment) → opus.

---

## CONTRACT (frontend ⇄ backend — verify alignment)

`POST /api/ai/error-fix`

Request body:
```jsonc
{
  "sql": "SELECT order_idd FROM orders",   // the failed SQL
  "error": "Binder Error: ...",            // the exact DuckDB error string
  "tables": ["orders"],                    // relevant table names (FE knows them); backend DESCRIBEs for schema context
  "locale": "zh"                           // "zh" | "en" — explanation language
}
```

Success response (standard envelope `{success, data, messageCode, ...}`):
```jsonc
{ "data": {
    "explanation": "列名 order_idd 不存在，应为 order_id。",
    "fixed_sql": "SELECT order_id FROM orders",   // string, or null if model produced no safe SELECT
    "safe": true                                   // fixed_sql passed the SELECT-only gate
} }
```

Frontend `aiApi.errorFix(sql, error, opts?: { tables?: string[]; locale?: 'zh'|'en' })`
→ returns `{ explanation: string; fixed_sql: string | null; safe: boolean }`
(via `normalizeResponse(res).data`, which unwraps `response.data.data`).

If AI disabled/unconfigured/litellm missing → the endpoint raises a 4xx (AIDisabledError 400 / AIConfigError 400). The FE only shows the button when AI is enabled, so this is a guard.

---

## File Structure
- `api/core/services/ai_error_doctor.py` (create) — `explain_and_fix` + `_is_select_only`.
- `api/tests/test_ai_error_doctor.py` (create).
- `api/routers/ai.py` (modify) — add `POST /api/ai/error-fix`.
- `api/tests/test_ai_router.py` (modify) — add error-fix tests.
- `frontend/src/api/aiApi.ts` (modify) — add `errorFix` + types.
- `frontend/src/api/__tests__/aiApi.test.ts` (modify) — add test.
- `frontend/src/hooks/useAiEnabled.ts` (create) — react-query GET ai settings, expose `enabled`.
- `frontend/src/Query/ResultPanel/ResultPanel.tsx` (modify) — «AI 解释并修复» button + result display.

---

### Task 1: `ai_error_doctor.explain_and_fix` (opus)

**Files:** Create `api/core/services/ai_error_doctor.py`, `api/tests/test_ai_error_doctor.py`.

- [ ] **Step 1: failing test** — `api/tests/test_ai_error_doctor.py`:

```python
import json
from unittest.mock import MagicMock

from core.services import ai_error_doctor


class _FakeLLM:
    def __init__(self, reply):
        self._reply = reply
        self.calls = []

    def complete(self, feature, messages):
        self.calls.append((feature, messages))
        return self._reply


def test_explain_and_fix_parses_and_passes_safe_select():
    reply = json.dumps({"explanation": "列名写错了", "fixed_sql": "SELECT order_id FROM orders"})
    out = ai_error_doctor.explain_and_fix(
        _FakeLLM(reply), "SELECT order_idd FROM orders", "Binder Error: ...", "orders(order_id INT)"
    )
    assert out["explanation"] == "列名写错了"
    assert out["fixed_sql"] == "SELECT order_id FROM orders"
    assert out["safe"] is True


def test_explain_and_fix_rejects_non_select_fix():
    reply = json.dumps({"explanation": "x", "fixed_sql": "DROP TABLE orders"})
    out = ai_error_doctor.explain_and_fix(_FakeLLM(reply), "bad", "err", "")
    assert out["safe"] is False
    assert out["fixed_sql"] is None
    assert out["explanation"] == "x"


def test_explain_and_fix_tolerates_markdown_fenced_json():
    reply = "```json\n{\"explanation\": \"e\", \"fixed_sql\": \"SELECT 1\"}\n```"
    out = ai_error_doctor.explain_and_fix(_FakeLLM(reply), "s", "e", "")
    assert out["fixed_sql"] == "SELECT 1"
    assert out["safe"] is True


def test_explain_and_fix_handles_unparseable_reply():
    out = ai_error_doctor.explain_and_fix(_FakeLLM("totally not json"), "s", "e", "")
    assert out["fixed_sql"] is None
    assert out["safe"] is False
    assert isinstance(out["explanation"], str)
```

- [ ] **Step 2: run → fail** `cd /Users/keliang/mypy/duckdb-query && PYTHONPATH=api .venv/bin/python -m pytest api/tests/test_ai_error_doctor.py -q`

- [ ] **Step 3: implement** `api/core/services/ai_error_doctor.py`:

```python
"""LLM 报错医生：解释失败 SQL 并给出只读修正，带 SELECT-only 安全闸。"""

from __future__ import annotations

import json
import re
from typing import Any, Dict

import duckdb


def _is_select_only(sql: str) -> bool:
    """用 DuckDB 解析器判定 sql 是否全部为 SELECT（零新依赖，复用导出端点同款手法）。"""
    if not sql or not sql.strip():
        return False
    parser = duckdb.connect()
    try:
        statements = parser.extract_statements(sql)
    except Exception:
        return False
    finally:
        parser.close()
    return bool(statements) and all(
        s.type == duckdb.StatementType.SELECT for s in statements
    )


def _extract_json(text: str) -> Dict[str, Any]:
    """从模型回复里抽 JSON（容忍 ```json 围栏与前后噪声）。"""
    if not text:
        return {}
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text
    start, end = candidate.find("{"), candidate.rfind("}")
    if start == -1 or end == -1 or end < start:
        return {}
    try:
        return json.loads(candidate[start : end + 1])
    except Exception:
        return {}


def explain_and_fix(
    llm, failed_sql: str, error: str, schema_text: str, locale: str = "zh"
) -> Dict[str, Any]:
    lang = "中文" if locale == "zh" else "English"
    system = (
        "You are a DuckDB SQL expert. The user's SELECT query failed. "
        "Explain the error briefly and return a corrected, READ-ONLY SELECT query. "
        "Never produce INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/COPY/ATTACH. "
        f"Respond in {lang}. Reply with strict JSON only: "
        '{"explanation": "<short>", "fixed_sql": "<corrected SQL or empty if impossible>"}'
    )
    user = f"Failed SQL:\n{failed_sql}\n\nError:\n{error}\n\nSchema:\n{schema_text or '(none)'}"
    raw = llm.complete("error_doctor", [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ])

    parsed = _extract_json(raw)
    explanation = str(parsed.get("explanation") or "").strip()
    fixed = str(parsed.get("fixed_sql") or "").strip()
    if not explanation:
        explanation = raw.strip()[:500] if isinstance(raw, str) else ""

    if fixed and _is_select_only(fixed):
        return {"explanation": explanation, "fixed_sql": fixed, "safe": True}
    return {"explanation": explanation, "fixed_sql": None, "safe": False}
```

- [ ] **Step 4: run → pass** (4 tests).
- [ ] **Step 5: commit** `git add api/core/services/ai_error_doctor.py api/tests/test_ai_error_doctor.py && git commit -m "feat(ai): error doctor explain_and_fix (LLM + SELECT-only gate, no new deps)"`

---

### Task 2: router `POST /api/ai/error-fix` (opus)

**Files:** Modify `api/routers/ai.py`, `api/tests/test_ai_router.py`.

- [ ] **Step 1: add tests** to `api/tests/test_ai_router.py` (append):

```python
def test_error_fix_returns_explanation_and_safe_fix(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-z-1",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {},
    })
    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(content='{"explanation":"列写错了","fixed_sql":"SELECT order_id FROM orders"}'))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake):
        resp = client.post("/api/ai/error-fix", json={
            "sql": "SELECT order_idd FROM orders", "error": "Binder Error: ...", "tables": [], "locale": "zh",
        })
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["safe"] is True
    assert data["fixed_sql"] == "SELECT order_id FROM orders"
    assert "explanation" in data


def test_error_fix_when_ai_disabled_is_4xx(tmp_path, monkeypatch):
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    # default file missing -> enabled False
    resp = client.post("/api/ai/error-fix", json={"sql": "SELECT 1", "error": "e", "tables": [], "locale": "zh"})
    assert resp.status_code == 400
```

- [ ] **Step 2: run → fail.**

- [ ] **Step 3: implement** — add to `api/routers/ai.py` (imports + endpoint):

Add near the top imports:
```python
from core.database.duckdb_engine import with_duckdb_connection
from core.services import ai_error_doctor
from core.services.llm_service import AIConfigError, AIDisabledError
```

Add the request model + endpoint:
```python
class ErrorFixPayload(BaseModel):
    sql: str
    error: str
    tables: list[str] = []
    locale: str = "zh"


def _build_schema_text(tables: list[str]) -> str:
    if not tables:
        return ""
    lines: list[str] = []
    with with_duckdb_connection() as con:
        for name in tables[:10]:
            try:
                rows = con.execute(f'DESCRIBE "{name}"').fetchall()
                cols = ", ".join(f"{r[0]} {r[1]}" for r in rows)
                lines.append(f"{name}({cols})")
            except Exception:
                continue
    return "\n".join(lines)


@router.post("/api/ai/error-fix", tags=["AI"])
def error_fix(payload: ErrorFixPayload):
    cfg = ai_config.load_ai_settings()
    schema_text = _build_schema_text(payload.tables)
    try:
        result = ai_error_doctor.explain_and_fix(
            LLMService(cfg), payload.sql, payload.error, schema_text, payload.locale
        )
    except (AIDisabledError, AIConfigError) as exc:
        return error_json_response(400, MessageCode.VALIDATION_ERROR, str(exc))
    return create_success_response(data=result, message_code=MessageCode.OPERATION_SUCCESS)
```

- [ ] **Step 4: run → pass** (2 new) + **full suite** `PYTHONPATH=api .venv/bin/python -m pytest api/tests/ -q` (all pass).
- [ ] **Step 5: commit** `git add api/routers/ai.py api/tests/test_ai_router.py && git commit -m "feat(ai): POST /api/ai/error-fix endpoint"`

---

### Task 3: frontend `aiApi.errorFix` (sonnet)

**Files:** Modify `frontend/src/api/aiApi.ts`, `frontend/src/api/__tests__/aiApi.test.ts`.

- [ ] Add types + function to `aiApi.ts`:
```ts
export interface ErrorFixResult {
  explanation: string;
  fixed_sql: string | null;
  safe: boolean;
}

export async function errorFix(
  sql: string,
  error: string,
  opts?: { tables?: string[]; locale?: 'zh' | 'en' }
): Promise<ErrorFixResult> {
  try {
    const res = await apiClient.post('/api/ai/error-fix', {
      sql, error, tables: opts?.tables ?? [], locale: opts?.locale ?? 'zh',
    });
    return normalizeResponse<ErrorFixResult>(res).data;
  } catch (e) {
    throw handleApiError(e as never, 'AI 修复失败');
  }
}
```

- [ ] Add a vitest mirroring the others (mock apiClient.post, assert path `/api/ai/error-fix` and unwrap). Run vitest for the file. Commit `feat(ai): aiApi.errorFix client`.

---

### Task 4: frontend `useAiEnabled` + ResultPanel button (opus)

**Files:** Create `frontend/src/hooks/useAiEnabled.ts`; modify `frontend/src/Query/ResultPanel/ResultPanel.tsx`.

- [ ] `useAiEnabled.ts`: `useQuery({ queryKey: ['ai-settings','enabled'], queryFn: () => getAiSettings().then(s => s.enabled), staleTime: 5*60*1000 })`, returns boolean (default false on error).
- [ ] In ResultPanel's `if (error)` block (where the deterministic suggestion already renders): when `useAiEnabled()` is true, render an «AI 解释并修复» Button. On click, call `errorFix(currentSql, error.message, { tables: <known table names>, locale: i18n.language })`; show `explanation` and, if `fixed_sql && safe`, the corrected SQL in a read-only `SQLHighlight` with a «复制» action. Loading + error toasts. Never auto-run.
- [ ] tsc clean + vitest green + manual check. Commit `feat(ai): Explain & Fix button on query errors`.

---

## Self-Review
**Contract alignment:** Request/response shapes defined above; `normalizeResponse(res).data` unwraps `response.data.data` which matches `create_success_response(data=result)` — verified consistent with existing aiApi endpoints. **Safety:** SELECT-only gate via DuckDB parser; non-SELECT → `fixed_sql=null, safe=false`; never auto-run. **No new deps** (no sqlglot; litellm stays optional). **Schema source:** frontend passes table names (it has them), backend DESCRIBEs — no backend SQL parsing.
**Placeholder scan:** none. **Type consistency:** `ErrorFixResult` (FE) mirrors backend `data` keys (explanation/fixed_sql/safe).
