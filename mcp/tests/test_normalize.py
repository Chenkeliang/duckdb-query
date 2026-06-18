import json

import httpx
import respx

from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.discover import list_db_objects
from duckquery_mcp.tools.query import federated_query
from duckquery_mcp.util import normalize_connection_id


def test_normalize_strips_db_prefix():
    assert normalize_connection_id("db_SORDER") == "SORDER"
    assert normalize_connection_id("SORDER") == "SORDER"
    assert normalize_connection_id("db_db_x") == "db_x"  # only one prefix stripped


@respx.mock
async def test_list_db_objects_strips_id_and_compacts(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    # must hit the STRIPPED id (SORDER), not db_SORDER
    route = respx.get(f"{base}/api/datasources/databases/SORDER/tables").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {
            "connection_id": "SORDER", "database": "store_order",
            "tables": [
                {"table_name": "t1", "table_comment": "c1", "columns": [{"name": "a"}, {"name": "b"}]},
                {"table_name": "t2", "table_comment": "c2", "columns": [{"name": "x"}]},
            ]}}))
    out = await list_db_objects(DuckQueryClient(cfg), cfg, connection_id="db_SORDER")
    assert route.called
    assert out["table_count"] == 2
    assert out["truncated"] is False
    assert out["tables"][0] == {"table_name": "t1", "comment": "c1", "column_count": 2}
    assert "columns" not in out["tables"][0]  # heavy per-table columns dropped


@respx.mock
async def test_federated_query_strips_connection_id(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/duckdb/federated-query").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {
            "columns": ["n"], "data": [{"n": 1}], "row_count": 1}}))
    await federated_query(DuckQueryClient(cfg), cfg, sql="SELECT 1 AS n FROM m.t",
                          attach_databases=[{"alias": "m", "connection_id": "db_SORDER"}])
    sent = json.loads(route.calls.last.request.content)
    assert sent["attach_databases"][0]["connection_id"] == "SORDER"
