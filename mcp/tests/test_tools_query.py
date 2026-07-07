import json

import respx
import httpx
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.query import run_sql


@respx.mock
async def test_run_sql_returns_rows(cfg):
    respx.get("http://127.0.0.1:48001/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.post("http://127.0.0.1:48001/api/duckdb/execute").mock(
        return_value=httpx.Response(200, json={
            "success": True,
            "data": {"columns": ["n"], "data": [{"n": 16}], "row_count": 1},
            "messageCode": "QUERY_EXECUTED"}))
    client = DuckQueryClient(cfg)
    out = await run_sql(client, cfg, sql="SELECT 8+8 AS n")
    assert out["row_count"] == 1
    assert out["rows"] == [{"n": 16}]
    assert out["truncated"] is False


@respx.mock
async def test_run_sql_truncates(cfg):
    cfg = cfg.__class__(**{**cfg.__dict__, "row_cap": 2})
    respx.get("http://127.0.0.1:48001/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.post("http://127.0.0.1:48001/api/duckdb/execute").mock(
        return_value=httpx.Response(200, json={
            "success": True,
            "data": {"columns": ["n"], "data": [{"n": i} for i in range(5)], "row_count": 5},
            "messageCode": "QUERY_EXECUTED"}))
    client = DuckQueryClient(cfg)
    out = await run_sql(client, cfg, sql="SELECT * FROM big")
    assert len(out["rows"]) == 2
    assert out["truncated"] is True
    assert out["row_count"] == 5


async def test_run_sql_blocks_write_in_readonly(cfg):
    ro = cfg.__class__(**{**cfg.__dict__, "mode": "read-only"})
    out = await run_sql(None, ro, sql="DROP TABLE t")  # short-circuits before any HTTP call
    assert "read-only" in out["error"].lower()


async def test_federated_query_blocks_write_in_readonly(cfg):
    ro = cfg.__class__(**{**cfg.__dict__, "mode": "read-only"})
    from duckquery_mcp.tools.query import federated_query
    out = await federated_query(None, ro, sql="DROP TABLE t", attach_databases=[])
    assert "read-only" in out["error"].lower()


@respx.mock
async def test_chat_passes_attach_databases(cfg):
    """chat 透传 attach_databases 原样给后端,外部表的真实 schema 才能进 AI 上下文。
    db_ 前缀归一化发生在 tools/__init__.py 的注册闭包层(见 test_normalize.py),
    这里的 attach_databases 已是归一化后的形状,验证透传不改写。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/ai/chat").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"content": "hi"}}))
    from duckquery_mcp.tools.query import chat
    await chat(DuckQueryClient(cfg), cfg,
               messages=[{"role": "user", "content": "q"}], tables=["m.t"],
               attach_databases=[{"alias": "m", "connection_id": "SORDER"}])
    sent = json.loads(route.calls.last.request.content)
    assert sent["tables"] == ["m.t"]
    assert sent["attach_databases"] == [{"alias": "m", "connection_id": "SORDER"}]


@respx.mock
async def test_chat_local_omits_attach(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/ai/chat").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"content": "hi"}}))
    from duckquery_mcp.tools.query import chat
    await chat(DuckQueryClient(cfg), cfg, messages=[{"role": "user", "content": "q"}])
    assert "attach_databases" not in json.loads(route.calls.last.request.content)


@respx.mock
async def test_error_fix_passes_schema_context(cfg):
    """error_fix 透传 tables/attach_databases/locale 原样给后端,报错医生按真实
    schema 出方案。db_ 前缀归一化发生在注册闭包层(见 test_normalize.py)。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/ai/error-fix").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"fixed_sql": "SELECT 1"}}))
    from duckquery_mcp.tools.query import error_fix
    await error_fix(DuckQueryClient(cfg), cfg, sql="SELECT x FROM m.t", error_message="boom",
                    tables=["m.t"], attach_databases=[{"alias": "m", "connection_id": "SORDER"}])
    sent = json.loads(route.calls.last.request.content)
    assert sent["sql"] == "SELECT x FROM m.t"
    assert sent["error"] == "boom"
    assert sent["tables"] == ["m.t"]
    assert sent["attach_databases"] == [{"alias": "m", "connection_id": "SORDER"}]
    assert sent["locale"] == "zh"


@respx.mock
async def test_ask_generates_then_runs(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.post(f"{base}/api/ai/nl-to-sql").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"sql": "SELECT 1 AS n"}}))
    respx.post(f"{base}/api/duckdb/execute").mock(
        return_value=httpx.Response(200, json={"success": True,
            "data": {"columns": ["n"], "data": [{"n": 1}], "row_count": 1}}))
    from duckquery_mcp.tools.query import ask
    client = DuckQueryClient(cfg)
    out = await ask(client, cfg, question="how many?")
    assert out["generated_sql"] == "SELECT 1 AS n"
    assert out["rows"] == [{"n": 1}]
