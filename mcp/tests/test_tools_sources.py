import respx
import httpx
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools.sources import add_local_file_source, import_excel


@respx.mock
async def test_add_local_file_source(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/server-files/import").mock(
        return_value=httpx.Response(200, json={"success": True,
            "data": {"table_name": "sales", "row_count": 42}}))
    out = await add_local_file_source(DuckQueryClient(cfg), cfg, path="/data/sales.csv", confirm=True)
    assert out["table_name"] == "sales"
    sent = route.calls.last.request
    assert b"/data/sales.csv" in sent.content


@respx.mock
async def test_add_local_file_source_requires_confirm_in_normal_mode(cfg):
    """回归：没有原生文件对话框把关的路径读取，normal 模式下必须显式 confirm=true。"""
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/server-files/import").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {}}))
    out = await add_local_file_source(DuckQueryClient(cfg), cfg, path="/etc/passwd")
    assert "error" in out
    assert not route.called


@respx.mock
async def test_add_local_file_source_blocked_in_read_only_mode():
    """read-only 模式下即便传 confirm=true 也必须硬性拒绝——confirm 是调用方
    自己传的，不能当成越过只读隔离的凭据。"""
    from duckquery_mcp.config import Config

    ro_cfg = Config(api_base=None, mode="read-only", timeout=5.0,
                     row_cap=200, probe_ports=(48001, 8000, 8001))
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/server-files/import").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {}}))
    out = await add_local_file_source(
        DuckQueryClient(ro_cfg), ro_cfg, path="/etc/passwd", confirm=True
    )
    assert "error" in out
    assert not route.called


@respx.mock
async def test_import_excel_requires_confirm_in_normal_mode(cfg):
    base = "http://127.0.0.1:48001"
    respx.get(f"{base}/health").mock(return_value=httpx.Response(200, json={"status": "healthy"}))
    route = respx.post(f"{base}/api/server-files/excel/import").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {}}))
    out = await import_excel(DuckQueryClient(cfg), cfg, path="/data/book.xlsx", sheets=[])
    assert "error" in out
    assert not route.called

    out_confirmed = await import_excel(
        DuckQueryClient(cfg), cfg, path="/data/book.xlsx", sheets=[], confirm=True
    )
    assert "error" not in out_confirmed
    assert route.called
