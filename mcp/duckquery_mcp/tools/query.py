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
