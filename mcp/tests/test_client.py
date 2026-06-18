import respx
import httpx
import pytest
from duckquery_mcp.client import DuckQueryClient, BackendNotFound, BackendError


@respx.mock
async def test_probe_finds_healthy_backend(cfg):
    respx.get("http://127.0.0.1:48001/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    client = DuckQueryClient(cfg)
    assert await client.base() == "http://127.0.0.1:48001"


@respx.mock
async def test_env_base_wins(cfg):
    cfg = cfg.__class__(**{**cfg.__dict__, "api_base": "http://127.0.0.1:7000"})
    respx.get("http://127.0.0.1:7000/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    client = DuckQueryClient(cfg)
    assert await client.base() == "http://127.0.0.1:7000"


@respx.mock
async def test_none_found_raises(cfg):
    respx.get(url__regex=r".*/health").mock(return_value=httpx.Response(503))
    client = DuckQueryClient(cfg)
    with pytest.raises(BackendNotFound):
        await client.base()


@respx.mock
async def test_call_unwraps_success_envelope(cfg):
    respx.get("http://127.0.0.1:48001/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.post("http://127.0.0.1:48001/api/duckdb/execute").mock(
        return_value=httpx.Response(200, json={
            "success": True, "data": {"row_count": 1, "data": [{"n": 16}]},
            "messageCode": "QUERY_EXECUTED"}))
    client = DuckQueryClient(cfg)
    out = await client.call("POST", "/api/duckdb/execute", json_body={"sql": "SELECT 8+8 AS n"})
    assert out["row_count"] == 1


@respx.mock
async def test_call_raises_on_failure_envelope(cfg):
    respx.get("http://127.0.0.1:48001/health").mock(
        return_value=httpx.Response(200, json={"status": "healthy"}))
    respx.post("http://127.0.0.1:48001/api/duckdb/execute").mock(
        return_value=httpx.Response(200, json={
            "success": False, "message": "syntax error", "messageCode": "QUERY_FAILED"}))
    client = DuckQueryClient(cfg)
    with pytest.raises(BackendError, match="syntax error"):
        await client.call("POST", "/api/duckdb/execute", json_body={"sql": "SELEC 1"})
