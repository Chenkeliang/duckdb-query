from typing import Any


async def save_as_table(client, cfg, *, sql: str, table_name: str) -> Any:
    """Materialize a query's result as a new DuckDB table."""
    # Router reads "table_alias" (or "tableAlias"); public param kept as table_name for clarity.
    return await client.call("POST", "/api/save_query_to_duckdb",
                             json_body={"sql": sql, "table_alias": table_name})


async def pivot(client, cfg, *, config: dict, pivot_config: dict, execute: bool = False) -> Any:
    """Pivot a table. execute=False previews; execute=True writes the pivoted result."""
    path = "/api/pivot-query/generate" if execute else "/api/pivot-query/preview"
    return await client.call("POST", path, json_body={"config": config, "pivot_config": pivot_config})


async def set_operations(client, cfg, *, config: dict, execute: bool = False) -> Any:
    """UNION/INTERSECT/EXCEPT across DuckDB tables. Pass config (SetOperationConfig dict). execute=False previews."""
    path = "/api/set-operations/execute" if execute else "/api/set-operations/preview"
    return await client.call("POST", path, json_body={"config": config})
