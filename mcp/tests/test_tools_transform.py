import respx, httpx
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.transform import save_as_table


@respx.mock
async def test_save_as_table(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.post(f"{base}/api/save_query_to_duckdb").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"table_name": "t2"}}))
    out = await save_as_table(DuckQueryClient(cfg), cfg, sql="SELECT 1", table_name="t2")
    assert out["table_name"] == "t2"
