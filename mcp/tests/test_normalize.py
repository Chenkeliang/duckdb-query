import json

import httpx
import respx
from mcp.server.fastmcp import FastMCP

from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools import _normalize_kwargs, register_all
from duckquery_mcp.util import normalize_attach_list, normalize_connection_id


def test_normalize_strips_db_prefix():
    assert normalize_connection_id("db_SORDER") == "SORDER"
    assert normalize_connection_id("SORDER") == "SORDER"
    assert normalize_connection_id("db_db_x") == "db_x"  # only one prefix stripped


def test_normalize_attach_list():
    out = normalize_attach_list([{"alias": "m", "connection_id": "db_SORDER"}, {"alias": "x"}])
    assert out[0] == {"alias": "m", "connection_id": "SORDER"}
    assert out[1] == {"alias": "x"}  # 缺 connection_id 原样透传,由后端校验
    assert normalize_attach_list(None) == []


def test_normalize_kwargs_strips_bare_connection_id():
    """裸标量 connection_id(如 list_db_objects 的参数)在注册闭包层被归一化。"""
    out = _normalize_kwargs({"connection_id": "db_SORDER", "kind": "tables"})
    assert out == {"connection_id": "SORDER", "kind": "tables"}


def test_normalize_kwargs_strips_attach_list():
    """attach_databases 列表(federated_query/ask_agent/generate_sql/repair_sql/
    save_as_table/export_results 共用的形状)在注册闭包层被归一化。"""
    out = _normalize_kwargs({
        "sql": "SELECT 1",
        "attach_databases": [{"alias": "m", "connection_id": "db_SORDER"}],
    })
    assert out["attach_databases"] == [{"alias": "m", "connection_id": "SORDER"}]
    assert out["sql"] == "SELECT 1"  # 不相关字段原样透传


def test_normalize_kwargs_passthrough_when_absent():
    """既无 connection_id 也无 attach_databases 时原样返回,不引入多余键。"""
    out = _normalize_kwargs({"sql": "SELECT 1"})
    assert out == {"sql": "SELECT 1"}


def _get_registered_tool_fn(mcp: FastMCP, name: str):
    """从 register_all 真实注册的 _tool_manager 里取回原始闭包,绕过 MCP 协议的
    ContentBlock 序列化层,但仍然走 add(tier)->wrapped 这条真实归一化路径。"""
    return mcp._tool_manager.get_tool(name).fn


@respx.mock
async def test_list_db_objects_strips_id_via_registration(cfg):
    """回归:list_db_objects 自身不再做归一化,必须由注册闭包代劳。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.get(f"{base}/api/datasources/databases/SORDER/tables").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {
            "connection_id": "SORDER", "database": "store_order",
            "tables": [{"table_name": "t1", "table_comment": "c1", "columns": [{"name": "a"}]}],
        }}))

    mcp = FastMCP("test")
    register_all(mcp, DuckQueryClient(cfg), cfg)
    fn = _get_registered_tool_fn(mcp, "list_db_objects")

    out = await fn(connection_id="db_SORDER")
    assert route.called
    assert out["table_count"] == 1


@respx.mock
async def test_federated_query_strips_connection_id_via_registration(cfg):
    """回归:federated_query 自身不再做归一化,必须由注册闭包代劳。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/duckdb/federated-query").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {
            "columns": ["n"], "data": [{"n": 1}], "row_count": 1}}))

    mcp = FastMCP("test")
    register_all(mcp, DuckQueryClient(cfg), cfg)
    fn = _get_registered_tool_fn(mcp, "federated_query")

    await fn(sql="SELECT 1 AS n FROM m.t",
             attach_databases=[{"alias": "m", "connection_id": "db_SORDER"}])
    sent = json.loads(route.calls.last.request.content)
    assert sent["attach_databases"][0]["connection_id"] == "SORDER"


@respx.mock
async def test_save_as_table_strips_connection_id_via_registration(cfg):
    """回归:save_as_table 是"write"层级工具,自身不再做归一化,同样必须由
    注册闭包代劳——此前只验证过 read 层级工具(list_db_objects/federated_query),
    这里补上 write 层级的等价证明。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/save_query_to_duckdb").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"table_alias": "t3"}}))

    mcp = FastMCP("test")
    register_all(mcp, DuckQueryClient(cfg), cfg)
    fn = _get_registered_tool_fn(mcp, "save_as_table")

    await fn(sql="SELECT * FROM m.t", table_name="t3",
             attach_databases=[{"alias": "m", "connection_id": "db_SORDER"}],
             confirm=True)
    sent = json.loads(route.calls.last.request.content)
    assert sent["attach_databases"][0]["connection_id"] == "SORDER"
