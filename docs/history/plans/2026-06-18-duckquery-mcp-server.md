# DuckQuery MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `duckquery-mcp`, a standalone Python stdio MCP server that exposes the locally-running DuckQuery backend as MCP tools so Claude Code / Cursor / Codex can drive it via AI.

**Architecture:** A thin async HTTP adapter. Each MCP tool maps args → one DuckQuery HTTP call → unwraps the `{success,data,...}` envelope → returns compact JSON. The backend base URL is auto-discovered (env → `runtime.json` → port probe, each `/health`-verified). A safety mode (`read-only`/`normal`/`full`) decides which tools register and which need `confirm`.

**Tech Stack:** Python 3.10+, official `mcp` SDK (`FastMCP`), `httpx` (async), `pytest` + `pytest-asyncio`. Distributed via `uv`/`uvx` and PyPI. Lives in repo subdir `mcp/`.

**Design spec:** [docs/history/designs/2026-06-18-duckquery-mcp-server-design.md](../designs/2026-06-18-duckquery-mcp-server-design.md)

**Branch:** `feat_mcp_server` (already cut from `main`). Soft dep on `feat_service_ports` (port 48001) — the probe list includes legacy 8000/8001, so order of merge doesn't matter.

---

## File Structure

```
mcp/
  pyproject.toml                 # package metadata, entry point `duckquery-mcp`, deps
  README.md                      # install + per-CLI config snippets
  duckquery_mcp/
    __init__.py
    __main__.py                  # `python -m duckquery_mcp` → run stdio server
    config.py                    # env → Config (api_base, mode, timeout, row_cap, probe_ports)
    client.py                    # DuckQueryClient: discovery, /health, call() + envelope unwrap
    safety.py                    # SQL read/write classification; mode → allowed tools
    server.py                    # build FastMCP, register tools by mode, run stdio
    tools/
      __init__.py                # register_all(mcp, client, cfg)
      query.py                   # run_sql, federated_query, ask, explain_sql, suggest_chart, chat, error_fix
      discover.py                # list_tables, describe_table, list_connections, list_db_objects
      sources.py                 # add_connection, add_local_file_source, import_excel, paste_data, read_url
      transform.py               # save_as_table, pivot, set_operations
      ai_settings.py             # get_ai_settings, configure_llm, test_llm_provider
      export.py                  # export_results
      passthrough.py             # duckquery_request
  tests/
    conftest.py                  # fixtures: fake backend (respx), Config factory
    test_config.py
    test_client.py
    test_safety.py
    test_tools_query.py
    test_tools_sources.py
    test_passthrough.py
    test_integration.py          # opt-in: against a real backend (env-gated)
```

Backend addition (separate tasks):
```
api/core/common/paths.py         # + get_runtime_file()
api/run.py                       # write runtime.json on desktop startup
api/main.py                      # FastAPI lifespan: write runtime.json (manual runs)
api/tests/test_runtime_file.py
```

---

## Task 1: Scaffold the package

**Files:**
- Create: `mcp/pyproject.toml`, `mcp/duckquery_mcp/__init__.py`, `mcp/duckquery_mcp/__main__.py`, `mcp/README.md`
- Create: `mcp/duckquery_mcp/tools/__init__.py` (empty for now)

- [ ] **Step 1: Write `mcp/pyproject.toml`**

```toml
[project]
name = "duckquery-mcp"
version = "0.1.0"
description = "MCP server for a locally-running DuckQuery backend"
requires-python = ">=3.10"
dependencies = ["mcp>=1.2.0", "httpx>=0.27"]

[project.scripts]
duckquery-mcp = "duckquery_mcp.__main__:main"

[project.optional-dependencies]
dev = ["pytest>=8", "pytest-asyncio>=0.23", "respx>=0.21"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 2: Write `mcp/duckquery_mcp/__init__.py`**

```python
__version__ = "0.1.0"
```

- [ ] **Step 3: Write `mcp/duckquery_mcp/__main__.py` (stub)**

```python
def main() -> None:
    from duckquery_mcp.server import run
    run()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Create empty `mcp/duckquery_mcp/tools/__init__.py`**

```python
```

- [ ] **Step 5: Verify the package installs**

Run: `cd mcp && pip install -e ".[dev]"`
Expected: installs without error (`server` import will fail only at runtime, which is fine for now).

- [ ] **Step 6: Commit**

```bash
git add mcp/pyproject.toml mcp/duckquery_mcp/__init__.py mcp/duckquery_mcp/__main__.py mcp/duckquery_mcp/tools/__init__.py mcp/README.md
git commit -m "feat(mcp): scaffold duckquery-mcp package"
```

---

## Task 2: Config from environment

**Files:**
- Create: `mcp/duckquery_mcp/config.py`
- Test: `mcp/tests/test_config.py`

- [ ] **Step 1: Write the failing test**

```python
# mcp/tests/test_config.py
import pytest
from duckquery_mcp.config import load_config, MODES


def test_defaults(monkeypatch):
    for k in ("DUCKQUERY_API_BASE", "DUCKQUERY_MCP_MODE", "DUCKQUERY_MCP_ROW_CAP"):
        monkeypatch.delenv(k, raising=False)
    cfg = load_config()
    assert cfg.api_base is None
    assert cfg.mode == "normal"
    assert cfg.row_cap == 200
    assert cfg.probe_ports == (48001, 8000, 8001)


def test_env_override(monkeypatch):
    monkeypatch.setenv("DUCKQUERY_API_BASE", "http://127.0.0.1:9999")
    monkeypatch.setenv("DUCKQUERY_MCP_MODE", "read-only")
    cfg = load_config()
    assert cfg.api_base == "http://127.0.0.1:9999"
    assert cfg.mode == "read-only"


def test_bad_mode(monkeypatch):
    monkeypatch.setenv("DUCKQUERY_MCP_MODE", "bogus")
    with pytest.raises(SystemExit):
        load_config()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd mcp && pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: duckquery_mcp.config`

- [ ] **Step 3: Write `mcp/duckquery_mcp/config.py`**

```python
import os
from dataclasses import dataclass

MODES = ("read-only", "normal", "full")


@dataclass(frozen=True)
class Config:
    api_base: str | None
    mode: str
    timeout: float
    row_cap: int
    probe_ports: tuple[int, ...]


def load_config() -> Config:
    mode = os.getenv("DUCKQUERY_MCP_MODE", "normal")
    if mode not in MODES:
        raise SystemExit(f"DUCKQUERY_MCP_MODE must be one of {MODES}, got {mode!r}")
    return Config(
        api_base=os.getenv("DUCKQUERY_API_BASE") or None,
        mode=mode,
        timeout=float(os.getenv("DUCKQUERY_MCP_TIMEOUT", "120")),
        row_cap=int(os.getenv("DUCKQUERY_MCP_ROW_CAP", "200")),
        probe_ports=(48001, 8000, 8001),
    )
```

