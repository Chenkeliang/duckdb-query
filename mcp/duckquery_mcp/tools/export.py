from typing import Any


async def export_results(client, cfg, *, sql: str, format: str = "parquet",
                         attach_databases: list | None = None,
                         apply_row_limit: bool = True,
                         confirm: bool = False) -> Any:
    """Export a query result to a file; returns file_id, download_url, format, row_count_estimate.
    format: 'parquet' (default) or 'csv'. Only SELECT queries are allowed.

    apply_row_limit=True (default) preserves an existing outer LIMIT or adds the
    backend default when absent. Set it to False to remove the outer LIMIT while
    preserving nested LIMIT clauses.

    Writes a file to disk (a side effect beyond a pure read), so it needs
    confirm=true outside read-only mode — which blocks it outright. Same gate
    as every other write tool; registration tier alone cannot enforce this
    per call."""
    from duckquery_mcp.safety import confirm_required
    blocked = confirm_required(cfg, True, confirm)
    if blocked:
        return blocked
    body: dict = {
        "sql": sql,
        "format": format,
        "apply_row_limit": apply_row_limit,
    }
    if attach_databases is not None:
        body["attach_databases"] = attach_databases
    return await client.call("POST", "/api/query-results/export", json_body=body)
