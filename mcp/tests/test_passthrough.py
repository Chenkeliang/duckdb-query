import respx, httpx, pytest
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.passthrough import duckquery_request


@respx.mock
async def test_get_passthrough(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.get(f"{base}/api/async-tasks").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"tasks": []}}))
    out = await duckquery_request(DuckQueryClient(cfg), cfg, method="GET", path="/api/async-tasks")
    assert out == {"tasks": []}


async def test_non_get_needs_confirm_in_normal(cfg):
    out = await duckquery_request(DuckQueryClient(cfg), cfg, method="DELETE",
                                  path="/api/duckdb/tables/t", confirm=False)
    assert "confirm" in out["error"].lower()