- [ ] **Step 4: Run to verify pass**

Run: `cd mcp && pytest tests/test_config.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add mcp/duckquery_mcp/config.py mcp/tests/test_config.py
git commit -m "feat(mcp): config from environment"
```

---

## Task 3: Backend discovery + /health

**Files:**
- Create: `mcp/duckquery_mcp/client.py`
- Test: `mcp/tests/test_client.py`, `mcp/tests/conftest.py`

- [ ] **Step 1: Write `mcp/tests/conftest.py`**

```python
import pytest
from duckquery_mcp.config import Config


@pytest.fixture
def cfg():
    return Config(api_base=None, mode="normal", timeout=5.0,
                  row_cap=200, probe_ports=(48001, 8000, 8001))
```

- [ ] **Step 2: Write the failing discovery test**

```python
# mcp/tests/test_client.py
import respx
import httpx
import pytest
from duckquery_mcp.client import DuckQueryClient, BackendNotFound


@respx.mock
async def test_probe_finds_healthy_backend(cfg):
    respx.get("http://127.0.0.1:48001/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    client = DuckQueryClient(cfg)
    assert await client.base() == "http://127.0.0.1:48001"


@respx.mock
async def test_env_base_wins(cfg):
    cfg = cfg.__class__(**{**cfg.__dict__, "api_base": "http://127.0.0.1:7000"})
    respx.get("http://127.0.0.1:7000/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    client = DuckQueryClient(cfg)
    assert await client.base() == "http://127.0.0.1:7000"


@respx.mock
async def test_none_found_raises(cfg):
    respx.get(url__regex=r".*/health").mock(return_value=httpx.Response(503))
    client = DuckQueryClient(cfg)
    with pytest.raises(BackendNotFound):
        await client.base()
```

- [ ] **Step 3: Run to verify fail**

Run: `cd mcp && pytest tests/test_client.py -v`
Expected: FAIL with `ModuleNotFoundError: duckquery_mcp.client`

- [ ] **Step 4: Write `mcp/duckquery_mcp/client.py` (discovery half)**

```python
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx


class BackendNotFound(Exception):
    pass


class BackendError(Exception):
    pass


def runtime_file() -> Path:
    """Mirror api/core/common/paths.get_user_data_dir() / 'runtime.json'."""
    home = Path(os.path.expanduser("~"))
    if sys.platform == "darwin":
        base = home / "Library" / "Application Support" / "DuckQuery"
    elif sys.platform.startswith("win"):
        base = Path(os.getenv("APPDATA") or home) / "DuckQuery"
    else:
        base = home / ".local" / "share" / "DuckQuery"
    return base / "runtime.json"


class DuckQueryClient:
    def __init__(self, cfg) -> None:
        self.cfg = cfg
        self._base: str | None = None
        self._http = httpx.AsyncClient(timeout=cfg.timeout)

    async def _healthy(self, base: str) -> bool:
        try:
            r = await self._http.get(f"{base}/health")
            return r.status_code == 200 and r.json().get("status") == "healthy"
        except Exception:
            return False

    async def base(self) -> str:
        if self._base and await self._healthy(self._base):
            return self._base
        # 1. explicit env
        if self.cfg.api_base and await self._healthy(self.cfg.api_base):
            self._base = self.cfg.api_base
            return self._base
        # 2. runtime.json
        rf = runtime_file()
        if rf.exists():
            try:
                b = json.loads(rf.read_text()).get("base")
                if b and await self._healthy(b):
                    self._base = b
                    return self._base
            except Exception:
                pass
        # 3. probe known ports
        for port in self.cfg.probe_ports:
            b = f"http://127.0.0.1:{port}"
            if await self._healthy(b):
                self._base = b
                return self._base
        raise BackendNotFound(
            "DuckQuery backend not found — start the DuckQuery app "
            "or set DUCKQUERY_API_BASE."
        )
```

- [ ] **Step 5: Run to verify pass**

Run: `cd mcp && pytest tests/test_client.py -v`
Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add mcp/duckquery_mcp/client.py mcp/tests/conftest.py mcp/tests/test_client.py
git commit -m "feat(mcp): backend discovery via env/runtime.json/probe + health"
```

---

## Task 4: `call()` with envelope unwrap

**Files:**
- Modify: `mcp/duckquery_mcp/client.py` (add `call`)
- Test: `mcp/tests/test_client.py` (append)

- [ ] **Step 1: Write the failing test (append to test_client.py)**

```python
@respx.mock
async def test_call_unwraps_success_envelope(cfg):
    respx.get("http://127.0.0.1:48001/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.post("http://127.0.0.1:48001/api/duckdb/execute").mock(
        return_value=httpx.Response(200, json={
            "success": True, "data": {"row_count": 1, "data": [{"n": 16}]},
            "messageCode": "QUERY_EXECUTED"}))
    client = DuckQueryClient(cfg)
    out = await client.call("POST", "/api/duckdb/execute", json_body={"sql": "SELECT 8+8 AS n"})
    assert out["row_count"] == 1


@respx.mock
async def test_call_raises_on_failure_envelope(cfg):
    respx.get("http://127.0.0.1:48001/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.post("http://127.0.0.1:48001/api/duckdb/execute").mock(
        return_value=httpx.Response(200, json={
            "success": False, "message": "syntax error", "messageCode": "QUERY_FAILED"}))
    client = DuckQueryClient(cfg)
    with pytest.raises(BackendError, match="syntax error"):
        await client.call("POST", "/api/duckdb/execute", json_body={"sql": "SELEC 1"})
```

- [ ] **Step 2: Run to verify fail**

Run: `cd mcp && pytest tests/test_client.py -k call -v`
Expected: FAIL with `AttributeError: 'DuckQueryClient' object has no attribute 'call'`

- [ ] **Step 3: Add `call` to `DuckQueryClient`**

```python
    async def call(self, method: str, path: str, *, json_body: Any = None,
                   params: dict | None = None) -> Any:
        base = await self.base()
        r = await self._http.request(method, f"{base}{path}", json=json_body, params=params)
        try:
            payload = r.json()
        except Exception:
            r.raise_for_status()
            return {"raw": r.text}
        if isinstance(payload, dict):
            if payload.get("success") is False:
                raise BackendError(payload.get("message") or payload.get("messageCode") or "request failed")
            if "data" in payload:
                return payload["data"]
        return payload
