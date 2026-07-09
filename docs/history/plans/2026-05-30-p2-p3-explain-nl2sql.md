# P2 解释 SQL + P3 NL→SQL 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 duckdb-query 加两个只读、schema-only 的 LLM 功能 —— P2「✨ 解释 SQL」(SQL→人话) 与 P3「问数条」(人话→可编辑 SELECT,绝不自动执行),复用现有 `LLMService` 地基,默认关、Key 不出后端、未配置有引导空状态。

**Architecture:** 后端新增 4 个高内聚纯模块 (`retriever` / `llm_context` / `ai_explain` / `ai_nl_to_sql`) + 2 个新路由,复用 P1 报错医生的 `_is_select_only`/`_extract_json` 安全闸与 JSON 抽取 (DRY)。前端新增 `explainSql`/`nlToSql` 两个 api、`useAiStatus` 三态派生 hook、两个可单测的展示组件 (`ExplainButton`/`AskBar`),挂进 `SQLQueryPanel`;沿 `previewSQL` 同款 prop 链把 `onOpenAiSettings` 回调从 `App` 透传到面板做「去设置」引导。传输用非流式 JSON POST。

**Tech Stack:** FastAPI + DuckDB 解析器 + LiteLLM(可选依赖);React 18 + TS + TanStack Query + CodeMirror;pytest / vitest + RTL。

---

## 关键约定 (执行者必读)

- **提交署名必须是用户账号,严禁任何 agent trailer**(不要 `Co-Authored-By: Claude` / `Generated with Claude Code`)。普通 conventional-commit 信息即可。
- **当前分支 `feat_ai_assistant`**(已确认,非禁止分支)。继续在此分支提交,每个 Task 末尾提交一次。
- **后端测试必须用根虚拟环境**(含 duckdb 1.5.3 + litellm):
  `PYTEST := /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest`
  在 `api/` 目录下运行(例 `cd api && $PYTEST tests/test_retriever.py -q`)。
  ⚠️ 不要用 `api/.venv`(它是 duckdb 1.4.2 且无 litellm,会让 mock litellm 的测试失败)。
- **前端命令**在 `frontend/` 目录:类型检查 `npx tsc --noEmit`;测试 `npx vitest run <path>`。
- **预存在、与本计划无关的失败**(不要去"修"):`api/core/tests/test_duckdb_pool.py` 的 2 个用例 (`module 'core' has no attribute 'duckdb_pool'`);commit 前若跑全量后端,看到这 2 个红可忽略。
- 每改一个后端符号前,本仓 `CLAUDE.md` 要求跑 `gitnexus_impact`;若 MCP 未连,改用 `grep` 人工核验调用方并在提交说明里注明(全部为新文件/局部新增,影响面小)。
- LLM 全程 **mock**,不打真实供应商。

---

## File Structure

**后端新增**
| 文件 | 职责 |
|------|------|
| `api/core/services/retriever.py` | `Retriever` 接口(Protocol) + `KeywordRetriever`:选中表 ∪ 关键词召回 |
| `api/core/services/llm_context.py` | 纯函数拼 NL→SQL 上下文(方言备忘 + 表 DDL + few-shot),不查库不调模型 |
| `api/core/services/ai_explain.py` | `explain_sql(llm, sql, schema_text, locale) → {explanation}` |
| `api/core/services/ai_nl_to_sql.py` | `nl_to_sql(llm, question, context, locale) → {sql, used_tables, safe}`,复用 `_is_select_only` 安全闸 |
| `api/prompts/duckdb_dialect.md` | 静态 DuckDB 方言备忘(种子语料) |
| `api/prompts/sql_examples.json` | few-shot 黄金样例(含 1~2 个联邦样例,plain JSON 免解析依赖) |

**后端修改**
| 文件 | 改动 |
|------|------|
| `api/routers/ai.py` | 加 `_ai_error_response` 错误码映射 + `_list_candidate_tables` + 两路由 `POST /api/ai/explain-sql`、`POST /api/ai/nl-to-sql`;`error_fix` 改用 `_ai_error_response`(补稳定 code) |

**前端新增**
| 文件 | 职责 |
|------|------|
| `frontend/src/hooks/useAiStatus.ts` | `useAiStatus(feature) → {enabled, configured}` + 纯函数 `isFeatureConfigured` |
| `frontend/src/Query/SQLQuery/ai/ExplainButton.tsx` | 展示组件:✨ 解释按钮,ready/guide 两态 |
| `frontend/src/Query/SQLQuery/ai/AskBar.tsx` | 展示组件:常驻问数条,ready/guide 两态 + used-tables chips |

**前端修改**
| 文件 | 改动 |
|------|------|
| `frontend/src/api/aiApi.ts` | 加 `explainSql` / `nlToSql` + 结果类型 |
| `frontend/src/Query/SQLQuery/SQLToolbar.tsx` | 加 `aiSlot?: React.ReactNode` 槽位 |
| `frontend/src/Query/SQLQuery/SQLQueryPanel.tsx` | 挂 AskBar + ExplainButton + 解释面板 + 三态逻辑 + `onOpenAiSettings` prop |
| `App.tsx` / `QueryWorkbenchPage.tsx` / `Query/QueryWorkspace.tsx` / `Query/QueryTabs/index.tsx` | 沿 `previewSQL` 同款链透传 `onOpenAiSettings` |
| `frontend/src/Settings/AISettings.tsx` | 根 `<Card>` 加 `id="settings-ai"` 锚点 |
| `frontend/src/components/CommandPalette.tsx` + `App.tsx` | ⌘K 注册「问数 / 解释 SQL」,受 `useAiEnabled` 门控 |
| `frontend/src/i18n/locales/{zh,en}/common.json` | 新增 `query.ai.*` 文案 |

> 与 spec 的两处刻意简化(已在 §10 开放问题授权内):种子语料合并为 `duckdb_dialect.md` + `sql_examples.json`(不引 jsonc 解析依赖);SQL 历史 few-shot v1 传空(`llm_context` 接口已留 `history` 参数,日后接上零改动)。

---

## Task 1: 后端 AI 错误码 (`ai_disabled` / `ai_not_configured`) + 回填 error-fix

补 spec §4.3 稳定错误码,让前端能区分"未配置"空状态。`error_json_response(status, code, message)` 的 `code` 接受任意字符串,直接落到响应体 `error.code`。

**Files:**
- Modify: `api/routers/ai.py`
- Test: `api/tests/test_ai_router.py`

- [ ] **Step 1: 写失败测试**

在 `api/tests/test_ai_router.py` 末尾追加:

```python
def test_error_fix_disabled_has_stable_code(tmp_path, monkeypatch):
    # 默认 enabled=false → LLMService 抛 AIDisabledError → 稳定 code=ai_disabled
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    resp = client.post("/api/ai/error-fix", json={
        "sql": "SELECT 1", "error": "e", "tables": [], "locale": "zh"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "ai_disabled"


def test_explain_not_configured_has_stable_code(tmp_path, monkeypatch):
    # enabled=true 但无供应商 → AIConfigError → code=ai_not_configured
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": None, "providers": [], "features": {}})
    resp = client.post("/api/ai/explain-sql", json={"sql": "SELECT 1", "locale": "zh"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "ai_not_configured"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_router.py::test_error_fix_disabled_has_stable_code tests/test_ai_router.py::test_explain_not_configured_has_stable_code -q`
Expected: FAIL —— 第一个断言 `error.code` 现为 `VALIDATION_ERROR`;第二个因 `/api/ai/explain-sql` 路由尚不存在而 404/405。

- [ ] **Step 3: 实现 —— `api/routers/ai.py` 加错误码映射并回填 error-fix**

把 `core.services` 的 import 行(当前第 9 行 `from core.services import ai_config, ai_error_doctor`)改为(本 Task 只需加映射函数;explain/nl 模块在 Task 4/5 再加 import):

