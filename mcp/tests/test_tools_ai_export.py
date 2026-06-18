import respx, httpx
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.ai_settings import get_ai_settings


@respx.mock
async def test_get_ai_settings_masked(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.get(f"{base}/api/settings/ai").mock(
        return_value=httpx.Response(200, json={"success": True,
            "data": {"default_provider": "openai", "providers": [{"id": "openai", "api_key": "****"}]}}))
    out = await get_ai_settings(DuckQueryClient(cfg), cfg)
    assert out["providers"][0]["api_key"] == "****"