```

- [ ] **Step 4: Run to verify pass**

Run: `cd mcp && pytest tests/test_client.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add mcp/duckquery_mcp/client.py mcp/tests/test_client.py
git commit -m "feat(mcp): client.call with envelope unwrap"
```

---

## Task 5: Safety classification

**Files:**
- Create: `mcp/duckquery_mcp/safety.py`
- Test: `mcp/tests/test_safety.py`

- [ ] **Step 1: Write the failing test**

```python
# mcp/tests/test_safety.py
from duckquery_mcp.safety import is_write_sql, tool_allowed


def test_read_sql():
    assert is_write_sql("SELECT * FROM t") is False
    assert is_write_sql("  with x as (select 1) select * from x") is False


def test_write_sql():
    assert is_write_sql("DROP TABLE t") is True
    assert is_write_sql("delete from t") is True
    assert is_write_sql("garbage") is True  # unknown → treat as write


def test_tool_allowed_by_mode():
    # (tool_tier, mode) -> allowed
    assert tool_allowed("read", "read-only") is True
    assert tool_allowed("write", "read-only") is False
    assert tool_allowed("write", "normal") is True
    assert tool_allowed("write", "full") is True
```

- [ ] **Step 2: Run to verify fail**

Run: `cd mcp && pytest tests/test_safety.py -v`
Expected: FAIL `ModuleNotFoundError: duckquery_mcp.safety`

- [ ] **Step 3: Write `mcp/duckquery_mcp/safety.py`**

```python
import re

_READ = re.compile(r"^\s*(SELECT|WITH|EXPLAIN|PRAGMA|DESCRIBE|SHOW)\b", re.I)


def is_write_sql(sql: str) -> bool:
    """True unless the statement is clearly read-only."""
    return _READ.match(sql or "") is None


def tool_allowed(tier: str, mode: str) -> bool:
    """tier: 'read' | 'write'. mode: 'read-only' | 'normal' | 'full'."""
    if mode == "full":
        return True
    if mode == "normal":
        return True
    return tier == "read"  # read-only
```

- [ ] **Step 4: Run to verify pass**

Run: `cd mcp && pytest tests/test_safety.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add mcp/duckquery_mcp/safety.py mcp/tests/test_safety.py
git commit -m "feat(mcp): SQL read/write classification + mode gating"
```

---

## Task 6: Server + `run_sql` tool (canonical pattern)

This task establishes the tool pattern every later tool follows: a thin async function that calls `client.call`, truncates rows, and is registered only when its tier is allowed by the mode. Read it carefully — later tasks reuse `_truncate` and the registration shape.

**Files:**
- Create: `mcp/duckquery_mcp/server.py`, `mcp/duckquery_mcp/tools/query.py`
- Modify: `mcp/duckquery_mcp/tools/__init__.py`
- Test: `mcp/tests/test_tools_query.py`

- [ ] **Step 1: Write the failing test**

```python
# mcp/tests/test_tools_query.py
import respx
import httpx
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.query import run_sql


@respx.mock
async def test_run_sql_returns_rows(cfg):
    respx.get("http://127.0.0.1:48001/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.post("http://127.0.0.1:48001/api/duckdb/execute").mock(
        return_value=httpx.Response(200, json={
            "success": True,
            "data": {"columns": ["n"], "data": [{"n": 16}], "row_count": 1},
            "messageCode": "QUERY_EXECUTED"}))
    client = DuckQueryClient(cfg)
    out = await run_sql(client, cfg, sql="SELECT 8+8 AS n")
    assert out["row_count"] == 1
    assert out["rows"] == [{"n": 16}]
    assert out["truncated"] is False


@respx.mock
async def test_run_sql_truncates(cfg):
    cfg = cfg.__class__(**{**cfg.__dict__, "row_cap": 2})
    respx.get("http://127.0.0.1:48001/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.post("http://127.0.0.1:48001/api/duckdb/execute").mock(
        return_value=httpx.Response(200, json={
            "success": True,
            "data": {"columns": ["n"], "data": [{"n": i} for i in range(5)], "row_count": 5},
            "messageCode": "QUERY_EXECUTED"}))
    client = DuckQueryClient(cfg)
    out = await run_sql(client, cfg, sql="SELECT * FROM big")
    assert len(out["rows"]) == 2
    assert out["truncated"] is True
    assert out["row_count"] == 5


async def test_run_sql_blocks_write_in_readonly(cfg):
    ro = cfg.__class__(**{**cfg.__dict__, "mode": "read-only"})
    out = await run_sql(None, ro, sql="DROP TABLE t")  # short-circuits before any HTTP call
    assert "read-only" in out["error"].lower()
```

- [ ] **Step 2: Run to verify fail**

Run: `cd mcp && pytest tests/test_tools_query.py -v`
Expected: FAIL `ModuleNotFoundError: duckquery_mcp.tools.query`

- [ ] **Step 3: Write `mcp/duckquery_mcp/tools/query.py` (run_sql + shared `_truncate`)**

```python
from typing import Any

from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.config import Config


def _truncate(data: dict, cfg: Config) -> dict:
    """Compact a /execute-style result; cap rows at cfg.row_cap."""
    rows = data.get("data") or []
    capped = rows[: cfg.row_cap]
    return {
        "columns": data.get("columns"),
        "rows": capped,
        "row_count": data.get("row_count", len(rows)),
        "truncated": len(rows) > len(capped),
    }


async def run_sql(client: DuckQueryClient, cfg: Config, *, sql: str, preview: bool = True) -> Any:
    """Run DuckDB SQL against local tables. Returns columns + (capped) rows."""
    from duckquery_mcp.safety import is_write_sql
    if cfg.mode == "read-only" and is_write_sql(sql):
        return {"error": "read-only mode: only SELECT / WITH / EXPLAIN are allowed."}
    data = await client.call("POST", "/api/duckdb/execute",
                             json_body={"sql": sql, "is_preview": preview})
    return _truncate(data, cfg)
```

- [ ] **Step 4: Run to verify pass**

Run: `cd mcp && pytest tests/test_tools_query.py -v`
Expected: 2 passed

- [ ] **Step 5: Write `mcp/duckquery_mcp/server.py`**

```python
from mcp.server.fastmcp import FastMCP

from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.config import load_config
from duckquery_mcp.tools import register_all


def build() -> FastMCP:
    cfg = load_config()
    client = DuckQueryClient(cfg)
    mcp = FastMCP("duckquery")
    register_all(mcp, client, cfg)
    return mcp


