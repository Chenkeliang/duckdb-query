import respx
import httpx
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.sources import add_local_file_source


@respx.mock
async def test_add_local_file_source(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/server-files/import").mock(
        return_value=httpx.Response(200, json={"success": True,
            "data": {"table_name": "sales", "row_count": 42}}))
    out = await add_local_file_source(DuckQueryClient(cfg), cfg, path="/data/sales.csv")
    assert out["table_name"] == "sales"
    sent = route.calls.last.request
    assert b"/data/sales.csv" in sent.content
