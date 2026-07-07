from typing import Any


async def list_tables(client, cfg) -> Any:
    """List DuckDB tables currently loaded in the local engine."""
    return await client.call("GET", "/api/duckdb/tables")


async def describe_table(client, cfg, *, name: str) -> Any:
    """Columns/types/sample for one DuckDB table."""
    return await client.call("GET", f"/api/duckdb/tables/detail/{name}")


async def list_connections(client, cfg) -> Any:
    """List saved external database connections (MySQL/Postgres)."""
    return await client.call("GET", "/api/datasources/databases/list")


async def list_db_objects(client, cfg, *, connection_id: str, kind: str = "tables") -> Any:
    """List schemas or tables in an external connection. kind: 'schemas' | 'tables'.

    The connection_id from list_connections (e.g. 'db_SORDER') is accepted; its 'db_'
    prefix is normalized. For 'tables', returns COMPACT entries (table name + comment +
    column_count) capped at 200 — a big schema's full column lists would be huge. To get
    one table's columns, run `federated_query("SELECT * FROM alias.<table> LIMIT 0", ...)`.
    """
    data = await client.call("GET", f"/api/datasources/databases/{connection_id}/{kind}")
    tables = data.get("tables") if isinstance(data, dict) else None
    if isinstance(tables, list):
        cap = 200
        compact = [
            {
                "table_name": t.get("table_name"),
                "comment": t.get("table_comment"),
                "column_count": len(t.get("columns") or []),
            }
            for t in tables[:cap]
        ]
        return {
            "connection_id": data.get("connection_id"),
            "database": data.get("database"),
            "table_count": len(tables),
            "truncated": len(tables) > cap,
            "tables": compact,
        }
    return data
