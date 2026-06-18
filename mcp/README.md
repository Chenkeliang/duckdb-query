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

## Tools

High-level tools (query, ask, discover, add sources, configure LLM, transform,
export) plus a generic `duckquery_request` passthrough. Safety mode gates which
tools are exposed: `read-only` hides all mutating tools; `normal` exposes them
but destructive raw SQL and non-GET passthrough require `confirm=true`; `full`
removes the gate.
