"""DECIMAL 全链路精度：fetch（保 decimal.Decimal）→ JSON（十进制字符串）。

fetch_query_dataframe 有两条精确路径：Arrow（开发/Docker，有 pyarrow）与
fetchall 兜底（桌面冻结包，pyarrow 被 duckquery.spec excludes 排除——v1.1.5
线上回归即 Arrow 路径在冻结包内 import 失败）。本文件所有断言在两种环境下
各跑一遍，保证两条路径产出一致。
"""

import builtins
import sys
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


@pytest.fixture(autouse=True, params=["arrow", "frozen_no_pyarrow"])
def runtime_env(request, monkeypatch):
    """arrow=开发/Docker 环境；frozen_no_pyarrow=模拟桌面冻结包 pyarrow 不可导入。"""
    if request.param == "arrow":
        pytest.importorskip("pyarrow")
        return
    monkeypatch.delitem(sys.modules, "pyarrow", raising=False)
    real_import = builtins.__import__

    def blocked(name, *args, **kwargs):
        if name == "pyarrow" or name.startswith("pyarrow."):
            raise ModuleNotFoundError("No module named 'pyarrow'")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked)


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

    # 序列化格式与 fetchdf 路径一致（空格分隔，非 isoformat 的 "T"）
    records = normalize_dataframe_output(df)
    assert records[0]["dt"] == "2024-07-15 00:00:00"


def test_decimal_query_with_sentinel_date(con):
    """财务哨兵日期 9999-12-31 超出 datetime64[ns]，不能让整条查询失败。"""
    df = fetch_query_dataframe(
        con, "SELECT 1.5::DECIMAL(38,2) AS d, DATE '9999-12-31' AS dt"
    )
    records = normalize_dataframe_output(df)
    assert records[0]["dt"].startswith("9999-12-31")


def test_decimal_query_with_timestamptz(con):
    df = fetch_query_dataframe(
        con, "SELECT 1.5::DECIMAL(38,2) AS d, now()::TIMESTAMPTZ AS ts"
    )
    assert "datetime64" in str(df["ts"].dtype)
    records = normalize_dataframe_output(df)
    assert isinstance(records[0]["ts"], str)


def test_hugeint_beyond_js_safe_int_serialized_as_string(con):
    df = fetch_query_dataframe(
        con, "SELECT 170141183460469231731687303715884105727::HUGEINT AS h"
    )
    records = normalize_dataframe_output(df)
    assert records[0]["h"] == "170141183460469231731687303715884105727"


def test_hugeint_alongside_date_keeps_datetime_format(con):
    """HUGEINT 若以裸 Python 大整数进帧，normalize 的 convert_dtypes 会抛
    OverflowError 导致整帧退化 object、同帧日期列变 isoformat（带 "T"）。
    两条路径都必须以 Decimal 形态承载 HUGEINT，保住日期的空格分隔格式。"""
    df = fetch_query_dataframe(
        con,
        "SELECT 170141183460469231731687303715884105727::HUGEINT AS h, "
        "DATE '2024-07-15' AS dt",
    )
    records = normalize_dataframe_output(df)
    assert records[0]["h"] == "170141183460469231731687303715884105727"
    assert records[0]["dt"] == "2024-07-15 00:00:00"