```python
from core.services import ai_config, ai_error_doctor
```

(保持不变。)在 `_build_schema_text` 函数**之前**插入错误码映射:

```python
def _ai_error_response(exc: Exception):
    """把 LLM 服务异常映射成 spec §4.3 的稳定错误码。"""
    code = "ai_disabled" if isinstance(exc, AIDisabledError) else "ai_not_configured"
    return error_json_response(400, code, str(exc))
```

把 `error_fix` 里的:

```python
    except (AIDisabledError, AIConfigError) as exc:
        return error_json_response(400, MessageCode.VALIDATION_ERROR, str(exc))
```

替换为:

```python
    except (AIDisabledError, AIConfigError) as exc:
        return _ai_error_response(exc)
```

> `test_explain_not_configured_has_stable_code` 仍会因路由缺失失败 —— 该用例在 Task 4 路由落地后转绿;本 Task 先让 `test_error_fix_disabled_has_stable_code` 转绿即可。

- [ ] **Step 4: 跑 error-fix 用例确认转绿**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_router.py::test_error_fix_disabled_has_stable_code -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add api/routers/ai.py api/tests/test_ai_router.py
git commit -m "feat(ai): stable error codes ai_disabled/ai_not_configured; retrofit error-fix"
```

---

## Task 2: 后端 `KeywordRetriever` + `Retriever` 接口

spec §2/§4.1。选中表优先,再用问题关键词在候选表名里召回;接口留好,日后 VectorRetriever 作第二实现零改上层。

**Files:**
- Create: `api/core/services/retriever.py`
- Test: `api/tests/test_retriever.py`

- [ ] **Step 1: 写失败测试**

新建 `api/tests/test_retriever.py`:

```python
from core.services.retriever import KeywordRetriever


def test_selected_tables_come_first_then_keyword_matches():
    r = KeywordRetriever()
    out = r.retrieve(
        question="list all customers",
        selected_tables=["orders"],
        candidate_tables=["orders", "customers", "products"],
    )
    assert out[0] == "orders"          # 选中表优先
    assert "customers" in out          # 关键词 customer(s) 召回
    assert "products" not in out       # 无关不召回


def test_no_selected_falls_back_to_keyword_only():
    r = KeywordRetriever()
    out = r.retrieve(
        question="customer revenue by month",
        selected_tables=[],
        candidate_tables=["customers", "orders", "inventory"],
    )
    assert "customers" in out
    assert "inventory" not in out


def test_result_is_capped():
    r = KeywordRetriever(max_tables=2)
    out = r.retrieve(
        question="order data report",
        selected_tables=["a", "b", "c"],
        candidate_tables=["orders"],
    )
    assert len(out) == 2               # 截断到 max_tables
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_retriever.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'core.services.retriever'`

- [ ] **Step 3: 实现 `api/core/services/retriever.py`**

```python
"""schema 检索:Retriever 接口 + KeywordRetriever(零新基建,契合「不过重」)。

VectorRetriever 日后作同一接口的第二实现加入,上层(llm_context/路由/前端)零改动。
"""

from __future__ import annotations

import re
from typing import List, Protocol

_MAX_TABLES = 10


