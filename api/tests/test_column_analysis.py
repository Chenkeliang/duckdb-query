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


def test_real_double_scientific_notation_recognized_but_not_quantized():
    """复审:真实 DOUBLE 0.0000004 文本形态是 4e-07。旧正则算成非数字(错);旧 DECIMAL(38,15)
    归一又会把更小的 1e-20 静默舍成 0(错)。现:识别为数字(non_numeric=0),但科学计数法
    值不自动量化成 DECIMAL(recommended=None)——二进制浮点量化本就有损,交用户显式选(P2 指引)。"""
    with with_duckdb_connection() as con:
        con.execute(
            'CREATE OR REPLACE TABLE "qa_ic_dbl" AS '
            "SELECT * FROM (VALUES (0.0000004::DOUBLE), (1.0000004::DOUBLE)) v(a)"
        )
    try:
        data = _infer("qa_ic_dbl")
        assert data["recommended"] is None
        assert data["non_numeric"] == 0  # 是数字,只是不自动量化
    finally:
        _drop("qa_ic_dbl")


def test_high_precision_decimal_text_keeps_exact_scale():
    # 纯文本高精度小数(19 位)不经 DOUBLE 丢精度,标度按文本有效位
    _make_table("qa_ic_hp19", ["0.1234567890123456789", "1"])
    try:
        assert _infer("qa_ic_hp19")["recommended"] == "DECIMAL(38,19)"
    finally:
        _drop("qa_ic_hp19")


def test_large_25_digit_integer_recommends_decimal38():
    # 复审:24-38 位大整数曾因固定 DECIMAL(38,15) 中间量误判为 None;现按文本标度 → DECIMAL(38,0)
    _make_table("qa_ic_big", ["1234567890123456789012345", "1"])
    try:
        assert _infer("qa_ic_big")["recommended"] == "DECIMAL(38,0)"
    finally:
        _drop("qa_ic_big")


def test_tiny_scientific_value_not_silently_rounded():
    # 复审(HIGH):'1e-20' 曾被荐 BIGINT 并静默舍成 0;现不自动推荐,交显式选择
    _make_table("qa_ic_tiny", ["1e-20", "1"])
    try:
        data = _infer("qa_ic_tiny")
        assert data["recommended"] is None
        assert data["non_numeric"] == 0  # 是数字,只是不安全量化
    finally:
        _drop("qa_ic_tiny")


def test_infinity_text_counts_as_non_numeric():
    # VARCHAR 文本 'Infinity':TRY_CAST(DOUBLE)=inf 但 isfinite 为假 → 计非数字(不静默当 0 求和)。
    # (若源列本就是 DOUBLE 则走 binary_float 短路,见 test_binary_float_double_column_not_quantized)
    _make_table("qa_ic_inf", ["Infinity", "1.0"])
    try:
        data = _infer("qa_ic_inf")
        assert data["recommended"] is None
        assert data["non_numeric"] == 1
        assert data["reason"] == "non_numeric"
    finally:
        _drop("qa_ic_inf")


def test_binary_float_double_column_not_quantized():
    """对抗复审(medium):源列本就是 DOUBLE 时,CAST(AS VARCHAR) 是最短往返串,某行浮点残差
    (0.1+0.2=0.30000000000000004,17 位小数)会把整列标度抬到 17;而 TRY_CAST 实际作用在裸
    DOUBLE 列上,会让 19.99→19.98999999999999744 静默失真。故 DOUBLE 源列一律不自动量化。"""
    with with_duckdb_connection() as con:
        con.execute(
            'CREATE OR REPLACE TABLE "qa_ic_dblmix" AS '
            "SELECT * FROM (VALUES (19.99::DOUBLE), (5.00::DOUBLE), "
            "(0.1::DOUBLE + 0.2::DOUBLE)) v(a)"
        )
    try:
        data = _infer("qa_ic_dblmix")
        assert data["recommended"] is None
        assert data["reason"] == "binary_float"
        # 复审 P3:短路仍如实统计,不返回虚假的 total=0
        assert data["total"] == 3
        assert data["numeric"] == 3
        assert data["non_numeric"] == 0
    finally:
        _drop("qa_ic_dblmix")


def test_binary_float_stats_honest_with_non_finite():
    # 复审 P3:含 inf 的 DOUBLE 列,total/numeric 如实(inf 不计 numeric),仍 binary_float 不量化
    with with_duckdb_connection() as con:
        con.execute(
            'CREATE OR REPLACE TABLE "qa_ic_dblinf" AS '
            "SELECT * FROM (VALUES (1.5::DOUBLE), (2.5::DOUBLE), ('Infinity'::DOUBLE)) v(a)"
        )
    try:
        data = _infer("qa_ic_dblinf")
        assert data["reason"] == "binary_float"
        assert data["recommended"] is None
        assert data["total"] == 3
        assert data["numeric"] == 2   # inf 非有限
        assert data["non_numeric"] == 1
    finally:
        _drop("qa_ic_dblinf")


def test_reason_field_covers_each_unsafe_cause():
    """reason 精确解释不安全原因(契约字段),供调用方精准提示。"""
    _make_table("qa_ic_ok", ["1", "2.5"])          # 安全 → None
    _make_table("qa_ic_nn", ["1", "abc"])          # 非数字 → non_numeric
    _make_table("qa_ic_sci", ["1e-20", "1"])       # 科学计数法文本 → scientific
    _make_table("qa_ic_of", ["1" * 40, "1"])       # 40 位整数超容量 → overflow
    try:
        ok = _infer("qa_ic_ok")
        assert ok["reason"] is None and ok["safe_decimal_cast"] is True
        assert _infer("qa_ic_nn")["reason"] == "non_numeric"
        assert _infer("qa_ic_sci")["reason"] == "scientific"
        of = _infer("qa_ic_of")
        assert of["reason"] == "overflow" and of["safe_decimal_cast"] is False
    finally:
        for t in ("qa_ic_ok", "qa_ic_nn", "qa_ic_sci", "qa_ic_of"):
            _drop(t)
