"""DuckDB error caret extraction regressions (2026-09-04)."""

import hashlib

import duckdb
import pytest

from core.common.sql_error_location import (
    build_sql_error_details,
    duckdb_error_message,
    parse_sql_error_location,
    structured_duckdb_errors,
)


def _location(sql: str):
    try:
        duckdb.connect(":memory:").execute(sql)
    except Exception as exc:  # pylint: disable=broad-except
        return parse_sql_error_location(str(exc), sql)
    raise AssertionError("Expected DuckDB to reject test SQL")


def test_extracts_single_line_parser_error_column():
    assert _location("SELECT 1 + missing") == {
        "line": 1,
        "column": 12,
        "end_column": 13,
    }


def test_extracts_multiline_binder_error_column():
    assert _location("SELECT\n  missing FROM range(1)") == {
        "line": 2,
        "column": 3,
        "end_column": 4,
    }


def test_returns_none_without_duckdb_caret():
    assert parse_sql_error_location("network failed", "SELECT 1") is None


def _json_error_location(sql: str):
    with duckdb.connect(":memory:") as connection:
        connection.execute("SET errors_as_json=true")
        try:
            connection.execute(sql)
        except Exception as exc:  # pylint: disable=broad-except
            return parse_sql_error_location(str(exc), sql)
    raise AssertionError("Expected DuckDB to reject test SQL")


def test_extracts_utf16_editor_range_from_json_error_with_utf8_text():
    sql = "SELECT '中文😀', missing"

    assert _json_error_location(sql) == {
        "line": 1,
        "column": 16,
        "end_column": 23,
    }


def test_extracts_multiline_range_from_json_error():
    sql = "SELECT 1\nFROM absent_table"

    assert _json_error_location(sql) == {
        "line": 2,
        "column": 6,
        "end_column": 18,
    }


def test_structured_error_lease_restores_setting_after_failure():
    """Regression 2026-09-07: pooled sessions cannot retain diagnostic settings."""
    with duckdb.connect(":memory:") as connection:
        assert connection.execute(
            "SELECT current_setting('errors_as_json')"
        ).fetchone() == (False,)
        with pytest.raises(duckdb.Error) as exc_info:
            with structured_duckdb_errors(connection):
                connection.execute("SELECT missing")
        assert '"exception_type":"Binder"' in str(exc_info.value)
        assert connection.execute(
            "SELECT current_setting('errors_as_json')"
        ).fetchone() == (False,)


def test_error_details_map_wrapped_execution_to_original_and_bind_identity():
    original = "SELECT '中文😀', missing"
    execution = f"SELECT * FROM ({original}) AS wrapped"
    with duckdb.connect(":memory:") as connection:
        connection.execute("SET errors_as_json=true")
        with pytest.raises(duckdb.Error) as exc_info:
            connection.execute(execution)

    details = build_sql_error_details(
        exc_info.value,
        original,
        execution,
        "sync:error-map",
    )
    assert details == {
        "sql_identity": {
            "query_id": "sync:error-map",
            "sha256": hashlib.sha256(original.encode()).hexdigest(),
        },
        "sql_location": {"line": 1, "column": 16, "end_column": 23},
    }
    assert not duckdb_error_message(exc_info.value).lstrip().startswith("{")


def test_error_details_map_trimmed_statement_back_to_editor_whitespace():
    original = "  SELECT missing;  "
    execution = "SELECT missing LIMIT 10"
    with duckdb.connect(":memory:") as connection:
        connection.execute("SET errors_as_json=true")
        with pytest.raises(duckdb.Error) as exc_info:
            connection.execute(execution)

    details = build_sql_error_details(exc_info.value, original, execution)

    assert details["sql_location"] == {
        "line": 1,
        "column": 10,
        "end_column": 17,
    }
