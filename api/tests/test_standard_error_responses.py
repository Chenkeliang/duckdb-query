"""标准错误体：422 校验与 perform_query 错误信封。"""

import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from main import app

client = TestClient(app, raise_server_exceptions=False)


def test_validation_error_422_standard_envelope():
    """Pydantic 422 须返回 success=false + error.code。"""
    response = client.post(
        "/api/visual-query/generate",
        json={
            "config": {
                "table_name": "",
                "selected_columns": [],
                "aggregations": [],
                "filters": [],
                "order_by": [],
                "is_distinct": False,
            },
            "preview": False,
            "include_metadata": False,
        },
    )
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["messageCode"] == "VALIDATION_ERROR"
    assert "detail" not in body
    assert isinstance(body["error"].get("details", {}).get("errors"), list)
    assert len(body["error"]["details"]["errors"]) > 0


def test_perform_query_empty_sources_standard_error():
    """JOIN /api/query 空 sources 走 APIValidationError。"""
    response = client.post("/api/query", json={"sources": [], "joins": []})
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "detail" not in body


def test_datasource_not_found_has_no_top_level_detail():
    """ResourceNotFoundError 响应不含顶层 detail。"""
    response = client.get("/api/datasources/db_nonexistent_id_for_test")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert "detail" not in body
    assert body["error"]["code"] == "RESOURCE_NOT_FOUND"


def test_save_query_to_duckdb_missing_table_alias_standard_error():
    """save_query_to_duckdb 缺表名须返回标准 VALIDATION_ERROR 信封。"""
    response = client.post(
        "/api/save_query_to_duckdb",
        json={
            "sql": "SELECT 1",
            "datasource": {"id": "duckdb_internal", "type": "duckdb"},
        },
    )
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "detail" not in body


def test_async_task_empty_sql_standard_error():
    """POST /api/async-tasks 空 SQL 须返回标准 VALIDATION_ERROR。"""
    response = client.post("/api/async-tasks", json={"sql": "   "})
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "detail" not in body


def test_async_task_not_found_standard_error():
    """GET /api/async-tasks/{id} 不存在任务须 RESOURCE_NOT_FOUND。"""
    response = client.get("/api/async-tasks/nonexistent-task-id-xyz")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_NOT_FOUND"
    assert "detail" not in body


def test_async_task_duplicate_attach_alias_standard_error():
    """联邦 attach 重复 alias 须 VALIDATION_ERROR。"""
    response = client.post(
        "/api/async-tasks",
        json={
            "sql": "SELECT 1",
            "attach_databases": [
                {"alias": "db1", "connection_id": "conn_a"},
                {"alias": "db1", "connection_id": "conn_b"},
            ],
        },
    )
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "detail" not in body


def test_sql_favorite_not_found_standard_error():
    """DELETE 不存在的收藏须 FAVORITE_NOT_FOUND 标准信封。"""
    response = client.delete("/api/sql-favorites/nonexistent-favorite-id-xyz")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "FAVORITE_NOT_FOUND"
    assert "detail" not in body


def test_settings_invalid_action_id_standard_error():
    """PUT /api/settings/shortcuts/{id} 无效 action_id 须 VALIDATION_ERROR。"""
    response = client.put(
        "/api/settings/shortcuts/not_a_real_action",
        json={"shortcut": "Cmd+X"},
    )
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "detail" not in body
    assert "Invalid action ID" in body["error"]["message"]


def test_url_info_unreachable_standard_error():
    """GET /api/url_info 不可达 URL 须 URL_INVALID 标准信封。"""
    response = client.get(
        "/api/url_info",
        params={"url": "http://127.0.0.1:1/nonexistent-file.csv"},
    )
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "URL_INVALID"
    assert "detail" not in body


def test_execute_sql_missing_datasource_id_standard_error():
    """execute_sql 外部库缺 datasource id 须返回标准 VALIDATION_ERROR。"""
    response = client.post(
        "/api/execute_sql",
        json={
            "sql": "SELECT 1",
            "datasource": {"type": "mysql"},
        },
    )
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "detail" not in body
