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


async def test_run_sql_requires_confirm_for_write_in_normal_mode(cfg):
    """回归：normal 模式(默认模式)下曾经完全没有任何 DDL/DML 确认门槛——
    is_write_sql 只在 read-only 模式下才被调用。"""
    assert cfg.mode == "normal"
    out = await run_sql(None, cfg, sql="DROP TABLE t")  # 短路，未传 confirm
    assert "confirm" in out["error"].lower()


@respx.mock
async def test_run_sql_write_proceeds_with_confirm_true(cfg):
    respx.get("http://127.0.0.1:48001/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post("http://127.0.0.1:48001/api/duckdb/execute").mock(
        return_value=httpx.Response(200, json={
            "success": True,
            "data": {"columns": [], "data": [], "row_count": 0},
            "messageCode": "QUERY_EXECUTED"}))
    client = DuckQueryClient(cfg)
    out = await run_sql(client, cfg, sql="DROP TABLE t", confirm=True)
    assert "error" not in out
    assert route.called


async def test_federated_query_requires_confirm_for_write_in_normal_mode(cfg):
    from duckquery_mcp.tools.query import federated_query
    assert cfg.mode == "normal"
    out = await federated_query(None, cfg, sql="DROP TABLE t", attach_databases=[])
    assert "confirm" in out["error"].lower()


async def test_run_sql_read_query_never_needs_confirm(cfg):
    """只读查询在任何非 read-only 模式下都不应该被 confirm 门槛拦住——
    confirm_required 的第一个参数(is_mutating)必须真的区分读写，不能变成
    "所有 SQL 都要 confirm" 这种更粗暴但错误的修复。"""
    with respx.mock:
        respx.get("http://127.0.0.1:48001/health").mock(
            return_value=httpx.Response(200, json={"status": "healthy"}))
        respx.post("http://127.0.0.1:48001/api/duckdb/execute").mock(
            return_value=httpx.Response(200, json={
                "success": True,
                "data": {"columns": ["n"], "data": [{"n": 1}], "row_count": 1},
                "messageCode": "QUERY_EXECUTED"}))
        client = DuckQueryClient(cfg)
        out = await run_sql(client, cfg, sql="SELECT 1 AS n")
        assert "error" not in out


# ============ 统一 Agent 工具:全部走 POST /api/ai/agent/run(mode 判别) ============


def _agent_run_mock(base, data):
    return respx.post(f"{base}/api/ai/agent/run").mock(
        return_value=httpx.Response(200, json={"success": True, "data": data}))


@respx.mock
async def test_ask_agent_data_qa(cfg):
    """ask_agent → mode=data_qa;history 拼在前、question 作末条 user;
    tables/attach_databases 落在 context(外部表真实 schema 才进 agent 授权范围)。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = _agent_run_mock(base, {
        "result": {"content": "2 笔", "sql": "SELECT 1", "evidence": ["t1"]},
        "termination_reason": "completed", "message": "", "run_id": "r1", "session_id": None})
    from duckquery_mcp.tools.query import ask_agent
    out = await ask_agent(
        DuckQueryClient(cfg), cfg, question="已支付几笔", tables=["m.t"],
        attach_databases=[{"alias": "m", "connection_id": "SORDER"}],
        history=[{"role": "user", "content": "上一问"}, {"role": "assistant", "content": "上一答"}])
    sent = json.loads(route.calls.last.request.content)
    assert sent["mode"] == "data_qa"
    assert sent["context"]["tables"] == ["m.t"]
    assert sent["context"]["attach_databases"] == [{"alias": "m", "connection_id": "SORDER"}]
    assert sent["input"]["messages"][-1] == {"role": "user", "content": "已支付几笔"}
    assert sent["input"]["messages"][0] == {"role": "user", "content": "上一问"}
    assert out["termination_reason"] == "completed"
    assert out["result"]["content"] == "2 笔"


@respx.mock
async def test_ask_agent_session_id_forwarded(cfg):
    """session_id 仅作关联标识,给了就透传;不给则请求体里没有该键。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = _agent_run_mock(base, {
        "result": {"content": "hi", "sql": None, "evidence": []},
        "termination_reason": "completed", "message": "", "run_id": "r1", "session_id": "s9"})
    from duckquery_mcp.tools.query import ask_agent
    await ask_agent(DuckQueryClient(cfg), cfg, question="q", session_id="s9")
    sent = json.loads(route.calls.last.request.content)
    assert sent["session_id"] == "s9"
    # 本地无外部库:context.attach_databases 为空列表(不是缺键)
    assert sent["context"]["attach_databases"] == []


