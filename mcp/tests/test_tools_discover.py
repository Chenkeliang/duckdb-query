import respx
import httpx
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.discover import list_tables


@respx.mock
async def test_list_tables(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.get(f"{base}/api/duckdb/tables").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"tables": ["a", "b"]}}))
    out = await list_tables(DuckQueryClient(cfg), cfg)
    assert out == {"tables": ["a", "b"]}
