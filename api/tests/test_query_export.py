"""同步查询导出：行数来源与过期文件清理的回归测试。"""

import os
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

import routers.query_export as query_export
from core.common.config_manager import config_manager
from core.database.duckdb_engine import with_duckdb_connection
from main import app
from routers.async_tasks import EXPORTS_DIR, cleanup_old_files

client = TestClient(app)


def _exports_dir() -> str:
    return str(config_manager.get_exports_dir())


def _remove_export(file_id: str) -> None:
    for ext in ("parquet", "csv"):
        path = os.path.join(_exports_dir(), f"{file_id}.{ext}")
        if os.path.exists(path):
            os.remove(path)


def test_cleanup_removes_old_sync_export_file():
    file_id = uuid.uuid4().hex
    path = os.path.join(EXPORTS_DIR, f"{file_id}.parquet")
    Path(path).write_text("x")
    old = time.time() - 25 * 3600
    os.utime(path, (old, old))

    try:
        cleanup_old_files()
        assert not os.path.exists(path), "过期的同步导出文件应被清理"
    finally:
        if os.path.exists(path):
            os.remove(path)


def test_cleanup_keeps_recent_sync_export_file():
    file_id = uuid.uuid4().hex
    path = os.path.join(EXPORTS_DIR, f"{file_id}.csv")
    Path(path).write_text("x")  # 新文件，mtime 为当前

    try:
        cleanup_old_files()
        assert os.path.exists(path), "未过期的导出文件不应被清理"
    finally:
        if os.path.exists(path):
            os.remove(path)


def test_export_returns_actual_row_count():
    table = f"export_unit_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f'CREATE TABLE "{table}" AS SELECT * FROM range(5) AS r(i)')

    file_id = None
    try:
        resp = client.post(
            "/api/query-results/export",
            json={"sql": f'SELECT * FROM "{table}"', "format": "parquet"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        data = body["data"]
        assert data["row_count_estimate"] == 5
        file_id = data["file_id"]

        download = client.get(data["download_url"])
        assert download.status_code == 200
    finally:
        with with_duckdb_connection() as con:
            con.execute(f'DROP TABLE IF EXISTS "{table}"')
        if file_id:
            _remove_export(file_id)


def test_export_allows_select_with_keyword_in_string_literal():
    # 字符串字面量里含 "update" 不应被读写防护误杀（旧关键字黑名单会误杀）
    file_id = None
    try:
        resp = client.post(
            "/api/query-results/export",
            json={"sql": "SELECT 'please update soon' AS note", "format": "csv"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["row_count_estimate"] == 1
        file_id = data["file_id"]
    finally:
        if file_id:
            _remove_export(file_id)


def test_export_rejects_write_statement():
    resp = client.post(
        "/api/query-results/export",
        json={"sql": "DELETE FROM some_table_xyz", "format": "csv"},
    )
    assert resp.status_code == 400


def test_export_skips_metrics_connection_when_no_explain(monkeypatch):
    monkeypatch.setattr(
        config_manager.get_app_config(), "duckdb_auto_explain_threshold_ms", 0
    )
    table = f"export_metrics_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f'CREATE TABLE "{table}" AS SELECT * FROM range(2) AS r(i)')

    enters = {"n": 0}
    real_ctx = with_duckdb_connection

    @contextmanager
    def _counting():
        enters["n"] += 1
        with real_ctx() as con:
            yield con

    monkeypatch.setattr(query_export, "with_duckdb_connection", _counting)

    file_id = None
    try:
        resp = client.post(
            "/api/query-results/export",
            json={"sql": f'SELECT * FROM "{table}"', "format": "csv"},
        )
        assert resp.status_code == 200, resp.text
        file_id = resp.json()["data"]["file_id"]
        assert enters["n"] == 1, f"导出应只取一次连接，实际 {enters['n']} 次"
    finally:
        with real_ctx() as con:
            con.execute(f'DROP TABLE IF EXISTS "{table}"')
        if file_id:
            _remove_export(file_id)


def test_export_runs_user_query_once(monkeypatch):
    table = f"export_probe_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f'CREATE TABLE "{table}" AS SELECT * FROM range(3) AS r(i)')

    executed: list[str] = []
    real_ctx = with_duckdb_connection

    class _RecordingConn:
        def __init__(self, real):
            self._real = real

        def execute(self, sql, *args, **kwargs):
            executed.append(sql)
            return self._real.execute(sql, *args, **kwargs)

        def __getattr__(self, name):
            return getattr(self._real, name)

    @contextmanager
    def _recording():
        with real_ctx() as con:
            yield _RecordingConn(con)

    monkeypatch.setattr(query_export, "with_duckdb_connection", _recording)

    file_id = None
    try:
        resp = client.post(
            "/api/query-results/export",
            json={"sql": f'SELECT i AS __probe_col FROM "{table}"', "format": "csv"},
        )
        assert resp.status_code == 200
        file_id = resp.json()["data"]["file_id"]

        hits = [
            sql
            for sql in executed
            if "__probe_col" in sql and not sql.lstrip().upper().startswith("EXPLAIN")
        ]
        assert len(hits) == 1, f"用户查询被执行了 {len(hits)} 次: {hits}"
    finally:
        with real_ctx() as con:
            con.execute(f'DROP TABLE IF EXISTS "{table}"')
        if file_id:
            _remove_export(file_id)


def test_csv_export_preserves_numeric_flags_and_real_booleans():
    """回归(2026-07-21):数值 0/1 导出仍为 0/1，真正 BOOLEAN 仍保留布尔语义。"""
    file_id = None
    try:
        resp = client.post(
            "/api/query-results/export",
            json={
                "sql": (
                    "SELECT * FROM (VALUES "
                    "(0::TINYINT, false::BOOLEAN), "
                    "(1::TINYINT, true::BOOLEAN)) AS t(numeric_flag, boolean_flag)"
                ),
                "format": "csv",
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        file_id = data["file_id"]

        download = client.get(data["download_url"])
        assert download.status_code == 200
        lines = download.text.strip().splitlines()
        assert lines == ["numeric_flag,boolean_flag", "0,false", "1,true"]
    finally:
        if file_id:
            _remove_export(file_id)
