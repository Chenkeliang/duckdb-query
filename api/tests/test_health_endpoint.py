"""/health 时间戳回归:此前硬编码 "2025-01-18",应返回当前时间。"""
from datetime import datetime
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from core.common.timezone_utils import get_current_time

client = TestClient(app)


def test_health_returns_current_timestamp():
    before = get_current_time()
    resp = client.get("/health")
    after = get_current_time()
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
    parsed = datetime.fromisoformat(body["timestamp"])
    assert before <= parsed <= after


def test_health_timestamp_advances():
    values = ["2026-07-22T10:00:00+08:00", "2026-07-22T10:00:01+08:00"]
    with patch("main.get_current_time_iso", side_effect=values):
        t1 = client.get("/health").json()["timestamp"]
        t2 = client.get("/health").json()["timestamp"]
    assert [t1, t2] == values
