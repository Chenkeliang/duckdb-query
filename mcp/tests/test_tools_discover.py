import respx
import httpx
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.discover import list_tables
from duckquery_mcp.tools.discover import get_capabilities
from duckquery_mcp.tools import register_all
from mcp.server.fastmcp import FastMCP


@respx.mock
async def test_list_tables(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.get(f"{base}/api/duckdb/tables").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"tables": ["a", "b"]}}))
    out = await list_tables(DuckQueryClient(cfg), cfg)
    assert out == {"tables": ["a", "b"]}


@respx.mock
async def test_get_capabilities(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.get(f"{base}/api/capabilities").mock(return_value=httpx.Response(200, json={
        "success": True, "data": {"contract_version": 1, "features": []}}))
    out = await get_capabilities(DuckQueryClient(cfg), cfg)
    assert out["contract_version"] == 1


def test_capability_tool_is_registered_in_every_safety_mode(cfg):
    for mode in ("read-only", "normal", "full"):
        selected = cfg.__class__(**{**cfg.__dict__, "mode": mode})
        mcp = FastMCP("test")
        register_all(mcp, DuckQueryClient(selected), selected)
        assert mcp._tool_manager.get_tool("get_capabilities") is not None
