"""入湖 / 数据源相关端点的标准错误信封。"""

import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from main import app

client = TestClient(app, raise_server_exceptions=False)


def test_datasource_not_found_standard_envelope():
    missing_id = f"db_{uuid.uuid4().hex}"
    response = client.get(f"/api/datasources/{missing_id}")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_NOT_FOUND"
    assert "detail" not in body
    assert missing_id in body["error"]["message"]


def test_paste_data_empty_table_name_validation_envelope():
    response = client.post(
        "/api/paste-data",
        json={
            "table_name": "   ",
            "column_names": ["a"],
            "column_types": ["VARCHAR"],
            "data_rows": [["1"]],
        },
    )
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "Table name" in body["error"]["message"]


def test_excel_inspect_missing_file_standard_envelope():
    response = client.post(
        "/api/data-sources/excel/inspect",
        json={"file_id": "nonexistent-pending-excel-id"},
    )
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "FILE_NOT_FOUND"
    assert "detail" not in body


def test_upload_invalid_import_mode_standard_envelope():
    response = client.post(
        "/api/upload",
        data={"import_mode": "not-a-valid-mode"},
        files={"file": ("test.csv", b"a,b\n1,2", "text/csv")},
    )
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "detail" not in body


def test_database_tables_unknown_connection_envelope():
    missing_id = f"db_{uuid.uuid4().hex}"
    response = client.get(f"/api/datasources/databases/{missing_id}/tables")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_NOT_FOUND"
    assert "detail" not in body


def test_chunked_upload_cancel_missing_session_envelope():
    response = client.delete(f"/api/upload/cancel/{uuid.uuid4()}")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_NOT_FOUND"