def _tokens(text: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", (text or "").lower()) if len(t) >= 2}


class Retriever(Protocol):
    def retrieve(
        self, question: str, selected_tables: List[str], candidate_tables: List[str]
    ) -> List[str]:
        ...


class KeywordRetriever:
    """选中表优先,再用问题关键词在候选表名里召回;去重并截断到 max_tables。"""

    def __init__(self, max_tables: int = _MAX_TABLES):
        self._max = max_tables

    def retrieve(
        self, question: str, selected_tables: List[str], candidate_tables: List[str]
    ) -> List[str]:
        result: List[str] = []
        for t in selected_tables or []:
            if t and t not in result:
                result.append(t)
        q = _tokens(question)
        for t in candidate_tables or []:
            if len(result) >= self._max:
                break
            if t in result:
                continue
            name_tokens = _tokens(t)
            if (q & name_tokens) or any(tok in (t or "").lower() for tok in q):
                result.append(t)
        return result[: self._max]
```

- [ ] **Step 4: 跑测试确认转绿**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_retriever.py -q`
Expected: PASS (3 passed)

- [ ] **Step 5: 提交**

```bash
git add api/core/services/retriever.py api/tests/test_retriever.py
git commit -m "feat(ai): KeywordRetriever behind Retriever interface for NL2SQL schema recall"
```

---

## Task 3: 后端种子语料 + `llm_context`

spec §4.1。纯函数拼上下文,不查库不调模型,便于单测。

**Files:**
- Create: `api/prompts/duckdb_dialect.md`
- Create: `api/prompts/sql_examples.json`
- Create: `api/core/services/llm_context.py`
- Test: `api/tests/test_llm_context.py`

- [ ] **Step 1: 写种子语料**

新建 `api/prompts/duckdb_dialect.md`:

```markdown
# DuckDB SQL dialect notes (for NL→SQL)

- DuckDB speaks standard ANSI SQL; prefer plain SELECT.
- String concat uses `||`. Use single quotes for string literals, double quotes for identifiers.
- Date/time: `CURRENT_DATE`, `date_trunc('month', ts)`, `ts - INTERVAL 7 DAY`.
- Top-N: `... ORDER BY x DESC LIMIT 10`. Use `QUALIFY` with window functions when needed.
- List/struct types exist; `UNNEST(list)` to expand.
- Federated tables (MySQL/PostgreSQL via ATTACH) are queried as `db_alias.schema.table`.
- Read-only only: never emit INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/COPY/ATTACH.
```

新建 `api/prompts/sql_examples.json`(故意放 4 条以验证 Top-3 截断;含一条联邦样例):

```json
[
  {
    "question": "每个客户的订单数,最多的排前面",
    "sql": "SELECT customer_id, count(*) AS order_count FROM orders GROUP BY customer_id ORDER BY order_count DESC"
  },
  {
    "question": "最近 7 天的销售额",
    "sql": "SELECT sum(amount) AS revenue FROM orders WHERE order_date >= CURRENT_DATE - INTERVAL 7 DAY"
  },
  {
    "question": "联邦:MySQL 的用户表里活跃用户数",
    "sql": "SELECT count(*) FROM mysqldb.main.users WHERE status = 'active'"
  },
  {
    "question": "按月统计新增客户",
    "sql": "SELECT date_trunc('month', created_at) AS m, count(*) AS n FROM customers GROUP BY m ORDER BY m"
  }
]
```

- [ ] **Step 2: 写失败测试**

新建 `api/tests/test_llm_context.py`:

```python
from core.services import llm_context


def test_context_includes_schema_dialect_examples_and_caps_few_shot():
    ctx = llm_context.build_nl2sql_context(
        schema_text="orders(id INTEGER, amount DOUBLE)",
        history=["SELECT 1"],
        locale="zh",
    )
    # 表 DDL 原样带入
    assert "orders(id INTEGER, amount DOUBLE)" in ctx
    # 方言备忘块在(种子文件存在)
    assert "DuckDB" in ctx
    # few-shot 截断到 3 条(种子有 4 条)
    assert ctx.count("Q:") == 3
    # 历史 SQL 带入
    assert "SELECT 1" in ctx


def test_context_survives_when_schema_empty():
    ctx = llm_context.build_nl2sql_context(schema_text="", history=None, locale="en")
    assert isinstance(ctx, str)
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_llm_context.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'core.services.llm_context'`

- [ ] **Step 4: 实现 `api/core/services/llm_context.py`**

```python
"""拼 NL→SQL 上下文:方言备忘 + 相关表 DDL + few-shot 样例(Top-3)+ 可选历史。

纯函数:不调模型、不查库。种子语料在 api/prompts/。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional

_PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "prompts"
_MAX_EXAMPLES = 3


def _read_dialect() -> str:
    try:
        return (_PROMPTS_DIR / "duckdb_dialect.md").read_text(encoding="utf-8").strip()
    except Exception:  # noqa: BLE001
        return ""


def _read_examples() -> List[Dict[str, str]]:
    try:
        data = json.loads((_PROMPTS_DIR / "sql_examples.json").read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:  # noqa: BLE001
        return []


def build_nl2sql_context(
    schema_text: str, history: Optional[List[str]] = None, locale: str = "zh"
) -> str:
    parts: List[str] = []
    dialect = _read_dialect()
    if dialect:
        parts.append(dialect)
    if schema_text:
        parts.append("# Available tables\n" + schema_text)
    examples = _read_examples()[:_MAX_EXAMPLES]
    if examples:
        ex = "\n\n".join(
            f"Q: {e.get('question', '')}\nSQL: {e.get('sql', '')}" for e in examples
        )
        parts.append("# Examples\n" + ex)
    hist = [h for h in (history or []) if h][:_MAX_EXAMPLES]
    if hist:
        parts.append("# Recent user SQL\n" + "\n".join(hist))
    return "\n\n".join(parts)
```

- [ ] **Step 5: 跑测试确认转绿**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_llm_context.py -q`
Expected: PASS (2 passed)

- [ ] **Step 6: 提交**

```bash
git add api/prompts/duckdb_dialect.md api/prompts/sql_examples.json api/core/services/llm_context.py api/tests/test_llm_context.py
git commit -m "feat(ai): seed DuckDB dialect/examples corpus + llm_context assembler"
```

---

## Task 4: 后端 `ai_explain` + `POST /api/ai/explain-sql`

spec §4/§7。SQL→人话,纯解释不改写不执行。

**Files:**
- Create: `api/core/services/ai_explain.py`
- Modify: `api/routers/ai.py`
- Test: `api/tests/test_ai_explain.py`, `api/tests/test_ai_router.py`

- [ ] **Step 1: 写失败测试(服务层)**

新建 `api/tests/test_ai_explain.py`:

```python
from unittest.mock import MagicMock

from core.services import ai_explain


def test_explain_sql_calls_llm_and_returns_explanation():
    llm = MagicMock()
    llm.complete.return_value = "这条 SQL 统计每个客户的订单数,并按订单数从多到少排序。"
    out = ai_explain.explain_sql(llm, "SELECT customer_id, count(*) FROM orders GROUP BY 1", "", "zh")
    assert out["explanation"].startswith("这条 SQL")
    # 走的是 explain 功能位
    assert llm.complete.call_args[0][0] == "explain"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_explain.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'core.services.ai_explain'`

- [ ] **Step 3: 实现 `api/core/services/ai_explain.py`**

```python
"""LLM 解释 SQL:把一段 SQL 翻成人话(只读,不改写、不执行)。"""

from __future__ import annotations

from typing import Any, Dict


def explain_sql(llm, sql: str, schema_text: str = "", locale: str = "zh") -> Dict[str, Any]:
    lang = "中文" if locale == "zh" else "English"
    system = (
        "You are a DuckDB SQL expert. Explain, in plain and concise language for a "
        "non-expert, what the user's SQL query does. Do not rewrite or execute it. "
        f"Respond in {lang}. Plain text only, no code fences."
    )
    user = f"SQL:\n{sql}\n\nSchema:\n{schema_text or '(none)'}"
    raw = llm.complete(
        "explain",
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return {"explanation": (raw or "").strip()}
```

- [ ] **Step 4: 跑测试确认转绿**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_explain.py -q`
Expected: PASS

- [ ] **Step 5: 写路由失败测试**

在 `api/tests/test_ai_router.py` 末尾追加(成功路径):

```python
def test_explain_sql_route_returns_explanation(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})
    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(content="这条 SQL 取所有订单。"))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake):
        resp = client.post("/api/ai/explain-sql", json={"sql": "SELECT * FROM orders", "locale": "zh"})
    assert resp.status_code == 200
    assert resp.json()["data"]["explanation"]
```

- [ ] **Step 6: 跑路由测试确认失败**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_router.py::test_explain_sql_route_returns_explanation -q`
Expected: FAIL —— 路由不存在 (404/405)。

- [ ] **Step 7: 实现路由 —— 修改 `api/routers/ai.py`**

把 import 行(第 9 行)改为:

```python
from core.services import ai_config, ai_error_doctor, ai_explain
```

在文件末尾(`error_fix` 之后)追加:

```python
class ExplainSqlPayload(BaseModel):
    sql: str
    locale: str = "zh"


@router.post("/api/ai/explain-sql", tags=["AI"])
def explain_sql_route(payload: ExplainSqlPayload):
    cfg = ai_config.load_ai_settings()
    try:
        result = ai_explain.explain_sql(LLMService(cfg), payload.sql, "", payload.locale)
    except (AIDisabledError, AIConfigError) as exc:
        return _ai_error_response(exc)
    except Exception as exc:  # noqa: BLE001  供应商真实调用失败(网络/Key/超时)
        return error_json_response(
            502, MessageCode.OPERATION_FAILED, f"AI explain failed: {exc}"
        )
    return create_success_response(data=result, message_code=MessageCode.OPERATION_SUCCESS)
```

- [ ] **Step 8: 跑路由 + 上一 Task 遗留的 not_configured 用例确认转绿**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_router.py::test_explain_sql_route_returns_explanation tests/test_ai_router.py::test_explain_not_configured_has_stable_code -q`
Expected: PASS (2 passed)

- [ ] **Step 9: 提交**

```bash
git add api/core/services/ai_explain.py api/routers/ai.py api/tests/test_ai_explain.py api/tests/test_ai_router.py
git commit -m "feat(ai): P2 explain-sql service + POST /api/ai/explain-sql"
```

---

## Task 5: 后端 `ai_nl_to_sql`(SELECT-only 安全闸)+ `POST /api/ai/nl-to-sql`

spec §4/§7。人话→SELECT;复用 P1 的 `_is_select_only`/`_extract_json`(DRY)。

**Files:**
- Create: `api/core/services/ai_nl_to_sql.py`
- Modify: `api/routers/ai.py`
- Test: `api/tests/test_ai_nl_to_sql.py`, `api/tests/test_ai_router.py`

- [ ] **Step 1: 写失败测试(服务层,含安全闸)**

新建 `api/tests/test_ai_nl_to_sql.py`:

```python
from unittest.mock import MagicMock

from core.services import ai_nl_to_sql


def test_nl_to_sql_returns_safe_select():
    llm = MagicMock()
    llm.complete.return_value = '{"sql":"SELECT count(*) FROM orders","used_tables":["orders"]}'
    out = ai_nl_to_sql.nl_to_sql(llm, "多少订单", "ctx", "zh")
    assert out["safe"] is True
    assert out["sql"] == "SELECT count(*) FROM orders"
    assert out["used_tables"] == ["orders"]
    assert llm.complete.call_args[0][0] == "nl_to_sql"


def test_nl_to_sql_blocks_non_select():
    llm = MagicMock()
    llm.complete.return_value = '{"sql":"DELETE FROM orders","used_tables":["orders"]}'
    out = ai_nl_to_sql.nl_to_sql(llm, "删订单", "ctx", "zh")
    assert out["safe"] is False        # 非 SELECT 不作为可用 SQL
    assert out["sql"] == "DELETE FROM orders"  # 仍回传供查看


def test_nl_to_sql_tolerates_garbage_json():
    llm = MagicMock()
    llm.complete.return_value = "抱歉我不知道"
    out = ai_nl_to_sql.nl_to_sql(llm, "?", "ctx", "zh")
    assert out["safe"] is False
    assert out["sql"] == ""
    assert out["used_tables"] == []
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_nl_to_sql.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'core.services.ai_nl_to_sql'`

- [ ] **Step 3: 实现 `api/core/services/ai_nl_to_sql.py`**

```python
"""LLM 把自然语言翻成 DuckDB SELECT,带 SELECT-only 安全闸。

复用报错医生的 _is_select_only(DuckDB 解析器,零新依赖)与 _extract_json(DRY)。
"""

from __future__ import annotations

from typing import Any, Dict

from core.services.ai_error_doctor import _extract_json, _is_select_only


def nl_to_sql(llm, question: str, context: str, locale: str = "zh") -> Dict[str, Any]:
    lang = "中文" if locale == "zh" else "English"
    system = (
        "You are a DuckDB SQL expert. Translate the user's question into a single "
        "READ-ONLY DuckDB SELECT query using ONLY the provided schema. "
        "Never produce INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/COPY/ATTACH. "
        f"Any prose in {lang}. Reply with strict JSON only: "
        '{"sql": "<SELECT ...>", "used_tables": ["t1"]}'
    )
    user = f"Question:\n{question}\n\nContext:\n{context or '(none)'}"
    raw = llm.complete(
        "nl_to_sql",
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    parsed = _extract_json(raw)
    sql = str(parsed.get("sql") or "").strip()
    used = parsed.get("used_tables") or []
    if not isinstance(used, list):
        used = []
    used = [str(t) for t in used]
    safe = bool(sql) and _is_select_only(sql)
    return {"sql": sql, "used_tables": used, "safe": safe}
```

- [ ] **Step 4: 跑测试确认转绿**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_nl_to_sql.py -q`
Expected: PASS (3 passed)

- [ ] **Step 5: 写路由失败测试**

在 `api/tests/test_ai_router.py` 末尾追加:

```python
def test_nl_to_sql_route_returns_safe_select(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})
    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(
        content='{"sql":"SELECT count(*) FROM orders","used_tables":["orders"]}'))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake):
        resp = client.post("/api/ai/nl-to-sql", json={
            "question": "多少订单", "tables": ["orders"], "locale": "zh"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["safe"] is True
    assert data["sql"] == "SELECT count(*) FROM orders"
    assert data["used_tables"] == ["orders"]
```

- [ ] **Step 6: 跑路由测试确认失败**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_router.py::test_nl_to_sql_route_returns_safe_select -q`
Expected: FAIL —— 路由不存在。

- [ ] **Step 7: 实现路由 —— 修改 `api/routers/ai.py`**

把 import 行(已在 Task 4 改过)再补两个模块:

```python
from core.services import ai_config, ai_error_doctor, ai_explain, ai_nl_to_sql, llm_context
from core.services.retriever import KeywordRetriever
```

在文件末尾追加候选表列举 + 路由:

```python
def _list_candidate_tables() -> list[str]:
    """main schema 下的表名,作为 KeywordRetriever 的候选池(失败则空)。"""
    try:
        with with_duckdb_connection() as con:
            rows = con.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'main'"
            ).fetchall()
        return [r[0] for r in rows]
    except Exception:  # noqa: BLE001
        return []


class NlToSqlPayload(BaseModel):
    question: str
    tables: list[str] = []
    locale: str = "zh"


@router.post("/api/ai/nl-to-sql", tags=["AI"])
def nl_to_sql_route(payload: NlToSqlPayload):
    cfg = ai_config.load_ai_settings()
    candidates = _list_candidate_tables()
    relevant = KeywordRetriever().retrieve(payload.question, payload.tables, candidates)
    schema_text = _build_schema_text(relevant)
    context = llm_context.build_nl2sql_context(schema_text, locale=payload.locale)
    try:
        result = ai_nl_to_sql.nl_to_sql(
            LLMService(cfg), payload.question, context, payload.locale
        )
    except (AIDisabledError, AIConfigError) as exc:
        return _ai_error_response(exc)
    except Exception as exc:  # noqa: BLE001
        return error_json_response(
            502, MessageCode.OPERATION_FAILED, f"AI nl-to-sql failed: {exc}"
        )
    return create_success_response(data=result, message_code=MessageCode.OPERATION_SUCCESS)
```

- [ ] **Step 8: 跑路由测试 + 全量 AI 套件确认转绿**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_router.py tests/test_ai_nl_to_sql.py tests/test_ai_explain.py tests/test_retriever.py tests/test_llm_context.py tests/test_ai_config.py tests/test_llm_service.py tests/test_crypto.py -q`
Expected: PASS (全绿)

- [ ] **Step 9: 提交**

```bash
git add api/core/services/ai_nl_to_sql.py api/routers/ai.py api/tests/test_ai_nl_to_sql.py api/tests/test_ai_router.py
git commit -m "feat(ai): P3 nl-to-sql service with SELECT-only gate + POST /api/ai/nl-to-sql"
```

---

## Task 6: 前端 `aiApi.explainSql` + `nlToSql`

spec §7。沿用现有 `errorFix` 同款 `apiClient + normalizeResponse + handleApiError`。

**Files:**
- Modify: `frontend/src/api/aiApi.ts`
- Test: `frontend/src/api/__tests__/aiApi.test.ts`

- [ ] **Step 1: 写失败测试**

在 `frontend/src/api/__tests__/aiApi.test.ts` 的 import 行把新函数加入,并在 `describe` 块末尾追加用例。先把顶部 import 改为:

```ts
import { getAiSettings, saveAiSettings, testProvider, errorFix, explainSql, nlToSql } from '../aiApi';
```

在最后一个 `it(...)` 之后追加:

```ts
  it('explainSql POSTs /api/ai/explain-sql and unwraps explanation', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { explanation: '这条 SQL 取所有订单' } },
    });
    const out = await explainSql('SELECT * FROM orders', { locale: 'zh' });
    expect(apiClient.post).toHaveBeenCalledWith('/api/ai/explain-sql', {
      sql: 'SELECT * FROM orders', locale: 'zh',
    });
    expect(out.explanation).toBe('这条 SQL 取所有订单');
  });

  it('nlToSql POSTs /api/ai/nl-to-sql with tables and unwraps result', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { sql: 'SELECT 1', used_tables: ['orders'], safe: true } },
    });
    const out = await nlToSql('多少订单', { tables: ['orders'], locale: 'zh' });
    expect(apiClient.post).toHaveBeenCalledWith('/api/ai/nl-to-sql', {
      question: '多少订单', tables: ['orders'], locale: 'zh',
    });
    expect(out.sql).toBe('SELECT 1');
    expect(out.safe).toBe(true);
    expect(out.used_tables).toEqual(['orders']);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/api/__tests__/aiApi.test.ts`
Expected: FAIL —— `explainSql`/`nlToSql` 未导出。

- [ ] **Step 3: 实现 —— 在 `frontend/src/api/aiApi.ts` 末尾(`errorFix` 之后)追加**

```ts
export interface ExplainSqlResult {
  explanation: string;
}