def run() -> None:
    build().run()  # stdio transport by default
```

- [ ] **Step 6: Write `mcp/duckquery_mcp/tools/__init__.py` (registration + run_sql wiring)**

```python
from mcp.server.fastmcp import FastMCP

from duckquery_mcp.client import BackendError, BackendNotFound, DuckQueryClient
from duckquery_mcp.config import Config
from duckquery_mcp.safety import tool_allowed
from duckquery_mcp.tools import query


def _err(exc: Exception) -> dict:
    return {"error": str(exc)}


def register_all(mcp: FastMCP, client: DuckQueryClient, cfg: Config) -> None:
    def add(tier: str):
        """Decorator: register tool only if its tier is allowed by the mode,
        and wrap backend errors into a clean {error: ...} result."""
        def deco(fn):
            if not tool_allowed(tier, cfg.mode):
                return fn
            async def wrapped(**kwargs):
                try:
                    return await fn(client, cfg, **kwargs)
                except (BackendNotFound, BackendError) as exc:
                    return _err(exc)
            wrapped.__name__ = fn.__name__
            wrapped.__doc__ = fn.__doc__
            mcp.tool()(wrapped)
            return fn
        return deco

    add("read")(query.run_sql)
    # later tasks append more tools here (or in per-group register() helpers)
```

- [ ] **Step 7: Smoke-import the server**

Run: `cd mcp && python -c "from duckquery_mcp.server import build; build(); print('ok')"`
Expected: prints `ok` (tools registered; no backend needed to build).

- [ ] **Step 8: Commit**

```bash
git add mcp/duckquery_mcp/server.py mcp/duckquery_mcp/tools/query.py mcp/duckquery_mcp/tools/__init__.py mcp/tests/test_tools_query.py
git commit -m "feat(mcp): server skeleton + run_sql tool (canonical pattern)"
```

---

## Task 7: Remaining query/AI tools

Add to `tools/query.py`, following the `run_sql` pattern (each is a thin `client.call`). Register each in `tools/__init__.py` with the listed tier.

**Files:**
- Modify: `mcp/duckquery_mcp/tools/query.py`, `mcp/duckquery_mcp/tools/__init__.py`
- Test: `mcp/tests/test_tools_query.py` (append one representative test)

Tools to add (all tier `read` — none of these mutate; `ask` runs SELECT it generated):

| Tool | Signature | Call |
|---|---|---|
| `federated_query` | `(sql, attach_databases: list)` | `POST /api/duckdb/federated-query` body `{sql, attach_databases, is_preview:true}` → `_truncate` |
| `ask` | `(question, tables: list = [], locale="zh")` | `POST /api/ai/nl-to-sql` body `{question, tables, locale}` (per `NlToSqlPayload`, api/routers/ai.py:~190) → returns `{sql, ...}`; then `run_sql(client, cfg, sql=that_sql)` and return `{generated_sql, **result}` |
| `explain_sql` | `(sql)` | `POST /api/ai/explain-sql` body `{sql}` → return as-is |
| `suggest_chart` | `(sql)` | `POST /api/ai/suggest-chart` body per route (api/routers/ai.py) → return as-is |
| `chat` | `(message, history: list = [])` | `POST /api/ai/chat` body per route → return as-is |
| `error_fix` | `(sql, error_message)` | `POST /api/ai/error-fix` body `{sql, error: error_message}` per route → return as-is |

> The exact body field names for `suggest_chart`/`chat`/`error_fix` are the payload models in `api/routers/ai.py`; read that file and match field names. `ask`/`explain_sql`/`nl-to-sql` are confirmed above.

- [ ] **Step 1: Write a representative failing test (append)**

```python
@respx.mock
async def test_ask_generates_then_runs(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.post(f"{base}/api/ai/nl-to-sql").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"sql": "SELECT 1 AS n"}}))
    respx.post(f"{base}/api/duckdb/execute").mock(
        return_value=httpx.Response(200, json={"success": True,
            "data": {"columns": ["n"], "data": [{"n": 1}], "row_count": 1}}))
    from duckquery_mcp.tools.query import ask
    client = DuckQueryClient(cfg)
    out = await ask(client, cfg, question="how many?")
    assert out["generated_sql"] == "SELECT 1 AS n"
    assert out["rows"] == [{"n": 1}]
```

- [ ] **Step 2: Run to verify fail**

Run: `cd mcp && pytest tests/test_tools_query.py -k ask -v`
Expected: FAIL `ImportError: cannot import name 'ask'`

- [ ] **Step 3: Implement the six functions in `tools/query.py`**

```python
async def federated_query(client, cfg, *, sql: str, attach_databases: list) -> Any:
    """Run SQL across attached external DBs (MySQL/Postgres) + local tables."""
    data = await client.call("POST", "/api/duckdb/federated-query",
                             json_body={"sql": sql, "attach_databases": attach_databases, "is_preview": True})
    return _truncate(data, cfg)


async def ask(client, cfg, *, question: str, tables: list | None = None, locale: str = "zh") -> Any:
    """Natural-language question → generated DuckDB SQL → executed result."""
    gen = await client.call("POST", "/api/ai/nl-to-sql",
                            json_body={"question": question, "tables": tables or [], "locale": locale})
    sql = gen.get("sql") if isinstance(gen, dict) else None
    if not sql:
        return {"error": "no SQL generated", "raw": gen}
    result = await run_sql(client, cfg, sql=sql)
    return {"generated_sql": sql, **result}


async def explain_sql(client, cfg, *, sql: str) -> Any:
    """Plain-language explanation of a SQL statement."""
    return await client.call("POST", "/api/ai/explain-sql", json_body={"sql": sql})


async def suggest_chart(client, cfg, *, sql: str) -> Any:
    """Suggest a chart for a query's result shape."""
    return await client.call("POST", "/api/ai/suggest-chart", json_body={"sql": sql})


async def chat(client, cfg, *, message: str, history: list | None = None) -> Any:
    """Free-form data conversation with the configured LLM."""
    return await client.call("POST", "/api/ai/chat",
                             json_body={"message": message, "history": history or []})


async def error_fix(client, cfg, *, sql: str, error_message: str) -> Any:
    """Error doctor: suggest a fix for a failing query, given the error."""
    return await client.call("POST", "/api/ai/error-fix",
                             json_body={"sql": sql, "error": error_message})
```

> If `tests` show a 422 against a real backend later, reconcile body field names with `api/routers/ai.py` payload models.

- [ ] **Step 4: Register them (in `tools/__init__.py`, after `run_sql`)**

```python
    add("read")(query.federated_query)
    add("read")(query.ask)
    add("read")(query.explain_sql)
    add("read")(query.suggest_chart)
    add("read")(query.chat)
    add("read")(query.error_fix)
