from uuid import uuid4

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from core.duckdb_engine import with_duckdb_connection
from core.file_datasource_manager import file_datasource_manager
from main import app


client = TestClient(app)


def _cleanup_table(table_name: str):
    with with_duckdb_connection() as con:
        con.execute(f'DROP TABLE IF EXISTS "{table_name}"')


def test_paste_data_creates_typed_table():
    table_name = f"paste_unit_{uuid4().hex[:8]}"
    payload = {
        "table_name": table_name,
        "column_names": [
            "id",
            "price",
            "is_active",
            "event_time",
            "note",
        ],
        "column_types": ["INTEGER", "DOUBLE", "BOOLEAN", "DATE", "VARCHAR"],
        "data_rows": [
            ["001", "3.14", "true", "2024-01-01 12:00:00", " alpha "],
        ],
        "delimiter": ",",
        "has_header": False,
    }

    response = client.post("/api/paste-data", json=payload)
    data = response.json()

    try:
        assert response.status_code == 200
        assert data["success"] is True
        assert data["table_name"] == table_name
        assert data["rows_saved"] == 1
        assert data["createdAt"] == data["created_at"]

        with with_duckdb_connection() as con:
            pragma_rows = con.execute(
                f'PRAGMA table_info("{table_name}")'
            ).fetchall()
            column_types = {row[1]: row[2] for row in pragma_rows}
            assert column_types == {
                "id": "BIGINT",
                "price": "DOUBLE",
                "is_active": "BOOLEAN",
                "event_time": "TIMESTAMP",
                "note": "VARCHAR",
            }

            stored_row = con.execute(f'SELECT * FROM "{table_name}"').fetchone()
            assert stored_row[0] == 1
            assert stored_row[1] == 3.14
            assert stored_row[2] is True
            assert stored_row[3].isoformat().startswith("2024-01-01T12:00:00")
            assert stored_row[4] == "alpha"

        metadata = file_datasource_manager.get_file_datasource(table_name)
        assert metadata is not None
        assert metadata["row_count"] == 1
        assert metadata["column_count"] == 5
    finally:
        _cleanup_table(table_name)


def test_paste_data_defaults_for_empty_cells():
    table_name = f"paste_unit_{uuid4().hex[:8]}"
    payload = {
        "table_name": table_name,
        "column_names": [
            "id",
            "price",
            "is_active",
            "event_time",
            "note",
        ],
        "column_types": ["INTEGER", "DOUBLE", "BOOLEAN", "DATE", "VARCHAR"],
        "data_rows": [["", "", "", "", ""]],
        "delimiter": ",",
        "has_header": False,
    }

    response = client.post("/api/paste-data", json=payload)
    data = response.json()

    try:
        assert response.status_code == 200
        assert data["rows_saved"] == 1

        with with_duckdb_connection() as con:
            stored_row = con.execute(f'SELECT * FROM "{table_name}"').fetchone()
            assert stored_row[0] == 0  # INTEGER 默认值
            assert stored_row[1] == 0.0  # DOUBLE 默认值
            assert stored_row[2] is False  # BOOLEAN 默认值
            assert stored_row[3] is None  # DATE 无法解析为 NULL
            assert stored_row[4] == ""  # VARCHAR 默认为空串
    finally:
        _cleanup_table(table_name)