export async function explainSql(
  sql: string,
  opts?: { locale?: 'zh' | 'en' }
): Promise<ExplainSqlResult> {
  try {
    const res = await apiClient.post('/api/ai/explain-sql', {
      sql,
      locale: opts?.locale ?? 'zh',
    });
    return normalizeResponse<ExplainSqlResult>(res).data;
  } catch (e) {
    throw handleApiError(e as never, 'AI 解释失败');
  }
}

export interface NlToSqlResult {
  sql: string;
  used_tables: string[];
  safe: boolean;
}

export async function nlToSql(
  question: string,
  opts?: { tables?: string[]; locale?: 'zh' | 'en' }
): Promise<NlToSqlResult> {
  try {
    const res = await apiClient.post('/api/ai/nl-to-sql', {
      question,
      tables: opts?.tables ?? [],
      locale: opts?.locale ?? 'zh',
    });
    return normalizeResponse<NlToSqlResult>(res).data;
  } catch (e) {
    throw handleApiError(e as never, 'AI 生成 SQL 失败');
  }
}
```

- [ ] **Step 4: 跑测试确认转绿**

Run: `cd frontend && npx vitest run src/api/__tests__/aiApi.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/api/aiApi.ts frontend/src/api/__tests__/aiApi.test.ts
git commit -m "feat(ai): frontend explainSql/nlToSql api clients"
```

---

## Task 7: 前端 `useAiStatus` 三态派生 hook

spec §5。`configured` 从已有 settings 派生(`enabled && feature 的 provider 或 default_provider 指向一个 enabled 且有 model 的供应商`),零新接口。

**Files:**
- Create: `frontend/src/hooks/useAiStatus.ts`
- Test: `frontend/src/hooks/__tests__/useAiStatus.test.tsx`

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/hooks/__tests__/useAiStatus.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { isFeatureConfigured } from '../useAiStatus';
import type { AiSettings } from '@/api/aiApi';

const base: AiSettings = {
  enabled: true,
  default_provider: 'p1',
  providers: [{ id: 'p1', type: 'openai', api_key: '****', models: ['gpt-4o-mini'], enabled: true }],
  features: {},
};

describe('isFeatureConfigured', () => {
  it('true when enabled + default provider resolves with a model', () => {
    expect(isFeatureConfigured(base, 'explain')).toBe(true);
  });

  it('false when master disabled', () => {
    expect(isFeatureConfigured({ ...base, enabled: false }, 'explain')).toBe(false);
  });

  it('false when provider disabled', () => {
    expect(isFeatureConfigured(
      { ...base, providers: [{ ...base.providers[0], enabled: false }] }, 'explain')).toBe(false);
  });

  it('false when provider has no models', () => {
    expect(isFeatureConfigured(
      { ...base, providers: [{ ...base.providers[0], models: [] }] }, 'explain')).toBe(false);
  });

  it('uses per-feature provider override when set', () => {
    const s: AiSettings = {
      ...base,
      default_provider: 'missing',
      features: { explain: { provider: 'p1', model: null } },
    };
    expect(isFeatureConfigured(s, 'explain')).toBe(true);
  });

  it('false for undefined settings', () => {
    expect(isFeatureConfigured(undefined, 'explain')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/hooks/__tests__/useAiStatus.test.tsx`
