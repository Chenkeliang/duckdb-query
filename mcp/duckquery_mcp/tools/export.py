from typing import Any, Optional


async def export_results(client, cfg, *, sql: str, format: str = "parquet",
                         attach_databases: Optional[list] = None) -> Any:
    """Export a query result to a file; returns file_id, download_url, format, row_count_estimate.
    format: 'parquet' (default) or 'csv'. Only SELECT queries are allowed."""
    body: dict = {"sql": sql, "format": format}
    if attach_databases is not None:
        body["attach_databases"] = attach_databases
    return await client.call("POST", "/api/query-results/export", json_body=body)
