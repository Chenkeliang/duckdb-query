# DuckQuery MCP Server — Design Spec

- **Date:** 2026-06-18
- **Status:** Design (approved in brainstorming; pending written-spec review)
- **Branch:** `feat_mcp_server`
- **Soft dependency:** `feat_service_ports` (backend host port → 48001). Not hard-required — the server probes legacy ports too, so it works before or after that branch merges.

## 1. Goal & scope

A standalone **stdio MCP server** (`duckquery-mcp`) that exposes the locally-running DuckQuery backend's capabilities as MCP tools, so any MCP-capable CLI/agent (Claude Code, Codex, Cursor, Claude Desktop) can drive DuckQuery entirely through AI: run SQL, ask in natural language, add data sources, configure the LLM, export, etc.

It **requires a running DuckQuery backend** (desktop app, Docker, or manual). The MCP server is a thin HTTP adapter — it holds no DuckDB state itself.

- **In scope (v1):** ~17 high-level tools + one generic passthrough; 3 safety tiers; backend auto-discovery; packaging for `uvx`/`pip`; a small backend addition to write a runtime file.
- **Out of scope (v1):** MCP resources/prompts, result streaming, multiple simultaneous backends, auth tokens (localhost assumed trusted), bundling the MCP into the desktop installer.

## 2. Architecture

- **Language:** Python (matches the backend; reuses httpx/pydantic), official **`mcp`** SDK, **stdio** transport (the form most uniformly supported by Claude Code / Cursor / Codex).
- **Location:** repo subdir `mcp/` with its own `pyproject.toml`; console entry point `duckquery-mcp`.
- **Shape:** each tool is a thin function that issues one HTTP call to the DuckQuery API via a shared `httpx.AsyncClient`, normalizes the response, and returns compact structured content.
- **Modules:** `server.py` (MCP wiring + tool registry), `client.py` (HTTP + discovery + health), `tools/*.py` (grouped tools), `config.py` (env: base URL, mode, timeouts, row cap).

```
MCP client (Claude Code / Cursor / Codex)
        │  stdio (JSON-RPC)
        ▼
   duckquery-mcp  ── httpx ──►  DuckQuery FastAPI (localhost:48001)
        │                               │
   tool registry                  DuckDB engine + connections
```

## 3. Backend discovery & health

Resolve the backend base URL on startup, and lazily re-resolve if a call fails (the backend may start after the MCP). Order:

1. `DUCKQUERY_API_BASE` env — explicit; required for non-localhost / custom ports.
2. **Runtime file** `<user-data>/DuckQuery/runtime.json`, written by the backend on startup: `{ "base": "http://127.0.0.1:<port>", "port": <port>, "pid": <pid> }`.
3. **Probe** a candidate list — default `[48001, 8000, 8001]` (new default + legacy) — each verified with `GET /health` returning DuckQuery's health shape. First verified match wins.
4. None found → every tool returns a clear, actionable error: *"DuckQuery backend not found — start the app or set DUCKQUERY_API_BASE."*

**Backend change (small):** write `runtime.json` at startup — from `run.py` for the desktop entry (it already chooses the loopback port) and from a FastAPI lifespan hook for manual `uvicorn` runs — so both are auto-discoverable. Best-effort; the MCP ignores a file whose `pid` is dead. Docker writes the file inside the container (not host-visible), so Docker relies on env or the 48001 probe.

The `/health` verification is the safeguard against "some unrelated service occupies 8000" — a non-DuckQuery response is rejected, so the MCP never talks to the wrong process.

## 4. Tools (high-level + passthrough)

All tools take/return JSON. Large result sets are truncated to a configurable cap (default 200 rows) with a `row_count` + `truncated` note. **Secrets are never returned**: LLM API keys and DB passwords are write-only; reads come back masked.