Expected: FAIL —— `useAiStatus` 模块不存在。

- [ ] **Step 3: 实现 `frontend/src/hooks/useAiStatus.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { getAiSettings, type AiSettings } from '@/api/aiApi';

/**
 * 纯派生:某 feature 是否「已配置」。
 * 规则:总开关开 && (feature 指定的 provider 或 default_provider) 指向一个 enabled、
 * 且至少有一个 model 的供应商。镜像后端 resolve_feature 的回落逻辑。
 */
export function isFeatureConfigured(s: AiSettings | undefined, feature: string): boolean {
  if (!s || !s.enabled) return false;
  const providerId = s.features?.[feature]?.provider || s.default_provider;
  if (!providerId) return false;
  const p = s.providers.find((pp) => pp.id === providerId);
  return !!p && p.enabled && (p.models?.length ?? 0) > 0;
}

export interface AiStatus {
  enabled: boolean;
  configured: boolean;
}

/** 三态门控:{enabled, configured}。出错/加载中默认全 false(不露出不可用入口)。 */
export function useAiStatus(feature: string): AiStatus {
  const { data } = useQuery({
    queryKey: ['ai-settings', 'full'],
    queryFn: getAiSettings,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return {
    enabled: data?.enabled ?? false,
    configured: isFeatureConfigured(data, feature),
  };
}
```

- [ ] **Step 4: 跑测试确认转绿**

Run: `cd frontend && npx vitest run src/hooks/__tests__/useAiStatus.test.tsx`
Expected: PASS (6 passed)

- [ ] **Step 5: 提交**

```bash
git add frontend/src/hooks/useAiStatus.ts frontend/src/hooks/__tests__/useAiStatus.test.tsx
git commit -m "feat(ai): useAiStatus three-state (enabled/configured) derivation hook"
```

---

## Task 8: 前端透传 `onOpenAiSettings` 回调 + AISettings 锚点

spec §5/§6。沿 `previewSQL` 同款链把「打开设置·AI」回调从 `App` 透传到 `SQLQueryPanel`;给 AISettings 卡片加锚点便于滚动定位。纯机械改动,由 `tsc` 兜底(无独立单测)。

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/QueryWorkbenchPage.tsx`
- Modify: `frontend/src/Query/QueryWorkspace.tsx`
- Modify: `frontend/src/Query/QueryTabs/index.tsx`
- Modify: `frontend/src/Query/SQLQuery/SQLQueryPanel.tsx`
- Modify: `frontend/src/Settings/AISettings.tsx`

- [ ] **Step 1: AISettings 加锚点**

在 `frontend/src/Settings/AISettings.tsx` 第 121 行,把:

```tsx
    <Card>
```

改为:

```tsx
    <Card id="settings-ai">
```

- [ ] **Step 2: SQLQueryPanel 加 prop**

在 `frontend/src/Query/SQLQuery/SQLQueryPanel.tsx` 的 `SQLQueryPanelProps` 接口里(第 57 行 `previewSQL?: string;` 之后)加:

```tsx
  /** 打开设置·AI 标签页(未配置引导用) */
  onOpenAiSettings?: () => void;
```

在解构里(第 73 行 `previewSQL,` 之后)加:

```tsx
  onOpenAiSettings,
```

- [ ] **Step 3: QueryTabs 透传**

在 `frontend/src/Query/QueryTabs/index.tsx` 的 `QueryTabsProps`(第 70 行 `onClearJoinRestoreRequest?: () => void;` 之后)加:

```tsx
  onOpenAiSettings?: () => void;
```

在解构 props 处(第 85 行 `previewSQL: externalPreviewSQL,` 附近)加 `onOpenAiSettings,`。
在渲染 `<SQLQueryPanel ...>`(第 311–317 行)把 prop 传下去:

```tsx
            <SQLQueryPanel
              selectedTables={selectedTables}
              onExecute={onExecute}
              editorMinHeight="150px"
              editorMaxHeight="300px"
              previewSQL={sqlPanelPreview}
              onOpenAiSettings={onOpenAiSettings}
            />
```

- [ ] **Step 4: QueryWorkspace 透传**

在 `frontend/src/Query/QueryWorkspace.tsx` 的 `QueryWorkspaceProps`(第 28 行 `previewSQL?: string;` 之后)加:

```tsx
  onOpenAiSettings?: () => void;
```

第 31 行解构改为 `({ previewSQL, onOpenAiSettings })`。
渲染 `<QueryTabs ...>`(第 236 行 `previewSQL={previewSQL}` 之后)加:

```tsx
                onOpenAiSettings={onOpenAiSettings}
```

- [ ] **Step 5: QueryWorkbenchPage 透传**

在 `frontend/src/QueryWorkbenchPage.tsx` 的 `QueryWorkbenchPageProps`(第 21 行 `onPreviewSQL?: ...` 之后)加:

```tsx
  onOpenAiSettings?: () => void;
```

解构加 `onOpenAiSettings`;第 37 行渲染改为:

```tsx
        <QueryWorkspace previewSQL={previewSQL} onOpenAiSettings={onOpenAiSettings} />
