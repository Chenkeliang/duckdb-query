from typing import Any


async def list_tables(client, cfg) -> Any:
    """List DuckDB tables currently loaded in the local engine."""
    return await client.call("GET", "/api/duckdb/tables")


async def describe_table(client, cfg, *, name: str) -> Any:
    """Columns/types/sample for one DuckDB table."""
    return await client.call("GET", f"/api/duckdb/tables/detail/{name}")


async def list_connections(client, cfg) -> Any:
    """List saved external database connections (MySQL/Postgres)."""
    return await client.call("GET", "/databases/list")


async def list_db_objects(client, cfg, *, connection_id: str, kind: str = "tables") -> Any:
    """List schemas or tables in an external connection. kind: 'schemas' | 'tables'."""
    return await client.call("GET", f"/api/datasources/databases/{connection_id}/{kind}")
