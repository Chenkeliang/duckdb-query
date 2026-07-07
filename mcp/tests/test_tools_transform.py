import json

import respx, httpx
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.transform import save_as_table


@respx.mock
async def test_save_as_table(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/save_query_to_duckdb").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"table_name": "t2"}}))
    out = await save_as_table(DuckQueryClient(cfg), cfg, sql="SELECT 1", table_name="t2")
    assert out["table_name"] == "t2"
    # 本地保存不带 attach_databases 键,后端仍走原本地分支
    sent = json.loads(route.calls.last.request.content)
    assert "attach_databases" not in sent


@respx.mock
async def test_save_as_table_passes_attach_databases(cfg):
    """回归(2026-07): 保存联邦查询结果曾因不透传 attach_databases 报 schema 不存在。
    db_ 前缀归一化发生在注册闭包层(见 test_normalize.py),这里验证透传不改写。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/save_query_to_duckdb").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"table_alias": "t3"}}))
    await save_as_table(DuckQueryClient(cfg), cfg, sql="SELECT * FROM m.t", table_name="t3",
                        attach_databases=[{"alias": "m", "connection_id": "SORDER"}])
    sent = json.loads(route.calls.last.request.content)
    assert sent["table_alias"] == "t3"
    assert sent["attach_databases"] == [{"alias": "m", "connection_id": "SORDER"}]