```

- [ ] **Step 6: App 提供实现**

在 `frontend/src/App.tsx` 第 423–431 的 `<QueryWorkbenchPage .../>` 上加 prop(`setCurrentTab` 已在 `renderContent` 闭包作用域内):

```tsx
        <QueryWorkbenchPage
          activeTab={queryWorkbenchTab}
          onTabChange={(tab) => setQueryWorkbenchTab(tab as QueryTabId)}
          previewSQL={previewQuery}
          onPreviewSQL={(sql: string) => {
            setPreviewQuery(sql);
            setQueryWorkbenchTab("query");
          }}
          onOpenAiSettings={() => {
            setCurrentTab("settings");
            setTimeout(
              () => document.getElementById("settings-ai")?.scrollIntoView({
                behavior: "smooth", block: "start",
              }),
              120,
            );
          }}
        />
```

- [ ] **Step 7: 类型检查确认整条链通**

Run: `cd frontend && npx tsc --noEmit`
Expected: EXIT 0(无类型错误)

- [ ] **Step 8: 提交**

```bash
git add frontend/src/App.tsx frontend/src/QueryWorkbenchPage.tsx frontend/src/Query/QueryWorkspace.tsx frontend/src/Query/QueryTabs/index.tsx frontend/src/Query/SQLQuery/SQLQueryPanel.tsx frontend/src/Settings/AISettings.tsx
git commit -m "feat(ai): thread onOpenAiSettings App->SQLQueryPanel + AISettings anchor"
```

---

## Task 9: 前端 P2 ✨ 解释按钮(展示组件)

spec §6。先做可单测的展示组件 `ExplainButton`(ready/guide 两态),Task 10 再连进面板。

**Files:**
- Create: `frontend/src/Query/SQLQuery/ai/ExplainButton.tsx`
- Test: `frontend/src/Query/SQLQuery/ai/__tests__/ExplainButton.test.tsx`

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/Query/SQLQuery/ai/__tests__/ExplainButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n/config';
import { ExplainButton } from '../ExplainButton';

describe('ExplainButton', () => {
  it('ready mode click triggers onExplain (not onOpenSettings)', () => {
    const onExplain = vi.fn();
    const onOpenSettings = vi.fn();
    render(<ExplainButton mode="ready" onExplain={onExplain} onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onExplain).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('guide mode click routes to settings (not explain)', () => {
    const onExplain = vi.fn();
    const onOpenSettings = vi.fn();
    render(<ExplainButton mode="guide" onExplain={onExplain} onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onExplain).not.toHaveBeenCalled();
  });

  it('loading disables the button', () => {
    render(<ExplainButton mode="ready" loading onExplain={vi.fn()} onOpenSettings={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/Query/SQLQuery/ai/__tests__/ExplainButton.test.tsx`
Expected: FAIL —— 组件不存在。

- [ ] **Step 3: 实现 `frontend/src/Query/SQLQuery/ai/ExplainButton.tsx`**

```tsx
import { Sparkles, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface ExplainButtonProps {
  /** ready=已配置可解释; guide=已启用未配置,点击去设置 */
  mode: 'ready' | 'guide';
  loading?: boolean;
  onExplain: () => void;
  onOpenSettings: () => void;
}

export function ExplainButton({ mode, loading, onExplain, onOpenSettings }: ExplainButtonProps) {
  const { t } = useTranslation('common');
  const tip =
    mode === 'guide'
      ? t('query.ai.explainNeedConfig', '需先配置 AI 供应商')
      : t('query.ai.explainTooltip', '用大白话解释当前 SQL');
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={mode === 'guide' ? onOpenSettings : onExplain}
            className="text-muted-foreground hover:text-foreground"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            <span className="hidden sm:inline">{t('query.ai.explain', '解释')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

- [ ] **Step 4: 跑测试确认转绿**

Run: `cd frontend && npx vitest run src/Query/SQLQuery/ai/__tests__/ExplainButton.test.tsx`
Expected: PASS (3 passed)

- [ ] **Step 5: 提交**

```bash
git add frontend/src/Query/SQLQuery/ai/ExplainButton.tsx frontend/src/Query/SQLQuery/ai/__tests__/ExplainButton.test.tsx
git commit -m "feat(ai): ExplainButton presentational component (ready/guide states)"
```

---

## Task 10: 前端 P3 问数条(展示组件)

spec §6。可单测的 `AskBar`(ready/guide 两态 + used-tables chips + 非 SELECT 警告)。

**Files:**
- Create: `frontend/src/Query/SQLQuery/ai/AskBar.tsx`
- Test: `frontend/src/Query/SQLQuery/ai/__tests__/AskBar.test.tsx`

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/Query/SQLQuery/ai/__tests__/AskBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n/config';
import { AskBar } from '../AskBar';

describe('AskBar', () => {
  it('guide mode renders a clickable guidance row -> onOpenSettings', () => {
    const onOpenSettings = vi.fn();
    render(<AskBar mode="guide" onSubmit={vi.fn()} onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('ready mode submits typed question', () => {
    const onSubmit = vi.fn();
    render(<AskBar mode="ready" onSubmit={onSubmit} onOpenSettings={vi.fn()} />);
    fireEvent.change(screen.getByTestId('ask-bar-input'), { target: { value: '多少订单' } });
    fireEvent.click(screen.getByText('生成'));
    expect(onSubmit).toHaveBeenCalledWith('多少订单');
  });

  it('renders used-tables chips', () => {
    render(<AskBar mode="ready" usedTables={['orders', 'customers']} onSubmit={vi.fn()} onOpenSettings={vi.fn()} />);
    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.getByText('customers')).toBeInTheDocument();
  });

  it('does not submit empty/whitespace question', () => {
    const onSubmit = vi.fn();
    render(<AskBar mode="ready" onSubmit={onSubmit} onOpenSettings={vi.fn()} />);
    fireEvent.change(screen.getByTestId('ask-bar-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('生成'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/Query/SQLQuery/ai/__tests__/AskBar.test.tsx`
Expected: FAIL —— 组件不存在。

- [ ] **Step 3: 实现 `frontend/src/Query/SQLQuery/ai/AskBar.tsx`**

```tsx
import { useState } from 'react';
import { Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AskBarProps {
  /** ready=已配置可问数; guide=已启用未配置,整行点击去设置 */
  mode: 'ready' | 'guide';
  loading?: boolean;
  usedTables?: string[];
  warning?: string;
  onSubmit: (question: string) => void;
  onOpenSettings: () => void;
}

export function AskBar({
  mode,
  loading,
  usedTables = [],
  warning,
  onSubmit,
  onOpenSettings,
}: AskBarProps) {
  const { t } = useTranslation('common');
  const [q, setQ] = useState('');

  if (mode === 'guide') {
    return (
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex w-full items-center gap-2 border-b px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        <span>
          {t('query.ai.askGuide', '启用「问数」前,先到 设置 · AI/模型 配置一个供应商')}
        </span>
        <ArrowRight className="ml-auto h-4 w-4" />
      </button>
    );
  }

  const submit = () => {
    const v = q.trim();
    if (v && !loading) onSubmit(v);
  };

  return (
    <div className="border-b">
      <div className="flex items-center gap-2 px-3 py-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={t('query.ai.askPlaceholder', '用自然语言描述你的查询…')}
          className="h-8 border-0 shadow-none focus-visible:ring-0"
          data-testid="ask-bar-input"
        />
        <Button size="sm" disabled={loading || !q.trim()} onClick={submit}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('query.ai.generate', '生成')}
        </Button>
      </div>
      {warning && (
        <div className="px-3 pb-2 text-xs text-warning">{warning}</div>
      )}
      {usedTables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 px-3 pb-2 text-xs text-muted-foreground">
          <span>{t('query.ai.usedTables', '用了哪些表:')}</span>
          {usedTables.map((name) => (
            <span key={name} className="rounded bg-accent px-1.5 py-0.5">
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 跑测试确认转绿**

Run: `cd frontend && npx vitest run src/Query/SQLQuery/ai/__tests__/AskBar.test.tsx`
Expected: PASS (4 passed)

- [ ] **Step 5: 提交**

```bash
git add frontend/src/Query/SQLQuery/ai/AskBar.tsx frontend/src/Query/SQLQuery/ai/__tests__/AskBar.test.tsx
git commit -m "feat(ai): AskBar presentational component (ready/guide + used-tables chips)"
```

---

## Task 11: 前端 i18n 文案(`query.ai.*`,zh + en)

**Files:**
- Modify: `frontend/src/i18n/locales/zh/common.json`
- Modify: `frontend/src/i18n/locales/en/common.json`

- [ ] **Step 1: zh 文案**

在 `frontend/src/i18n/locales/zh/common.json` 的 `"query"` 对象内(任意已有子对象之后,注意逗号)新增:

```json
    "ai": {
      "explain": "解释",
      "explainTooltip": "用大白话解释当前 SQL",
      "explainNeedConfig": "需先配置 AI 供应商",
      "explainFailed": "AI 解释失败",
      "ask": "问数",
      "askPlaceholder": "用自然语言描述你的查询…",
      "askGuide": "启用「问数」前,先到 设置 · AI/模型 配置一个供应商",
      "generate": "生成",
      "usedTables": "用了哪些表:",
      "askFailed": "AI 生成 SQL 失败",
      "notSelectWarn": "生成的不是只读 SELECT,已填入编辑器,请人工确认后再执行"
    },
