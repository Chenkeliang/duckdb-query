"""保真取数全链路：fetch（fetchall 保 Decimal/任意精度 int）→ JSON（十进制字符串）。

精确路径不依赖 pyarrow（桌面冻结包被 duckquery.spec excludes 排除——v1.1.5
线上回归即 Arrow 路径在冻结包内 import 失败），也不走 Arrow（DuckDB→Arrow
转换对 VARIANT 抛 NotImplemented、可空整型压 float64、STRUCT 整数变 float、
MAP 变键值对数组）。本文件全程屏蔽 pyarrow 运行，作为回归绊线。
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


@pytest.fixture(autouse=True)
def no_pyarrow(monkeypatch):
    """模拟桌面冻结包：pyarrow 不可导入。精确路径必须在此环境下完整工作。"""
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
    assert records[0]["b"] == 42  # 安全范围整数仍是 JSON 数字


def test_plain_query_keeps_fetchdf_path(con):
    df = fetch_query_dataframe(con, "SELECT 1.5::DOUBLE AS a, 'x' AS s")
    assert str(df["a"].dtype) == "float64"


def test_bigint_column_routes_to_exact_path(con):
    df = fetch_query_dataframe(
        con, "SELECT 9007199254740993::BIGINT AS b, count(*) OVER () AS c"
    )
    records = normalize_dataframe_output(df)
    assert records[0]["b"] == "9007199254740993"  # >2^53 → 字符串
    assert records[0]["c"] == 1  # 安全范围仍是数字


def test_nullable_bigint_beyond_js_safe_int_not_corrupted(con):
    """v1.1.5 活 bug：含 NULL 的 BIGINT 列被 fetchdf 压成 float64，
    9007199254740993 静默变成 9007199254740992.0。"""
    df = fetch_query_dataframe(
        con,
        "SELECT * FROM (VALUES (9007199254740993::BIGINT), (NULL), (42)) t(b) "
        "ORDER BY b NULLS LAST",
    )
    records = normalize_dataframe_output(df)
    values = [r["b"] for r in records]
    # isinstance 断言必不可少:42.0 == 42 为 True,等值断言抓不住
    # "含 NULL 整数列被浮点化"(DataFrame.map 曾按返回值重推断 dtype)
    assert values[0] == 42 and isinstance(values[0], int)
    assert values[1] == "9007199254740993"  # 精确，不是 ...992
    assert values[2] is None


def test_nullable_ubigint_not_corrupted(con):
    df = fetch_query_dataframe(
        con, "SELECT * FROM (VALUES (18446744073709551615::UBIGINT), (NULL)) t(u)"
    )
    records = normalize_dataframe_output(df)
    assert records[0]["u"] == "18446744073709551615"
    assert records[1]["u"] is None


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
    HUGEINT 必须以 Decimal 形态承载，保住日期的空格分隔格式。"""
    df = fetch_query_dataframe(
        con,
        "SELECT 170141183460469231731687303715884105727::HUGEINT AS h, "
        "DATE '2024-07-15' AS dt",
    )
    records = normalize_dataframe_output(df)
    assert records[0]["h"] == "170141183460469231731687303715884105727"
    assert records[0]["dt"] == "2024-07-15 00:00:00"


def test_variant_alongside_decimal_serializes_as_json_string(con):
    """v1.1.5 活 bug：VARIANT×DECIMAL 同帧时 Arrow 转换抛 NotImplemented，
    Docker/开发版整条查询 500。精确路径必须正常返回 JSON 字符串。"""
    df = fetch_query_dataframe(
        con, "SELECT {'k': [1, 2]}::VARIANT AS v, 1.5::DECIMAL(4,2) AS d"
    )
    records = normalize_dataframe_output(df)
    assert records[0]["v"] == '{"k": [1, 2]}'
    assert records[0]["d"] == "1.50"


def test_struct_map_list_shapes_in_exact_frames(con):
    """Arrow 路径曾把 STRUCT 整数字段变 1.0、MAP 变 [["k",1]] 键值对数组。
    契约：与 fetchdf 主流形态一致——STRUCT/MAP 都是 JSON 对象字符串，
    整数不带 .0；列表内 >2^53 的整数同样走字符串守护。"""
    df = fetch_query_dataframe(
        con,
        "SELECT {'a': 1, 'b': 'x'} AS st, MAP {'k': 1} AS mp, "
        "[9007199254740993] AS li, 1.5::DECIMAL(4,2) AS d",
    )
    records = normalize_dataframe_output(df)
    assert records[0]["st"] == '{"a": 1, "b": "x"}'
    assert records[0]["mp"] == '{"k": 1}'
    assert records[0]["li"] == '["9007199254740993"]'


def test_interval_alongside_decimal_pinned_contract(con):
    """Arrow 路径曾对 INTERVAL 泄漏 DateOffset 对象。契约：str(timedelta)。"""
    df = fetch_query_dataframe(
        con, "SELECT INTERVAL 3 DAY AS itv, 1.5::DECIMAL(4,2) AS d"
    )
    records = normalize_dataframe_output(df)
    assert records[0]["itv"] == "3 days, 0:00:00"


def test_double_nan_inf_serialize_as_null_in_exact_frames(con):
    df = fetch_query_dataframe(
        con,
        "SELECT 'nan'::DOUBLE AS dn, 'inf'::DOUBLE AS di, 1.5::DECIMAL(4,2) AS d",
    )
    records = normalize_dataframe_output(df)
    assert records[0]["dn"] is None
    assert records[0]["di"] is None
