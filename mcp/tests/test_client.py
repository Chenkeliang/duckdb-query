import respx
import httpx
import pytest
from duckquery_mcp.client import DuckQueryClient, BackendNotFound


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
