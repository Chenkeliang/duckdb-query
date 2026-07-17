from uuid import uuid4

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from core.database.duckdb_engine import with_duckdb_connection
from core.data.file_datasource_manager import file_datasource_manager
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
    body = response.json()
    result = body["data"]

    try:
        assert response.status_code == 200
        assert body["success"] is True
        assert result["table_name"] == table_name
        assert result["rows_saved"] == 1
        assert result["createdAt"] == result["created_at"]

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
    body = response.json()

    try:
        assert response.status_code == 200
        assert body["data"]["rows_saved"] == 1

        with with_duckdb_connection() as con:
            stored_row = con.execute(f'SELECT * FROM "{table_name}"').fetchone()
            # 空数值格→NULL(不再造 0):INTEGER/DOUBLE 现与 DECIMAL/DATE 同语义,
            # "缺失"不再被伪装成真实值 0
            assert stored_row[0] is None  # INTEGER 空→NULL
            assert stored_row[1] is None  # DOUBLE 空→NULL
            assert stored_row[2] is False  # BOOLEAN 默认值(保持既有语义)
            assert stored_row[3] is None  # DATE 空→NULL
            assert stored_row[4] == ""  # VARCHAR 默认为空串(粘贴 VARCHAR 契约)
    finally:
        _cleanup_table(table_name)


def test_paste_decimal_infers_scale_and_keeps_exact_text():
    """DECIMAL 泛型:标度按列内最大小数位推断,12.50 原样保真(回归:曾只有
    DOUBLE 选项,12.50 落库变 12.5)。"""
    table_name = f"paste_dec_{uuid4().hex[:8]}"
    payload = {
        "table_name": table_name,
        "column_names": ["amt"],
        "column_types": ["DECIMAL"],
        "data_rows": [["12.50"], ["3.00"], ["0.01"]],
        "delimiter": ",",
        "has_header": False,
    }
    response = client.post("/api/paste-data", json=payload)
    try:
        assert response.json()["success"] is True
        with with_duckdb_connection() as con:
            col_type = {r[1]: r[2] for r in con.execute(
                f'PRAGMA table_info("{table_name}")').fetchall()}["amt"]
            assert col_type == "DECIMAL(38,2)", col_type
            vals = [str(r[0]) for r in con.execute(
                f'SELECT amt FROM "{table_name}" ORDER BY amt').fetchall()]
            assert vals == ["0.01", "3.00", "12.50"], vals
    finally:
        _cleanup_table(table_name)
        file_datasource_manager.delete_file_datasource(table_name)


def test_paste_decimal_mixed_scale_normalizes_without_rounding():
    table_name = f"paste_dec_{uuid4().hex[:8]}"
    payload = {
        "table_name": table_name,
        "column_names": ["v"],
        "column_types": ["DECIMAL"],
        "data_rows": [["1.5"], ["1.505"]],
        "delimiter": ",",
        "has_header": False,
    }
    response = client.post("/api/paste-data", json=payload)
    try:
        assert response.json()["success"] is True
        with with_duckdb_connection() as con:
            col_type = {r[1]: r[2] for r in con.execute(
                f'PRAGMA table_info("{table_name}")').fetchall()}["v"]
            assert col_type == "DECIMAL(38,3)", col_type  # 最大标度归一,数值不变
            vals = [str(r[0]) for r in con.execute(
                f'SELECT v FROM "{table_name}" ORDER BY v').fetchall()]
            assert vals == ["1.500", "1.505"], vals
    finally:
        _cleanup_table(table_name)
        file_datasource_manager.delete_file_datasource(table_name)


def test_paste_decimal_falls_back_to_varchar_on_mixed_content():
    """混杂文本/零前导编码列:宁保 VARCHAR 忠实文本,绝不静默变值。"""
    for rows, expected in (
        ([["12.50"], ["abc"]], ["12.50", "abc"]),          # 混杂文本
        ([["007.50"], ["1.25"]], ["007.50", "1.25"]),      # 零前导=编码语义
    ):
        table_name = f"paste_dec_{uuid4().hex[:8]}"
        payload = {
            "table_name": table_name,
            "column_names": ["v"],
            "column_types": ["DECIMAL"],
            "data_rows": rows,
            "delimiter": ",",
            "has_header": False,
        }
        response = client.post("/api/paste-data", json=payload)
        try:
            assert response.json()["success"] is True
            with with_duckdb_connection() as con:
                col_type = {r[1]: r[2] for r in con.execute(
                    f'PRAGMA table_info("{table_name}")').fetchall()}["v"]
                assert col_type == "VARCHAR", (rows, col_type)
                vals = sorted(str(r[0]) for r in con.execute(
                    f'SELECT v FROM "{table_name}"').fetchall())
                assert vals == sorted(expected), vals
        finally:
            _cleanup_table(table_name)
            file_datasource_manager.delete_file_datasource(table_name)


def test_paste_decimal_integer_column_and_empty_cells():
    table_name = f"paste_dec_{uuid4().hex[:8]}"
    payload = {
        "table_name": table_name,
        "column_names": ["n", "amt"],
        "column_types": ["DECIMAL", "DECIMAL"],
        "data_rows": [["12", "12.50"], ["7", ""]],
        "delimiter": ",",
        "has_header": False,
    }
    response = client.post("/api/paste-data", json=payload)
    try:
        assert response.json()["success"] is True
        with with_duckdb_connection() as con:
            types = {r[1]: r[2] for r in con.execute(
                f'PRAGMA table_info("{table_name}")').fetchall()}
            assert types["n"] == "BIGINT", types      # 全整数列推断为 BIGINT(同样无损)
            assert types["amt"] == "DECIMAL(38,2)", types
            rows = con.execute(
                f'SELECT n, amt FROM "{table_name}" ORDER BY n').fetchall()
            assert (rows[0][0], str(rows[0][1])) == (7, "None"), rows  # 空值→NULL,不造 0
            assert (rows[1][0], str(rows[1][1])) == (12, "12.50"), rows
    finally:
        _cleanup_table(table_name)
        file_datasource_manager.delete_file_datasource(table_name)


def test_paste_date_infers_pure_date_vs_timestamp():
    """DATE 泛型按列内容定型(与 CSV 导入一致):纯日期列→DATE,
    含时间→TIMESTAMP;有内容但非日期→VARCHAR 忠实文本。"""
    cases = [
        ([["2026-01-01"], ["2026-03-15"]], "DATE"),
        ([["2026-01-01 10:30:00"], ["2026-03-15 08:00:00"]], "TIMESTAMP"),
        ([["abc"], ["2026-01-01"]], "VARCHAR"),  # 混杂:保文本,不造 NULL
    ]
    for rows, expected_type in cases:
        table_name = f"paste_date_{uuid4().hex[:8]}"
        payload = {
            "table_name": table_name,
            "column_names": ["d"],
            "column_types": ["DATE"],
            "data_rows": rows,
            "delimiter": ",",
            "has_header": False,
        }
        response = client.post("/api/paste-data", json=payload)
        try:
            assert response.json()["success"] is True, (rows, response.text)
            with with_duckdb_connection() as con:
                col_type = {r[1]: r[2] for r in con.execute(
                    f'PRAGMA table_info("{table_name}")').fetchall()}["d"]
                assert col_type == expected_type, (rows, col_type)
                n = con.execute(
                    f'SELECT count(*) FROM "{table_name}"').fetchone()[0]
                assert n == len(rows)
        finally:
            _cleanup_table(table_name)
            file_datasource_manager.delete_file_datasource(table_name)
