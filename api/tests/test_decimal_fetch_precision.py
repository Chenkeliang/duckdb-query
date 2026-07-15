"""DECIMAL 全链路精度：fetch（Arrow 保 Decimal）→ JSON（十进制字符串）。"""

from decimal import Decimal

import duckdb
import pytest

from core.common.utils import normalize_dataframe_output
from core.database.duckdb_engine import fetch_query_dataframe


@pytest.fixture
def con():
    c = duckdb.connect()
    yield c
    c.close()


def test_decimal_fetch_preserves_exact_values(con):
    df = fetch_query_dataframe(
        con,
        "SELECT -0.30::DECIMAL(38,2) AS amt, "
        "0.1234567890123456789::DECIMAL(38,19) AS hp, 42::BIGINT AS b",
    )
    assert df["amt"][0] == Decimal("-0.30")

    records = normalize_dataframe_output(df)
    assert records[0]["amt"] == "-0.30"  # 标度保留（不是 -0.3）
    assert records[0]["hp"] == "0.1234567890123456789"  # fetchdf 路径会丢到 float64
    assert records[0]["b"] == 42  # 非 DECIMAL 列仍是 JSON 数字


def test_non_decimal_query_keeps_fetchdf_path(con):
    df = fetch_query_dataframe(con, "SELECT 1::BIGINT AS a, 'x' AS s")
    assert str(df["a"].dtype) == "int64"


def test_decimal_query_keeps_datetime_dtype(con):
    df = fetch_query_dataframe(
        con, "SELECT 1.5::DECIMAL(38,2) AS d, DATE '2024-07-15' AS dt, now() AS ts"
    )
    assert str(df["dt"].dtype).startswith("datetime64")
    assert str(df["ts"].dtype).startswith("datetime64")