```

- [ ] **Step 5: Run tests + smoke build**

Run: `cd mcp && pytest tests/test_tools_query.py -v && python -c "from duckquery_mcp.server import build; build(); print('ok')"`
Expected: tests pass, prints `ok`

- [ ] **Step 6: Commit**

```bash
git add mcp/duckquery_mcp/tools/query.py mcp/duckquery_mcp/tools/__init__.py mcp/tests/test_tools_query.py
git commit -m "feat(mcp): federated_query, ask, explain_sql, suggest_chart, chat, error_fix"
```

---

## Task 8: Discover tools

**Files:**
- Create: `mcp/duckquery_mcp/tools/discover.py`; Modify: `tools/__init__.py`
- Test: `mcp/tests/test_tools_query.py` (append one) — or a new `test_tools_discover.py`

All tier `read`. Each returns the unwrapped data as-is (these are small).

| Tool | Call |
|---|---|
| `list_tables()` | `GET /api/duckdb/tables` |
| `describe_table(name)` | `GET /api/duckdb/tables/detail/{name}` |
| `list_connections()` | `GET /databases/list` |
| `list_db_objects(connection_id, kind="tables")` | `GET /api/datasources/databases/{connection_id}/{kind}` where kind ∈ {schemas, tables} |

- [ ] **Step 1: Write a failing test (`mcp/tests/test_tools_discover.py`)**

```python
import respx, httpx
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.discover import list_tables


@respx.mock
async def test_list_tables(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.get(f"{base}/api/duckdb/tables").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"tables": ["a", "b"]}}))
    out = await list_tables(DuckQueryClient(cfg), cfg)
    assert out == {"tables": ["a", "b"]}
```

- [ ] **Step 2: Run to verify fail**

Run: `cd mcp && pytest tests/test_tools_discover.py -v`
Expected: FAIL `ModuleNotFoundError`

- [ ] **Step 3: Write `mcp/duckquery_mcp/tools/discover.py`**

```python
from typing import Any


async def list_tables(client, cfg) -> Any:
    """List DuckDB tables currently loaded in the local engine."""
    return await client.call("GET", "/api/duckdb/tables")


async def describe_table(client, cfg, *, name: str) -> Any:
    """Columns/types/sample for one DuckDB table."""
    return await client.call("GET", f"/api/duckdb/tables/detail/{name}")


async def list_connections(client, cfg) -> Any:
    """List saved external database connections (MySQL/Postgres)."""
    return await client.call("GET", "/databases/list")


async def list_db_objects(client, cfg, *, connection_id: str, kind: str = "tables") -> Any:
    """List schemas or tables in an external connection. kind: 'schemas' | 'tables'."""
    return await client.call("GET", f"/api/datasources/databases/{connection_id}/{kind}")
```

- [ ] **Step 4: Register (in `tools/__init__.py`)**

```python
    from duckquery_mcp.tools import discover
    add("read")(discover.list_tables)
    add("read")(discover.describe_table)
    add("read")(discover.list_connections)
    add("read")(discover.list_db_objects)
```

- [ ] **Step 5: Run + smoke**

Run: `cd mcp && pytest tests/test_tools_discover.py -v && python -c "from duckquery_mcp.server import build; build(); print('ok')"`
Expected: pass + `ok`

- [ ] **Step 6: Commit**

```bash
git add mcp/duckquery_mcp/tools/discover.py mcp/duckquery_mcp/tools/__init__.py mcp/tests/test_tools_discover.py
git commit -m "feat(mcp): discover tools (tables, connections, db objects)"
```

---

## Task 9: Source tools (add data)

**Files:**
- Create: `mcp/duckquery_mcp/tools/sources.py`; Modify: `tools/__init__.py`
- Test: `mcp/tests/test_tools_sources.py`

Tiers: `add_local_file_source`, `import_excel`, `paste_data`, `read_url` are **write**; `add_connection` is **write**.

| Tool | Call (body field names per cited router) |
|---|---|
| `add_connection(connection: dict, test=True)` | `POST /databases?test_connection={test}` body = `connection` dict (DatabaseConnection shape — api/routers/datasources.py:313, model `models/query_models.DatabaseConnection`) |
| `add_local_file_source(path, table_alias=None, import_mode="auto")` | `POST /api/server-files/import` body per `ServerFileImportRequest` (api/routers/server_files.py: `{path, table_alias, import_mode, csv_*}`) |
| `import_excel(path, sheets)` | `POST /api/server-files/excel/import` body per `ServerExcelImportRequest` (api/routers/server_files.py) |
| `paste_data(content, table_alias, format="csv")` | `POST /api/paste-data` body per route (api/routers/…) |
| `read_url(url, table_alias)` | `POST /api/read_from_url` body per route |

- [ ] **Step 1: Write the failing test**

```python
# mcp/tests/test_tools_sources.py
import respx, httpx
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.sources import add_local_file_source


@respx.mock
async def test_add_local_file_source(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/server-files/import").mock(
        return_value=httpx.Response(200, json={"success": True,
            "data": {"table_name": "sales", "row_count": 42}}))
    out = await add_local_file_source(DuckQueryClient(cfg), cfg, path="/data/sales.csv")
    assert out["table_name"] == "sales"
    sent = route.calls.last.request
    assert b"/data/sales.csv" in sent.content
```

- [ ] **Step 2: Run to verify fail**

Run: `cd mcp && pytest tests/test_tools_sources.py -v`
Expected: FAIL `ModuleNotFoundError`

- [ ] **Step 3: Write `mcp/duckquery_mcp/tools/sources.py`**

```python
from typing import Any


async def add_connection(client, cfg, *, connection: dict, test: bool = True) -> Any:
    """Save (and optionally test) an external DB connection.
    `connection` matches DatabaseConnection: {name, type, host, port, database, username, password, ...}."""
    return await client.call("POST", "/databases", params={"test_connection": str(test).lower()},
                             json_body=connection)


async def add_local_file_source(client, cfg, *, path: str, table_alias: str | None = None,
                                import_mode: str = "auto") -> Any:
    """Register a local CSV/Excel/Parquet/JSON file as a DuckDB table (desktop allows any local path)."""
    body = {"path": path, "import_mode": import_mode}
    if table_alias:
        body["table_alias"] = table_alias
    return await client.call("POST", "/api/server-files/import", json_body=body)