```

- [ ] **Step 2: en 文案**

在 `frontend/src/i18n/locales/en/common.json` 的 `"query"` 对象内新增:

```json
    "ai": {
      "explain": "Explain",
      "explainTooltip": "Explain the current SQL in plain language",
      "explainNeedConfig": "Configure an AI provider first",
      "explainFailed": "AI explain failed",
      "ask": "Ask",
      "askPlaceholder": "Describe your query in natural language…",
      "askGuide": "To enable Ask, configure a provider under Settings · AI/Model",
      "generate": "Generate",
      "usedTables": "Tables used:",
      "askFailed": "AI failed to generate SQL",
      "notSelectWarn": "The result is not a read-only SELECT; it was inserted for review—please verify before running"
    },
```

- [ ] **Step 3: 校验 JSON 合法 + 类型检查**

Run: `cd frontend && node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/zh/common.json','utf8')); JSON.parse(require('fs').readFileSync('src/i18n/locales/en/common.json','utf8')); console.log('json ok')" && npx tsc --noEmit`
Expected: 打印 `json ok` 且 tsc EXIT 0

- [ ] **Step 4: 提交**

```bash
git add frontend/src/i18n/locales/zh/common.json frontend/src/i18n/locales/en/common.json
git commit -m "feat(ai): query.ai i18n strings (zh/en)"
```

---

## Task 12: 前端把 AskBar + ExplainButton 接进 SQLQueryPanel(三态联通)

spec §5/§6。这是把后端 + 组件 + 三态门控全部接通的核心 wiring。

**Files:**
- Modify: `frontend/src/Query/SQLQuery/SQLToolbar.tsx`(加 `aiSlot` 槽位)
- Modify: `frontend/src/Query/SQLQuery/SQLQueryPanel.tsx`(状态 + handlers + 渲染)

- [ ] **Step 1: SQLToolbar 加槽位**

在 `frontend/src/Query/SQLQuery/SQLToolbar.tsx` 的 `SQLToolbarProps`(第 39 行 `extraContent?: React.ReactNode;` 之后)加:

```tsx
  /** 左侧按钮组尾部插槽(AI ✨ 解释按钮) */
  aiSlot?: React.ReactNode;
```

解构 props 处加 `aiSlot`。在左侧按钮组的收尾处 —— 即收藏按钮 `<Tooltip>` 块结束(第 205 行 `)}`)与该左侧组 `<div>` 的闭合 `</div>`(第 207 行)之间 —— 插入:

```tsx
          {aiSlot}
```

- [ ] **Step 2: SQLQueryPanel —— 加 imports**

在 `frontend/src/Query/SQLQuery/SQLQueryPanel.tsx` 顶部 import 区加:

```tsx
import { useAiStatus } from '@/hooks/useAiStatus';
import { explainSql, nlToSql } from '@/api/aiApi';
import { getApiErrorCode } from '@/api/client';
import { showErrorToast } from '@/utils/toastHelpers';
import { ExplainButton } from './ai/ExplainButton';
import { AskBar } from './ai/AskBar';
```

把已有的 `const { t } = useTranslation('common');`(第 75 行)改为同时取 `i18n`:

```tsx
  const { t, i18n } = useTranslation('common');
```

- [ ] **Step 3: SQLQueryPanel —— 加状态与 handlers**

在组件体内(`useSQLEditor(...)` 解构之后、`return` 之前的合适位置)加:

```tsx
  // ===== AI:P2 解释 + P3 问数(三态门控) =====
  const explainStatus = useAiStatus('explain');
  const askStatus = useAiStatus('nl_to_sql');
  const aiLocale: 'zh' | 'en' = i18n.language?.startsWith('zh') ? 'zh' : 'en';
  const openAiSettings = onOpenAiSettings ?? (() => {});

  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [asking, setAsking] = useState(false);
  const [usedTables, setUsedTables] = useState<string[]>([]);
  const [askWarning, setAskWarning] = useState<string | undefined>(undefined);

  const runExplain = async () => {
    if (!sql.trim()) return;
    setExplaining(true);
    setExplanation(null);
    try {
      const r = await explainSql(sql, { locale: aiLocale });
      setExplanation(r.explanation);
    } catch (e) {
      if (getApiErrorCode(e) === 'ai_not_configured') openAiSettings();
      else showErrorToast(t, e as Error, t('query.ai.explainFailed', 'AI 解释失败'));
    } finally {
      setExplaining(false);
    }
  };

  const runAsk = async (question: string) => {
    setAsking(true);
    setAskWarning(undefined);
    try {
      const tableNames = (selectedTables || []).map((x) =>
        typeof x === 'string' ? x : x.name,
      );
      const r = await nlToSql(question, { tables: tableNames, locale: aiLocale });
      if (r.sql) setSQL(r.sql); // 落入编辑器,绝不自动执行
      setUsedTables(r.used_tables || []);
      if (!r.safe) {
        setAskWarning(
          t('query.ai.notSelectWarn', '生成的不是只读 SELECT,已填入编辑器,请人工确认后再执行'),
        );
      }
    } catch (e) {
      if (getApiErrorCode(e) === 'ai_not_configured') openAiSettings();
      else showErrorToast(t, e as Error, t('query.ai.askFailed', 'AI 生成 SQL 失败'));
    } finally {
      setAsking(false);
    }
  };
```

- [ ] **Step 4: SQLQueryPanel —— 渲染问数条 / ✨ 按钮 / 解释面板**

在 `return (`(第 401 行)之后、第一段警告之前,插入问数条(P3):

```tsx
      {/* P3 问数条(总开关开才出;未配置走引导态) */}
      {askStatus.enabled && (
        <AskBar
          mode={askStatus.configured ? 'ready' : 'guide'}
          loading={asking}
          usedTables={usedTables}
          warning={askWarning}
          onSubmit={runAsk}
          onOpenSettings={openAiSettings}
        />
      )}
```

在 `<SQLToolbar ...>` 的 props 里(第 437 行 `extraContent={...}` 之前或之后均可)加 `aiSlot`(P2):

```tsx
        aiSlot={
          explainStatus.enabled ? (
            <ExplainButton
              mode={explainStatus.configured ? 'ready' : 'guide'}
              loading={explaining}
              onExplain={runExplain}
              onOpenSettings={openAiSettings}
            />
          ) : undefined
        }
```

