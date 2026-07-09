import json

import respx, httpx
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.transform import pivot, save_as_table, set_operations


@respx.mock
async def test_save_as_table(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/save_query_to_duckdb").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"table_name": "t2"}}))
    out = await save_as_table(DuckQueryClient(cfg), cfg, sql="SELECT 1", table_name="t2",
                              confirm=True)
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
                        attach_databases=[{"alias": "m", "connection_id": "SORDER"}],
                        confirm=True)
    sent = json.loads(route.calls.last.request.content)
    assert sent["table_alias"] == "t3"
    assert sent["attach_databases"] == [{"alias": "m", "connection_id": "SORDER"}]


@respx.mock
async def test_save_as_table_requires_confirm_in_normal_mode(cfg):
    """回归(2026-07): save_as_table 是 write tier，normal 模式必须显式 confirm=true，
    与 add_local_file_source/import_excel 一致，不能有工具偷偷绕过门闩。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/save_query_to_duckdb").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {}}))
    out = await save_as_table(DuckQueryClient(cfg), cfg, sql="SELECT 1", table_name="t2")
    assert "error" in out
    assert not route.called


@respx.mock
async def test_pivot_preview_defaults_limit_100(cfg):
    """回归(2026-07): 预览曾不传顶层 limit,后端回退 max_query_rows,
    一次返回 1000 行 × 51 列(934KB)打爆 MCP 上下文。默认 100 行封顶。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/pivot-query/preview").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"data": []}}))
    await pivot(DuckQueryClient(cfg), cfg,
                config={"table_name": "t", "filters": [], "limit": None},
                pivot_config={"rows": ["r"], "columns": ["c"],
                              "values": [{"column": "v", "aggregation": "SUM"}]})
    sent = json.loads(route.calls.last.request.content)
    assert sent["limit"] == 100


@respx.mock
async def test_pivot_preview_limit_overridable(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/pivot-query/preview").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"data": []}}))
    await pivot(DuckQueryClient(cfg), cfg,
                config={"table_name": "t", "filters": [], "limit": None},
                pivot_config={"rows": ["r"], "columns": ["c"],
                              "values": [{"column": "v", "aggregation": "SUM"}]},
                limit=500)
    sent = json.loads(route.calls.last.request.content)
    assert sent["limit"] == 500


@respx.mock
async def test_pivot_execute_sends_no_limit(cfg):
    """execute 走 /generate,写全量结果,不应带预览 limit。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/pivot-query/generate").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {}}))
    await pivot(DuckQueryClient(cfg), cfg,
                config={"table_name": "t", "filters": [], "limit": None},
                pivot_config={"rows": ["r"], "columns": ["c"],
                              "values": [{"column": "v", "aggregation": "SUM"}]},
                execute=True, confirm=True)
    sent = json.loads(route.calls.last.request.content)
    assert "limit" not in sent


@respx.mock
async def test_pivot_execute_requires_confirm_but_preview_does_not(cfg):
    """execute=True 写结果表 → 需 confirm；execute=False 预览是只读 → 不需 confirm。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    gen = respx.post(f"{base}/api/pivot-query/generate").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {}}))
    prev = respx.post(f"{base}/api/pivot-query/preview").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"data": []}}))
    args = dict(config={"table_name": "t", "filters": [], "limit": None},
                pivot_config={"rows": ["r"], "columns": ["c"],
                              "values": [{"column": "v", "aggregation": "SUM"}]})
    # execute 无 confirm → 拦截，不打后端
    blocked = await pivot(DuckQueryClient(cfg), cfg, execute=True, **args)
    assert "error" in blocked
    assert not gen.called
    # 预览无 confirm → 放行
    await pivot(DuckQueryClient(cfg), cfg, **args)
    assert prev.called


@respx.mock
async def test_set_operations_execute_requires_confirm(cfg):
    """set_operations execute=True 写/导出结果 → 需 confirm；preview 只读 → 不需。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    ex = respx.post(f"{base}/api/set-operations/execute").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {}}))
    pv = respx.post(f"{base}/api/set-operations/preview").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {}}))
    cfgd = {"operation_type": "UNION",
            "tables": [{"table_name": "a", "selected_columns": ["id"]},
                       {"table_name": "b", "selected_columns": ["id"]}]}
    blocked = await set_operations(DuckQueryClient(cfg), cfg, config=cfgd, execute=True)
    assert "error" in blocked
    assert not ex.called
    await set_operations(DuckQueryClient(cfg), cfg, config=cfgd)
    assert pv.called
