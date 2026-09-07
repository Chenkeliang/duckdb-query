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
- `DUCKQUERY_API_BASE` — explicit backend URL (e.g. `http://127.0.0.1:48001`). Optional; auto-discovered otherwise (runtime.json, then probes 48001/8000/8001).
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

Claude Desktop — add the same `mcpServers` block to `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "duckquery": {
      "command": "uvx",
      "args": ["duckquery-mcp"]
    }
  }
}
```

## Tools

MCP package version 0.4.0 adds `get_capabilities`. Call it before emitting
DuckDB 2.0-specific SQL: it reports engine support separately from direct SQL,
Agent, and MCP policy support. `run_sql` and `federated_query` use the backend's
fail-closed SQL classification when available and retain a conservative local
fallback for older DuckQuery backends.

Version 0.4.0 is available from PyPI, and its wheel is also attached to the
[DuckQuery v2.0.0 prerelease](https://github.com/Chenkeliang/duckdb-query/releases/tag/v2.0.0).

High-level tools (query, the AI agent tools below, discover, add sources,
configure LLM, transform, export) plus a generic `duckquery_request` passthrough.
Safety mode gates which tools are exposed:

The AI tools all call the backend's unified Agent Engine (`POST /api/ai/agent/run`,
one thin tool per `mode`), replacing the removed single-purpose LLM services:
- `ask_agent` (`mode=data_qa`) — conversational data agent. Runs **bounded,
  read-only** probe queries — inspecting schemas, verifying real column values,
  and dry-running row-capped SELECTs — over local tables and, when you pass
  `attach_databases`, attached MySQL/PostgreSQL/SQLite/DuckDB tables, before
  answering. Any returned `sql` is a draft; the agent never executes writes.
- `generate_sql` (`mode=generate_sql`) — NL → an `EXPLAIN`-validated SQL draft (not executed).
- `repair_sql` (`mode=repair_sql`) — error doctor: failing SQL + error → a fix.
- `explain_sql` (`mode=explain_sql`) — plain-language explanation of a statement.
- `suggest_chart` (`mode=suggest_chart`) — a chart spec for a result set.

All five are `read`-tier tools — exposed in every safety mode — and never execute writes.
- `read-only` — hides all mutating tools; non-GET `duckquery_request` calls are
  hard-blocked (`confirm` cannot override).
- `normal` (default) — mutating tools are exposed, but changing tables,
  saving connections, importing data, running mutating SQL, and non-GET
  `duckquery_request` calls each require `confirm=true`.
- `full` — bypasses the MCP confirmation gates above; backend safeguards still
  apply.

The AI-settings tools (`configure_llm`, `test_llm_provider`) are write-tier:
hidden in `read-only`, and in `normal` mode they take the same `confirm=true`
parameter as every other write tool.
