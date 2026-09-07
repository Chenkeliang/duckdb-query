"""DuckDB error caret extraction regressions (2026-09-04)."""

import duckdb

from core.common.sql_error_location import parse_sql_error_location


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
