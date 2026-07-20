"""/api/columns/infer-cast:数据感知的列 cast 推断。DECIMAL 标度取自实际数据。"""
import pytest
from fastapi.testclient import TestClient

from main import app
from core.database.duckdb_engine import with_duckdb_connection

client = TestClient(app)


def _make_table(name, values):
    rows = ", ".join(f"('{v}')" for v in values)
    with with_duckdb_connection() as con:
        con.execute(f'CREATE OR REPLACE TABLE "{name}" AS SELECT * FROM (VALUES {rows}) v(a)')


def _drop(name):
    with with_duckdb_connection() as con:
        con.execute(f'DROP TABLE IF EXISTS "{name}"')


def _infer(table, column="a", **kw):
    r = client.post("/api/columns/infer-cast",
                    json={"table_name": table, "column": column, **kw})
    assert r.status_code == 200, r.text
    return r.json()["data"]


def test_mixed_int_decimal_recommends_decimal_with_actual_scale():
    _make_table("qa_ic_mixed", ["1", "2.50", "3"])
    try:
        data = _infer("qa_ic_mixed")
        assert data["recommended"] == "DECIMAL(38,2)"
        assert data["non_numeric"] == 0
    finally:
        _drop("qa_ic_mixed")


def test_all_integer_recommends_bigint():
    _make_table("qa_ic_int", ["1", "20", "300"])
    try:
        assert _infer("qa_ic_int")["recommended"] == "BIGINT"
    finally:
        _drop("qa_ic_int")


def test_high_precision_float_text_keeps_scale():
    # DECIMAL 标度取自数据(7 位),而非固定 6——这是避免舍入假匹配的关键
    _make_table("qa_ic_hp", ["1.0000004", "1.0"])
    try:
        assert _infer("qa_ic_hp")["recommended"] == "DECIMAL(38,7)"
    finally:
        _drop("qa_ic_hp")


def test_non_numeric_rows_yield_no_recommendation_and_count():
    _make_table("qa_ic_bad", ["1", "abc", "2.5"])
    try:
        data = _infer("qa_ic_bad")
        assert data["recommended"] is None
        assert data["non_numeric"] == 1
    finally:
        _drop("qa_ic_bad")
