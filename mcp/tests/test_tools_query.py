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