在 `<SQLToolbar ... />` 闭合(第 455 行)之后、编辑器 `<div>`(第 457 行 `{/* 编辑器 */}`)之前,插入解释面板:

```tsx
      {/* P2 解释结果(工具栏下方柔和内联面板) */}
      {explanation && (
        <div className="mx-3 mt-2 whitespace-pre-wrap rounded-lg border p-3 text-sm text-foreground">
          {explanation}
        </div>
      )}
```

- [ ] **Step 5: 类型检查 + 全量前端测试**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc EXIT 0;vitest 全绿(含新加的 aiApi / useAiStatus / ExplainButton / AskBar 用例)。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/Query/SQLQuery/SQLToolbar.tsx frontend/src/Query/SQLQuery/SQLQueryPanel.tsx
git commit -m "feat(ai): wire AskBar + ExplainButton into SQLQueryPanel with three-state gating"
```

---

## Task 13: ⌘K 命令(问数 / 解释 SQL),受 AI 门控

spec §6。v1 为「导航到查询工作台」(问数条常驻可见);聚焦/直接触发为日后增强(见末尾备注)。

**Files:**
- Modify: `frontend/src/components/CommandPalette.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: CommandPalette 加门控命令**

在 `frontend/src/components/CommandPalette.tsx`:
- lucide import(第 3–14 行)加入 `Sparkles`。
- 顶部(其它 hook 如 `useShortcuts()` 旁,第 48 行附近)加:

```tsx
  const aiEnabled = useAiEnabled();
```

并在 import 区加 `import { useAiEnabled } from '@/hooks/useAiEnabled';`。
- 在「Quick Actions」分组(第 158 行 `<CommandGroup heading=...>` 内)加入两条门控命令:

```tsx
          {aiEnabled && (
            <>
              <CommandItem onSelect={() => runCommand(() => onAction?.("aiAsk"))}>
                <Sparkles className="mr-2 h-4 w-4" />
                <span>{t("command.aiAsk", "问数")}</span>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => onAction?.("aiExplain"))}>
                <Sparkles className="mr-2 h-4 w-4" />
                <span>{t("command.aiExplain", "解释 SQL")}</span>
              </CommandItem>
            </>
          )}
```

- [ ] **Step 2: App 处理命令**

在 `frontend/src/App.tsx` 的 `handleCommandAction`(含 `case "settings":` 的 switch,第 268 行附近)加两个 case:

```tsx
      case "aiAsk":
      case "aiExplain":
        setCurrentTab("queryworkbench");
        setQueryWorkbenchTab("query");
        break;
```

- [ ] **Step 3: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: EXIT 0

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/CommandPalette.tsx frontend/src/App.tsx
git commit -m "feat(ai): gated command-palette entries for Ask / Explain SQL"
```

---

## Task 14: 联通核验(契约回归 + 三态手测清单 + 全量套件)

spec §9 step 7。无新代码,做收口验证。

- [ ] **Step 1: 后端全量 AI 套件**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_router.py tests/test_ai_explain.py tests/test_ai_nl_to_sql.py tests/test_retriever.py tests/test_llm_context.py tests/test_ai_config.py tests/test_llm_service.py tests/test_crypto.py -q`
Expected: 全绿。

- [ ] **Step 2: 前端全量测试 + 类型检查 + 构建**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx vite build`
Expected: tsc EXIT 0;vitest 全绿;build 成功。

- [ ] **Step 3: 后端整库回归(确认没破坏其它)**

Run: `cd api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest -q`
Expected: 仅 `test_duckdb_pool.py` 的 2 个预存在失败(与本计划无关),其余全绿。

- [ ] **Step 4: 三态联通手测(需 `docker compose build` 出前端 + 起服务)**

按下表逐项核对(每项打勾):

| 场景 | 操作 | 期望 |
|------|------|------|
| ① 总开关关(默认) | 设置里 AI 不启用 | 问数条 / ✨ 解释 / ⌘K 两项 **全部不出现** |
| ② 启用未配置 | 启用 AI 但不加供应商 | 问数条显示**引导行**(点击跳设置并滚动到 AI 卡);✨ 按钮显示,点击**不发请求**直接跳设置;**无红色 toast** |
| ③ 已配置 - 解释 | 配好供应商后点 ✨ 解释 | 工具栏下方出现解释面板 |
| ③ 已配置 - 问数 | 输入"每个客户多少订单",点生成 | SQL **落入编辑器但不自动执行**;显示「用了哪些表」chips |
| ③ 安全闸 | 诱导模型产出非 SELECT(或后端 mock) | SQL 仍填入,显示「请人工确认」警告,**不**自动跑 |
| 运行时兜底 | 配置后把供应商 key 改错再问数 | 走柔和 toast(非 ai_not_configured 路径) |

- [ ] **Step 5: 标记完成**

无代码改动则无需提交;若手测中发现并修了小问题,单独提交(信息如 `fix(ai): ...`,仍无 agent 署名)。

---

## Self-Review(写计划后自查,已执行)

**1. Spec 覆盖**
- §2 KeywordRetriever/接口 → Task 2 ✅
- §3 非流式 POST → 所有路由均同步 JSON POST ✅
- §4.1 retriever/llm_context/ai_explain/ai_nl_to_sql/prompts/路由 → Task 2–5 ✅
- §4.2 SELECT-only 安全闸 + 只发 schema + 复用 `_is_select_only` + litellm 可选 → Task 5 ✅
- §4.3 错误码 ai_disabled/ai_not_configured(含 error-fix 回填) → Task 1 ✅
- §5 三态空状态(configured 派生 + 引导不报错 + 运行时兜底 CTA) → Task 7/12 ✅
- §6 入口:✨ 工具栏按钮 / 常驻问数条 / ⌘K / aiApi / useAiStatus / i18n → Task 6/8/9/10/11/12/13 ✅
- §7 FE-BE 契约 → 路由测试 + aiApi 测试双向锚定 ✅
- §8 测试策略(LLM 全 mock) → 每 Task 均 TDD ✅
- §9 分步落地 → Task 1–14 一一对应(地基/P2 后/P2 前/P3 后/P3 前/⌘K/联通) ✅

**2. Placeholder 扫描**:无 TBD/TODO/"类似上文";每个改动步骤都给了完整代码或精确 file:line 锚点 + 插入内容。

**3. 类型一致**:`explainSql`/`nlToSql` 返回类型(`ExplainSqlResult`/`NlToSqlResult`)= 后端 `data` 形态(`{explanation}` / `{sql,used_tables,safe}`);`useAiStatus`/`isFeatureConfigured` 在 Task 7 定义、Task 12 使用一致;`ExplainButton`/`AskBar` 的 props(`mode`/`onExplain`/`onSubmit`/`onOpenSettings`/`usedTables`/`warning`)在定义(Task 9/10)与挂载(Task 12)处一致;`onOpenAiSettings` 贯穿 Task 8 全链与 Task 12 使用一致;后端功能位名 `"explain"`/`"nl_to_sql"` 在服务层(Task 4/5)与前端 `useAiStatus('explain'|'nl_to_sql')`(Task 7/12)一致。

## 已知简化 / 日后增强(非阻断)
- SQL 历史 few-shot v1 传空(`llm_context.build_nl2sql_context` 的 `history` 接口已留);接上用户历史日后零改动。
- ⌘K v1 仅导航到工作台,不聚焦输入框/直接触发解释(需 ref/事件总线,刻意不引,避免"过重")。
- 联邦表 DDL:`_build_schema_text` 用裸表名 `DESCRIBE "name"`,跨库 schema 限定名可能 DESCRIBE 失败被跳过(已 try/except);方言备忘里已给联邦语法引导兜底。
- VectorRetriever 作 `Retriever` 第二实现日后加,上层零改动(接口即保险)。