async def import_excel(client, cfg, *, path: str, sheets: list) -> Any:
    """Import selected Excel sheets as tables. `sheets` per ServerExcelImportRequest."""
    return await client.call("POST", "/api/server-files/excel/import",
                             json_body={"path": path, "sheets": sheets})


async def paste_data(client, cfg, *, content: str, table_alias: str, fmt: str = "csv") -> Any:
    """Create a table from pasted CSV/TSV/JSON text."""
    return await client.call("POST", "/api/paste-data",
                             json_body={"content": content, "table_alias": table_alias, "format": fmt})


async def read_url(client, cfg, *, url: str, table_alias: str) -> Any:
    """Read a remote file URL into a DuckDB table."""
    return await client.call("POST", "/api/read_from_url",
                             json_body={"url": url, "table_name": table_alias})
```

> Before merge, open each cited router and confirm body field names (`paste_data`, `read_url`, `import_excel`, `add_connection`); adjust to match. `add_local_file_source` is confirmed against `ServerFileImportRequest`.

- [ ] **Step 4: Register (write tier)**

```python
    from duckquery_mcp.tools import sources
    add("write")(sources.add_connection)
    add("write")(sources.add_local_file_source)
    add("write")(sources.import_excel)
    add("write")(sources.paste_data)
    add("write")(sources.read_url)
```

- [ ] **Step 5: Run + smoke + mode check**

Run: `cd mcp && pytest tests/test_tools_sources.py -v`
Then verify read-only mode hides write tools:
Run: `cd mcp && DUCKQUERY_MCP_MODE=read-only python -c "import asyncio; from duckquery_mcp.server import build; m=build(); print([t.name for t in asyncio.run(m.list_tools())])"`
Expected: list contains `run_sql`, `list_tables`… but NOT `add_connection`/`add_local_file_source`.

- [ ] **Step 6: Commit**

```bash
git add mcp/duckquery_mcp/tools/sources.py mcp/duckquery_mcp/tools/__init__.py mcp/tests/test_tools_sources.py
git commit -m "feat(mcp): source tools (connection, local file, excel, paste, url)"
```

---

## Task 10: Transform tools

**Files:**
- Create: `mcp/duckquery_mcp/tools/transform.py`; Modify: `tools/__init__.py`
- Test: append to `test_tools_sources.py` or new file

Tiers: `save_as_table` = **write**; `pivot`/`set_operations` default to **preview** (read) and take an `execute: bool` that, when true, requires `confirm=True` (gated below).

| Tool | Call |
|---|---|
| `save_as_table(sql, table_name)` | `POST /api/save_query_to_duckdb` body `{sql, table_name}` (confirm body per api/routers/join_query.py:1025) |
| `pivot(config: dict, pivot_config: dict, execute=False)` | `POST /api/pivot-query/{preview or generate}` body `{config, pivot_config}` |
| `set_operations(operation: str, inputs: list, execute=False)` | `POST /api/set-operations/{preview or execute}` body per api/routers/set_operations.py |

- [ ] **Step 1: Write a failing test**

```python
@respx.mock
async def test_save_as_table(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.post(f"{base}/api/save_query_to_duckdb").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"table_name": "t2"}}))
    from duckquery_mcp.tools.transform import save_as_table
    from duckquery_mcp.client import DuckQueryClient
    out = await save_as_table(DuckQueryClient(cfg), cfg, sql="SELECT 1", table_name="t2")
    assert out["table_name"] == "t2"
```

- [ ] **Step 2: Run to verify fail** — `pytest -k save_as_table` → FAIL ModuleNotFoundError.

- [ ] **Step 3: Write `mcp/duckquery_mcp/tools/transform.py`**

```python
from typing import Any


async def save_as_table(client, cfg, *, sql: str, table_name: str) -> Any:
    """Materialize a query's result as a new DuckDB table."""
    return await client.call("POST", "/api/save_query_to_duckdb",
                             json_body={"sql": sql, "table_name": table_name})


async def pivot(client, cfg, *, config: dict, pivot_config: dict, execute: bool = False) -> Any:
    """Pivot a table. execute=False previews; execute=True writes the pivoted result."""
    path = "/api/pivot-query/generate" if execute else "/api/pivot-query/preview"
    return await client.call("POST", path, json_body={"config": config, "pivot_config": pivot_config})


async def set_operations(client, cfg, *, operation: str, inputs: list, execute: bool = False) -> Any:
    """UNION/INTERSECT/EXCEPT across DuckDB tables. execute=False previews."""
    path = "/api/set-operations/execute" if execute else "/api/set-operations/preview"
    return await client.call("POST", path, json_body={"operation": operation, "inputs": inputs})
```

> Confirm `pivot`/`set_operations` body shapes against `api/routers/pivot_query.py` and `api/routers/set_operations.py` request models before merge.

- [ ] **Step 4: Register (write tier — these can mutate via execute)**

```python
    from duckquery_mcp.tools import transform
    add("write")(transform.save_as_table)
    add("write")(transform.pivot)
    add("write")(transform.set_operations)