@respx.mock
async def test_ask_agent_no_session_id(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = _agent_run_mock(base, {
        "result": {"content": "hi", "sql": None, "evidence": []},
        "termination_reason": "completed", "message": "", "run_id": "r1", "session_id": None})
    from duckquery_mcp.tools.query import ask_agent
    await ask_agent(DuckQueryClient(cfg), cfg, question="q")
    assert "session_id" not in json.loads(route.calls.last.request.content)


@respx.mock
async def test_generate_sql_validates_not_executes(cfg):
    """generate_sql → mode=generate_sql;返回校验过的 SQL 草案,不代为执行。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = _agent_run_mock(base, {
        "result": {"sql": "SELECT 1 AS n", "used_tables": ["orders"]},
        "termination_reason": "completed", "message": "", "run_id": "r1", "session_id": None})
    from duckquery_mcp.tools.query import generate_sql
    out = await generate_sql(DuckQueryClient(cfg), cfg, question="how many?", tables=["orders"])
    sent = json.loads(route.calls.last.request.content)
    assert sent["mode"] == "generate_sql"
    assert sent["input"] == {"question": "how many?"}
    assert sent["context"]["tables"] == ["orders"]
    assert out["result"]["sql"] == "SELECT 1 AS n"


@respx.mock
async def test_repair_sql_passes_schema_context(cfg):
    """repair_sql → mode=repair_sql;tables/attach_databases 落 context,报错医生按真实
    schema 出方案。db_ 前缀归一化发生在注册闭包层(见 test_normalize.py)。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = _agent_run_mock(base, {
        "result": {"explanation": "列名错了", "fixed_sql": "SELECT 1"},
        "termination_reason": "completed", "message": "", "run_id": "r1", "session_id": None})
    from duckquery_mcp.tools.query import repair_sql
    out = await repair_sql(DuckQueryClient(cfg), cfg, sql="SELECT x FROM m.t", error_message="boom",
                           tables=["m.t"], attach_databases=[{"alias": "m", "connection_id": "SORDER"}])
    sent = json.loads(route.calls.last.request.content)
    assert sent["mode"] == "repair_sql"
    assert sent["input"] == {"sql": "SELECT x FROM m.t", "error": "boom"}
    assert sent["context"]["tables"] == ["m.t"]
    assert sent["context"]["attach_databases"] == [{"alias": "m", "connection_id": "SORDER"}]
    assert out["result"]["fixed_sql"] == "SELECT 1"


@respx.mock
async def test_explain_sql_no_tools_context(cfg):
    """explain_sql → mode=explain_sql;无表上下文,仅 locale。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = _agent_run_mock(base, {
        "result": {"explanation": "取所有订单"},
        "termination_reason": "completed", "message": "", "run_id": "r1", "session_id": None})
    from duckquery_mcp.tools.query import explain_sql
    out = await explain_sql(DuckQueryClient(cfg), cfg, sql="SELECT * FROM orders", locale="zh")
    sent = json.loads(route.calls.last.request.content)
    assert sent["mode"] == "explain_sql"
    assert sent["input"] == {"sql": "SELECT * FROM orders"}
    assert sent["context"] == {"locale": "zh"}
    assert out["result"]["explanation"] == "取所有订单"


@respx.mock
async def test_suggest_chart_result_or_null(cfg):
    """suggest_chart → mode=suggest_chart;返回 ChartSpec 或 null(回退)。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = _agent_run_mock(base, {
        "result": {"type": "bar", "x": "cat", "y": ["amt"], "agg": "sum"},
        "termination_reason": "completed", "message": "", "run_id": "r1", "session_id": None})
    from duckquery_mcp.tools.query import suggest_chart
    out = await suggest_chart(DuckQueryClient(cfg), cfg,
                              columns=[{"name": "cat", "type": "VARCHAR"}, {"name": "amt", "type": "DOUBLE"}],
                              sample=[{"cat": "a", "amt": 1}])
    sent = json.loads(route.calls.last.request.content)
    assert sent["mode"] == "suggest_chart"
    assert sent["input"]["columns"][0] == {"name": "cat", "type": "VARCHAR"}
    assert sent["context"] == {"locale": "zh"}
    assert out["result"]["type"] == "bar"
