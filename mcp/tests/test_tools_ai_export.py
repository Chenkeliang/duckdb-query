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


@respx.mock
async def test_export_results_passes_attach_databases(cfg):
    """export_results 透传 attach_databases 原样给后端;db_ 前缀归一化发生在
    注册闭包层(见 test_normalize.py),这里验证透传不改写。"""
    import json

    from duckquery_mcp.tools.export import export_results

    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/query-results/export").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"file_id": "f1"}}))
    out = await export_results(
        DuckQueryClient(cfg), cfg, sql="SELECT * FROM m.t", format="csv",
        attach_databases=[{"alias": "m", "connection_id": "SORDER"}],
        confirm=True)  # 写文件的确认门
    assert out["file_id"] == "f1"
    sent = json.loads(route.calls.last.request.content)
    assert sent["attach_databases"] == [{"alias": "m", "connection_id": "SORDER"}]
    assert sent["format"] == "csv"
    assert sent["apply_row_limit"] is True


@respx.mock
async def test_export_results_can_use_full_result_limit_semantics(cfg):
    import json

    from duckquery_mcp.tools.export import export_results

    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/query-results/export").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"file_id": "f1"}}))
    await export_results(
        DuckQueryClient(cfg), cfg, sql="SELECT 1 LIMIT 10", format="csv",
        apply_row_limit=False, confirm=True,
    )
    sent = json.loads(route.calls.last.request.content)
    assert sent["apply_row_limit"] is False
