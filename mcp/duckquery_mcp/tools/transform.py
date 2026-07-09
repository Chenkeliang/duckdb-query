from typing import Any


async def save_as_table(client, cfg, *, sql: str, table_name: str,
                        attach_databases: list | None = None,
                        confirm: bool = False) -> Any:
    """Materialize a query's result as a new DuckDB table.

    Writes a table, so it needs confirm=true outside read-only mode (which blocks
    it outright), like every other write tool.

    Pass attach_databases (same shape as federated_query) when the SQL references
    attached external tables (alias.table) — without it such SQL fails with
    'schema ... does not exist'."""
    from duckquery_mcp.safety import confirm_required
    blocked = confirm_required(cfg, True, confirm)
    if blocked:
        return blocked
    # Router reads "table_alias" (or "tableAlias"); public param kept as table_name for clarity.
    body: dict = {"sql": sql, "table_alias": table_name}
    if attach_databases:
        body["attach_databases"] = attach_databases
    return await client.call("POST", "/api/save_query_to_duckdb", json_body=body)


async def pivot(client, cfg, *, config: dict, pivot_config: dict, execute: bool = False,
                limit: int = 100, confirm: bool = False) -> Any:
    """Pivot a table. execute=False previews; execute=True writes the pivoted result.

    config is the BASE-QUERY config (which table to read), NOT the pivot dimensions:
      {"table_name": "orders", "filters": [], "limit": null}
    pivot_config holds the pivot shape. Minimal working example:
      {"rows": ["region"], "columns": ["month"],
       "values": [{"column": "amount", "aggregation": "SUM"}]}
    Notes: value entries use "column" (not "field"); "aggregation" is an UPPERCASE
    enum string: SUM | AVG | COUNT | MIN | MAX | COUNT_DISTINCT. Optional keys:
    manual_column_values (explicit column headers; required for subtotals/grand
    totals), include_subtotals, include_grand_totals, strategy ("auto" default).
    Preview rows are capped by `limit` (default 100; raise explicitly for more) —
    `row_count` in the response is still the full pivoted total.
    execute=True writes a table, so it needs confirm=true (preview does not).
    """
    from duckquery_mcp.safety import confirm_required
    # Only execute=True mutates (writes a result table); preview stays read-only.
    blocked = confirm_required(cfg, execute, confirm)
    if blocked:
        return blocked
    path = "/api/pivot-query/generate" if execute else "/api/pivot-query/preview"
    body: dict = {"config": config, "pivot_config": pivot_config}
    if not execute:
        body["limit"] = limit
    return await client.call("POST", path, json_body=body)


async def set_operations(client, cfg, *, config: dict, execute: bool = False,
                         confirm: bool = False) -> Any:
    """UNION/INTERSECT/EXCEPT across DuckDB tables. execute=False previews.

    config minimal working example:
      {"operation_type": "UNION",
       "tables": [{"table_name": "t1", "selected_columns": ["id", "name"]},
                  {"table_name": "t2", "selected_columns": ["id", "name"]}]}
    Notes: operation_type is an UPPERCASE enum string: "UNION" | "UNION ALL" |
    "UNION BY NAME" | "UNION ALL BY NAME" | "EXCEPT" | "INTERSECT" ("UNION ALL"
    contains a space, not an underscore). At least 2 tables; outside BY NAME
    modes every table's selected_columns must have the SAME length.
    execute=True writes/exports the result, so it needs confirm=true (preview does not).
    """
    from duckquery_mcp.safety import confirm_required
    # Only execute=True mutates; preview stays read-only.
    blocked = confirm_required(cfg, execute, confirm)
    if blocked:
        return blocked
    path = "/api/set-operations/execute" if execute else "/api/set-operations/preview"
    return await client.call("POST", path, json_body={"config": config})