```

- [ ] **Step 5: Run + smoke** — `pytest tests/ -k save_as_table` pass; `build()` ok.

- [ ] **Step 6: Commit**

```bash
git add mcp/duckquery_mcp/tools/transform.py mcp/duckquery_mcp/tools/__init__.py mcp/tests/test_tools_sources.py
git commit -m "feat(mcp): transform tools (save_as_table, pivot, set_operations)"
```

---

## Task 11: AI settings + export tools

**Files:**
- Create: `mcp/duckquery_mcp/tools/ai_settings.py`, `mcp/duckquery_mcp/tools/export.py`; Modify: `tools/__init__.py`
- Test: append to a tools test file

Tiers: `get_ai_settings` = read; `configure_llm`/`test_llm_provider` = write; `export_results` = read.

| Tool | Call |
|---|---|
| `get_ai_settings()` | `GET /api/settings/ai` (backend already masks secrets) |
| `configure_llm(settings: dict)` | `PUT /api/settings/ai` body per `AISettingsPayload` (api/routers/ai.py:40) |
| `test_llm_provider(provider_id)` | `POST /api/ai/providers/{provider_id}/test` |
| `export_results(sql, format)` | `POST /api/query-results/export` body `{sql, format}` → returns `{download_url, file_path?}` |

- [ ] **Step 1: Write a failing test**

```python
@respx.mock
async def test_get_ai_settings_masked(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.get(f"{base}/api/settings/ai").mock(
        return_value=httpx.Response(200, json={"success": True,
            "data": {"default_provider": "openai", "providers": [{"id": "openai", "api_key": "****"}]}}))
    from duckquery_mcp.tools.ai_settings import get_ai_settings
    from duckquery_mcp.client import DuckQueryClient
    out = await get_ai_settings(DuckQueryClient(cfg), cfg)
    assert out["providers"][0]["api_key"] == "****"
```

- [ ] **Step 2: Run to verify fail** — FAIL ModuleNotFoundError.

- [ ] **Step 3: Write `mcp/duckquery_mcp/tools/ai_settings.py`**

```python
from typing import Any


async def get_ai_settings(client, cfg) -> Any:
    """Current AI/LLM settings (api keys are masked by the backend)."""
    return await client.call("GET", "/api/settings/ai")


async def configure_llm(client, cfg, *, settings: dict) -> Any:
    """Update AI/LLM settings. `settings` matches AISettingsPayload
    (default_provider, providers[{id,type,model,api_key,base_url}], features{...})."""
    return await client.call("PUT", "/api/settings/ai", json_body=settings)


async def test_llm_provider(client, cfg, *, provider_id: str) -> Any:
    """Test connectivity/credentials for one configured provider."""
    return await client.call("POST", f"/api/ai/providers/{provider_id}/test")
```

- [ ] **Step 4: Write `mcp/duckquery_mcp/tools/export.py`**

```python
from typing import Any


async def export_results(client, cfg, *, sql: str, format: str = "csv") -> Any:
    """Export a query result to a file; returns the backend download URL/path."""
    return await client.call("POST", "/api/query-results/export",
                             json_body={"sql": sql, "format": format})
```

- [ ] **Step 5: Register**

```python
    from duckquery_mcp.tools import ai_settings, export
    add("read")(ai_settings.get_ai_settings)
    add("write")(ai_settings.configure_llm)
    add("write")(ai_settings.test_llm_provider)
    add("read")(export.export_results)
```

- [ ] **Step 6: Run + smoke + commit**

```bash
cd mcp && pytest tests/ -q && python -c "from duckquery_mcp.server import build; build(); print('ok')"
git add mcp/duckquery_mcp/tools/ai_settings.py mcp/duckquery_mcp/tools/export.py mcp/duckquery_mcp/tools/__init__.py mcp/tests/
git commit -m "feat(mcp): ai settings + export tools"
```

---

## Task 12: Passthrough escape hatch

**Files:**
- Create: `mcp/duckquery_mcp/tools/passthrough.py`; Modify: `tools/__init__.py`
- Test: `mcp/tests/test_passthrough.py`

`duckquery_request` is tier `read` for `GET`, but in `normal` mode a non-`GET` method requires `confirm=True`; in `read-only` mode only `GET` is permitted; in `full` no gate.

- [ ] **Step 1: Write the failing test**

```python
# mcp/tests/test_passthrough.py
import respx, httpx, pytest
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.passthrough import duckquery_request


@respx.mock
async def test_get_passthrough(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.get(f"{base}/api/async-tasks").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"tasks": []}}))
    out = await duckquery_request(DuckQueryClient(cfg), cfg, method="GET", path="/api/async-tasks")
    assert out == {"tasks": []}


async def test_non_get_needs_confirm_in_normal(cfg):
    out = await duckquery_request(DuckQueryClient(cfg), cfg, method="DELETE",
                                  path="/api/duckdb/tables/t", confirm=False)
    assert "confirm" in out["error"].lower()
```

- [ ] **Step 2: Run to verify fail** — FAIL ModuleNotFoundError.

- [ ] **Step 3: Write `mcp/duckquery_mcp/tools/passthrough.py`**

```python
from typing import Any


async def duckquery_request(client, cfg, *, method: str, path: str,
                            json: dict | None = None, confirm: bool = False) -> Any:
    """Call any DuckQuery API endpoint directly (escape hatch for features without a dedicated tool).
    Non-GET methods require confirm=True unless mode is 'full'."""
    method = method.upper()
    if method != "GET" and cfg.mode != "full" and not confirm:
        return {"error": "This is a mutating request; pass confirm=true to proceed."}
    return await client.call(method, path, json_body=json)
```

- [ ] **Step 4: Register** (tier `read`; the body-level confirm gate handles writes)

```python
    from duckquery_mcp.tools import passthrough
    add("read")(passthrough.duckquery_request)
```

- [ ] **Step 5: Run + smoke + commit**

```bash
cd mcp && pytest tests/test_passthrough.py -v && python -c "from duckquery_mcp.server import build; build(); print('ok')"
git add mcp/duckquery_mcp/tools/passthrough.py mcp/duckquery_mcp/tools/__init__.py mcp/tests/test_passthrough.py
git commit -m "feat(mcp): generic passthrough tool with confirm gate"
```

---

## Task 13: Backend — write `runtime.json` on startup

So the desktop app (random port) and host-manual runs are auto-discoverable.

**Files:**
- Modify: `api/core/common/paths.py` (+ `get_runtime_file`)
- Modify: `api/run.py` (write on desktop startup)
- Modify: `api/main.py` (FastAPI lifespan write for manual `uvicorn`)
- Test: `api/tests/test_runtime_file.py`

- [ ] **Step 1: Run impact analysis (project rule)**

Run: `gitnexus_impact({target: "get_user_data_dir", direction: "upstream"})` and report the blast radius before editing `paths.py`.
Expected: note callers; `get_runtime_file` is additive (low risk).

- [ ] **Step 2: Write the failing test**

```python
# api/tests/test_runtime_file.py
import json
from core.common.paths import get_runtime_file, write_runtime_file


def test_get_runtime_file_under_user_dir():
    assert get_runtime_file().name == "runtime.json"


def test_write_runtime_file(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))  # if supported; else patch get_user_data_dir
    import core.common.paths as p
    monkeypatch.setattr(p, "get_user_data_dir", lambda: tmp_path)
    write_runtime_file(48010)
    data = json.loads((tmp_path / "runtime.json").read_text())
    assert data["port"] == 48010
    assert data["base"] == "http://127.0.0.1:48010"
    assert "pid" in data
```

- [ ] **Step 3: Run to verify fail**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_runtime_file.py -v`
Expected: FAIL `ImportError: cannot import name 'get_runtime_file'`

- [ ] **Step 4: Add to `api/core/common/paths.py`**

```python
def get_runtime_file() -> Path:
    """Path to the runtime descriptor the MCP server reads for auto-discovery."""
    return get_user_data_dir() / "runtime.json"


def write_runtime_file(port: int) -> None:
    """Best-effort: record the live backend port for local tools (e.g. the MCP server)."""
    import json
    import os

    try:
        path = get_runtime_file()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({
            "base": f"http://127.0.0.1:{port}",
            "port": port,
            "pid": os.getpid(),
        }))
    except Exception:
        pass
```

