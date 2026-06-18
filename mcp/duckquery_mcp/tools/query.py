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


async def federated_query(client: DuckQueryClient, cfg: Config, *, sql: str, attach_databases: list) -> Any:
    """Run SQL across attached external DBs (MySQL/Postgres) + local tables."""
    from duckquery_mcp.safety import is_write_sql
    if cfg.mode == "read-only" and is_write_sql(sql):
        return {"error": "read-only mode: only SELECT / WITH / EXPLAIN are allowed."}
    data = await client.call("POST", "/api/duckdb/federated-query",
                             json_body={"sql": sql, "attach_databases": attach_databases, "is_preview": True})
    return _truncate(data, cfg)


async def ask(client: DuckQueryClient, cfg: Config, *, question: str, tables: list | None = None, locale: str = "zh") -> Any:
    """Natural-language question -> generated DuckDB SQL -> executed result."""
    gen = await client.call("POST", "/api/ai/nl-to-sql",
                            json_body={"question": question, "tables": tables or [], "locale": locale})
    sql = gen.get("sql") if isinstance(gen, dict) else None
    if not sql:
        return {"error": "no SQL generated", "raw": gen}
    result = await run_sql(client, cfg, sql=sql)
    return {"generated_sql": sql, **result}


async def explain_sql(client: DuckQueryClient, cfg: Config, *, sql: str, locale: str = "zh") -> Any:
    """Plain-language explanation of a SQL statement."""
    return await client.call("POST", "/api/ai/explain-sql", json_body={"sql": sql, "locale": locale})


async def suggest_chart(
    client: DuckQueryClient,
    cfg: Config,
    *,
    columns: list,
    sample: list | None = None,
    locale: str = "zh",
) -> Any:
    """Suggest a chart type for a query result. Pass columns (list of {name, type}) and optional sample rows."""
    return await client.call("POST", "/api/ai/suggest-chart",
                             json_body={"columns": columns, "sample": sample or [], "locale": locale})


async def chat(
    client: DuckQueryClient,
    cfg: Config,
    *,
    messages: list,
    tables: list | None = None,
    locale: str = "zh",
) -> Any:
    """Free-form data conversation with the configured LLM. messages is [{role, content}, ...]."""
    return await client.call("POST", "/api/ai/chat",
                             json_body={"messages": messages, "tables": tables or [], "locale": locale})


async def error_fix(client: DuckQueryClient, cfg: Config, *, sql: str, error_message: str) -> Any:
    """Error doctor: suggest a fix for a failing query, given the error."""
    return await client.call("POST", "/api/ai/error-fix",
                             json_body={"sql": sql, "error": error_message})
