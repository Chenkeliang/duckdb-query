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


def test_real_double_scientific_notation_is_numeric():
    """复审 P2:真实 DOUBLE 0.0000004 文本形态是 4e-07,旧正则算成非数字。
    现用 TRY_CAST(DOUBLE) 识别 + 按有效小数位得 scale。"""
    with with_duckdb_connection() as con:
        con.execute(
            'CREATE OR REPLACE TABLE "qa_ic_dbl" AS '
            "SELECT * FROM (VALUES (0.0000004::DOUBLE), (1.0000004::DOUBLE)) v(a)"
        )
    try:
        data = _infer("qa_ic_dbl")
        assert data["recommended"] == "DECIMAL(38,7)"
        assert data["non_numeric"] == 0
    finally:
        _drop("qa_ic_dbl")


def test_high_precision_decimal_text_keeps_exact_scale():
    # 纯文本高精度小数(19 位)不经 DOUBLE 丢精度,标度按文本有效位
    _make_table("qa_ic_hp19", ["0.1234567890123456789", "1"])
    try:
        assert _infer("qa_ic_hp19")["recommended"] == "DECIMAL(38,19)"
    finally:
        _drop("qa_ic_hp19")