- [ ] **Step 5: Run to verify pass**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_runtime_file.py -v`
Expected: 2 passed

- [ ] **Step 6: Wire desktop entry — `api/run.py`**

In `main()`, right after `print(port, flush=True)`:

```python
    from core.common.paths import write_runtime_file
    write_runtime_file(port)
```

- [ ] **Step 7: Wire manual entry — `api/main.py` lifespan**

In the FastAPI lifespan startup (manual `uvicorn main:app --port N`), read the bound port from the server config and write it. If the app has no lifespan yet, add one:

```python
import os
from contextlib import asynccontextmanager
from core.common.paths import write_runtime_file


@asynccontextmanager
async def lifespan(app):
    port = int(os.getenv("UVICORN_PORT") or os.getenv("PORT") or 48001)
    write_runtime_file(port)
    yield


app = FastAPI(lifespan=lifespan)  # merge into the existing FastAPI(...) construction
```

> Note: the desktop path (`run.py`) is authoritative for the real random port; the lifespan fallback covers manual runs where the port is known via env or the documented default 48001. Reconcile with the existing `FastAPI(...)` call — do not create a second app.

- [ ] **Step 8: Run backend suite (no regressions)**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_runtime_file.py tests/test_run_entry.py -v`
Expected: pass (plus the 2 pre-existing `core/tests/test_duckdb_pool.py` failures unrelated to this change).

- [ ] **Step 9: Commit**

```bash
git add api/core/common/paths.py api/run.py api/main.py api/tests/test_runtime_file.py
git commit -m "feat(api): write runtime.json on startup for local MCP discovery"
```

---

## Task 14: Packaging + per-CLI config + smoke

**Files:**
- Modify: `mcp/README.md`
- Test: manual smoke (documented)

- [ ] **Step 1: Write `mcp/README.md`**

````markdown
# duckquery-mcp

An MCP server that exposes a locally-running DuckQuery backend to MCP clients
(Claude Code, Cursor, Codex). Start DuckQuery first (desktop app, Docker, or
`uvicorn main:app --port 48001`); this server auto-discovers it.

## Run

```bash
uvx duckquery-mcp            # zero-install
# or: pipx run duckquery-mcp
```

Env:
- `DUCKQUERY_API_BASE` — explicit backend URL (e.g. `http://127.0.0.1:48001`). Optional; auto-discovered otherwise.
- `DUCKQUERY_MCP_MODE` — `read-only` | `normal` (default) | `full`.

## Add to a CLI

Claude Code:
```bash
claude mcp add duckquery -- uvx duckquery-mcp
```

Cursor / Codex (`mcp.json`):
```json
{
  "mcpServers": {
    "duckquery": {
      "command": "uvx",
      "args": ["duckquery-mcp"],
      "env": { "DUCKQUERY_MCP_MODE": "normal" }
    }
  }
}
```
````

- [ ] **Step 2: Smoke — list tools with no backend (graceful)**

Run: `cd mcp && python -c "import asyncio; from duckquery_mcp.server import build; m=build(); print(len(asyncio.run(m.list_tools())), 'tools')"`
Expected: prints `18 tools` (17 + passthrough) in normal mode; no crash without a backend.

- [ ] **Step 3: Smoke — against a running backend**

Start DuckQuery (desktop or `cd api && ../.venv/bin/uvicorn main:app --port 48001`), then:
Run: `cd mcp && DUCKQUERY_API_BASE=http://127.0.0.1:48001 python -c "import asyncio; from duckquery_mcp.client import DuckQueryClient; from duckquery_mcp.config import load_config; from duckquery_mcp.tools.query import run_sql; c=DuckQueryClient(load_config()); print(asyncio.run(run_sql(c, load_config(), sql='SELECT 6*7 AS n')))"`
Expected: `{'columns': ['n'], 'rows': [{'n': 42}], 'row_count': 1, 'truncated': False}`

- [ ] **Step 4: Commit**

```bash
git add mcp/README.md
git commit -m "docs(mcp): install + per-CLI config; smoke instructions"
```

---

## Task 15: Integration test (env-gated)

**Files:**
- Create: `mcp/tests/test_integration.py`

- [ ] **Step 1: Write the integration test**

```python
# mcp/tests/test_integration.py
import os
import pytest
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.config import load_config
from duckquery_mcp.tools.query import run_sql

pytestmark = pytest.mark.skipif(
    not os.getenv("DUCKQUERY_INTEGRATION"),
    reason="set DUCKQUERY_INTEGRATION=1 with a running backend")


async def test_run_sql_live():
    cfg = load_config()
    out = await run_sql(DuckQueryClient(cfg), cfg, sql="SELECT 6*7 AS n")
    assert out["rows"] == [{"n": 42}]
```

- [ ] **Step 2: Run with a live backend**

Run: `cd mcp && DUCKQUERY_INTEGRATION=1 DUCKQUERY_API_BASE=http://127.0.0.1:48001 pytest tests/test_integration.py -v`
Expected: 1 passed (skipped if env unset).

- [ ] **Step 3: Full unit suite green**

Run: `cd mcp && pytest -q`
Expected: all pass (integration skipped without the env flag).

- [ ] **Step 4: Commit**

```bash
git add mcp/tests/test_integration.py
git commit -m "test(mcp): env-gated live integration test"
```

---

## Self-review notes (for the executor)

- **Spec coverage:** stdio server (T1,T6) · discovery env→runtime.json→probe+health (T3) · envelope unwrap (T4) · 17 tools + passthrough (T6–T12) · safety tiers (T5, registration in T6+, confirm gate T12) · runtime.json backend change (T13) · uvx/pip + CLI config (T14) · tests (every task + T15). All spec sections map to a task.
- **Body-shape caveat:** several tool tasks (T7 chat/suggest_chart/error_fix, T9 paste/url/excel/connection, T10 pivot/set-ops) say "confirm field names against the cited router." That is real work, not a placeholder — the endpoints and request-model files are named exactly; the executor reads the model and matches. `run_sql`, `ask`, `add_local_file_source`, `configure_llm`, `export_results` are confirmed in this plan.
- **mcp SDK:** assumes `FastMCP` from `mcp>=1.2`. If the installed SDK differs, adapt registration in T6 (`mcp.tool()` decorator) — the tool functions themselves are SDK-agnostic.
- **Tool count:** 17 named tools + `duckquery_request` = 18 registered in `normal`/`full`; fewer in `read-only`.