| Group | Tool | Backend endpoint |
|---|---|---|
| Query / Ask | `run_sql(sql, preview?)` | `POST /api/duckdb/execute` |
| | `ask(question)` → SQL + result | `POST /api/ai/nl-to-sql` then `run_sql` |
| | `federated_query(sql, attach)` | `POST /api/duckdb/federated-query` |
| | `explain_sql(sql)` · `suggest_chart(...)` | `POST /api/ai/explain-sql` · `.../suggest-chart` |
| | `chat(message, history?)` · `error_fix(sql, error)` | `POST /api/ai/chat` · `/api/ai/error-fix` |
| Discover | `list_tables()` · `describe_table(name)` | `GET /api/duckdb/tables` · `.../detail/{name}` |
| | `list_connections()` · `list_db_objects(conn_id)` | `GET /databases/list` · `/api/datasources/databases/{id}/...` |
| Add data | `add_connection(type, host, ...)` (+test) | `POST /databases` (+ `/databases/test`) |
| | `add_local_file_source(path, alias?)` | `POST /api/server-files/import` |
| | `import_excel(path, sheets?)` · `paste_data(...)` · `read_url(url)` | `.../server-files/excel/*` · `/api/paste-data` · `/api/read_from_url` |
| Transform | `save_as_table(sql, table_name)` | `POST /api/save_query_to_duckdb` |
| | `pivot(config, pivot_config, preview?)` | `POST /api/pivot-query/generate\|preview` |
| | `set_operations(operation, inputs, preview?)` | `POST /api/set-operations/{generate,preview,execute}` |
| Configure LLM | `get_ai_settings()` (masked) · `configure_llm(...)` · `test_llm_provider(id)` | `GET\|PUT /api/settings/ai` · `POST /api/ai/providers/{id}/test` |
| Export | `export_results(sql, format)` → file path | `POST /api/query-results/export` |
| Escape hatch | `duckquery_request(method, path, json?)` | any remaining endpoint (async-tasks, favorites, pool, url_info, table/connection deletion…) |

Tool descriptions are written for an LLM audience: when to use, argument shapes, short examples. The passthrough guarantees "all feature points" are reachable without bloating the curated tool list.

## 5. Safety tiers

Env/arg `DUCKQUERY_MCP_MODE = read-only | normal | full` (default **normal**):

- **read-only** — only non-mutating tools are registered (query / ask / discover / explain / export, plus `chat`, `error_fix`, and `pivot` / `set_operations` in **preview** mode). `run_sql` runs but rejects anything that isn't `SELECT` / `WITH` / `EXPLAIN`; `save_as_table` and `set_operations(execute)` are unavailable; `duckquery_request` limited to `GET`.
- **normal (default)** — adds "add data", "configure LLM", and write transforms (`save_as_table`, `set_operations(execute)`). Destructive raw SQL (`DROP` / `DELETE` / `ALTER` / `TRUNCATE` / `UPDATE`) and non-`GET` passthrough require an explicit `confirm: true` argument, so the model must consciously opt in and the action is visible.
- **full** — everything, no confirm gate.

Enforcement lives in the adapter (statement sniffing + which tools get registered), not the backend. This is **defense-in-depth** against accidental or prompt-injected actions; it does **not** replace the host CLI's own per-tool-call approval, which stays the human gate.

## 6. Distribution / how CLIs load it

- Published as `duckquery-mcp` on PyPI; runnable with `uvx duckquery-mcp` (zero-install) or `pipx`.
- Config snippets shipped in the package README:
  - **Claude Code:** `claude mcp add duckquery -- uvx duckquery-mcp` (env `DUCKQUERY_MCP_MODE`, `DUCKQUERY_API_BASE`).
  - **Cursor / Codex:** `{ "command": "uvx", "args": ["duckquery-mcp"], "env": { "DUCKQUERY_MCP_MODE": "normal" } }`.

## 7. Testing

- **Unit:** each tool's request mapping + response normalization (mock httpx); mode gating (read-only hides mutating tools; confirm gate fires); discovery order (env > runtime.json > probe) against a fake `/health`.
- **Integration:** against a real backend — `add_local_file_source` a CSV → `run_sql SELECT` asserts row count; `configure_llm` (dummy provider) round-trips and `get_ai_settings` returns masked.
- **Smoke:** `uvx duckquery-mcp` lists tools + runs one SQL against a running backend.

## 8. Dependencies & assumptions

- DuckQuery backend reachable on localhost with **no auth** (current state).
- Soft dependency on `feat_service_ports` (backend → 48001); the probe list includes legacy 8000/8001 so the MCP works before or after that merge.
- New backend code: a `runtime.json` writer in the FastAPI lifespan (~15 lines).

## 9. Open questions (deferred)

- Auth, if the backend ever requires a token.
- Streaming / pagination for very large result sets (v1 truncates).
- Whether to also bundle the MCP inside the desktop installer so users don't need `uvx`.
