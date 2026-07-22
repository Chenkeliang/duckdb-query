"""/health 时间戳回归:此前硬编码 "2025-01-18",应返回当前时间。"""
from datetime import datetime

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_returns_current_timestamp():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
    # 不再是历史硬编码值,且必须是可解析的 ISO 时间
    assert body["timestamp"] != "2025-01-18"
    parsed = datetime.fromisoformat(body["timestamp"])
    assert parsed.year >= 2026


def test_health_timestamp_advances():
    t1 = client.get("/health").json()["timestamp"]
    t2 = client.get("/health").json()["timestamp"]
    # 同一进程两次调用返回的时间戳应各自生成(允许相等到秒级,但类型/格式一致)
    assert datetime.fromisoformat(t2) >= datetime.fromisoformat(t1)
