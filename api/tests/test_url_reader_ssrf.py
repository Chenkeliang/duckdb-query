"""url_reader SSRF 防护：拒绝指向 loopback / link-local(云元数据) 等内部地址。"""

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

import routers.url_reader as url_reader
from main import app

client = TestClient(app)


def _block_outbound(monkeypatch):
    def _boom(*args, **kwargs):
        raise AssertionError("outbound request must be blocked before any fetch")

    monkeypatch.setattr(url_reader.requests, "head", _boom)
    monkeypatch.setattr(url_reader.requests, "get", _boom)


def test_read_from_url_blocks_cloud_metadata(monkeypatch):
    _block_outbound(monkeypatch)
    resp = client.post(
        "/api/read_from_url",
        json={
            "url": "http://169.254.169.254/latest.csv",
            "table_alias": "ssrf_meta",
            "prefer_native": False,
        },
    )
    assert resp.status_code == 400
    assert "SSRF_BLOCKED" in resp.text


def test_read_from_url_blocks_loopback(monkeypatch):
    _block_outbound(monkeypatch)
    resp = client.post(
        "/api/read_from_url",
        json={
            "url": "http://127.0.0.1:9999/data.csv",
            "table_alias": "ssrf_loop",
            "prefer_native": False,
        },
    )
    assert resp.status_code == 400
    assert "SSRF_BLOCKED" in resp.text
