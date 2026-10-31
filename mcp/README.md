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

Version 0.4.1 retains the existing tool signatures and safety modes, adds optional column_types/pushdown/warnings to query results, and adds three read-only exploration tools for DuckQuery >=2.1.2:

- get_column_insights: suggestions from actual field types, without row sampling.
- discover_json_paths: apply filters before sampling at most 100 rows; paths are not a complete schema.
- generate_insight_query: generate metrics or JSON-extraction SQL without executing it. Planned pushdown is not evidence of actual execution.

Call get_capabilities before using DuckDB 2.0-specific SQL. run_sql/federated_query retain server classification and the conservative old-backend fallback. Legacy pivot execute=True generates SQL only; it does not create a table. Its existing confirmation gate and write-tier registration are unchanged. Materialization still uses save_as_table with explicit confirmation.

The 0.4.1 wheel and source distribution accompany [DuckQuery v2.1.3](https://github.com/Chenkeliang/duckdb-query/releases/tag/v2.1.3). To use that exact wheel independently of PyPI publication:

```bash
uvx --from https://github.com/Chenkeliang/duckdb-query/releases/download/v2.1.3/duckquery_mcp-0.4.1-py3-none-any.whl duckquery-mcp
```

The unpinned uvx command uses the version available on PyPI (and its cache). After a PyPI update, use uvx --refresh duckquery-mcp@0.4.1 and reconnect/restart the MCP server. Existing MCP 0.4.0 tools remain compatible with DuckQuery v2.1.3; the Windows packaging repair does not require a client update.

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

## Publishing (maintainers)

The manual `Publish MCP` workflow builds/tests the version already merged into main, then publishes through PyPI OIDC without storing an API token in the repository. Configure a Trusted Publisher for the `duckquery-mcp` PyPI project:

- GitHub owner: `Chenkeliang`
- Repository: `duckdb-query`
- Workflow: `publish-mcp.yml`
- Environment: `pypi`

After that one-time PyPI configuration, dispatch the workflow from main with version `0.4.1`. The publish job only receives an OIDC token, separate from the build job. Never put publication tokens in issues, release notes or source files.
