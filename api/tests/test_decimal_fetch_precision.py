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
    """回归绊线：本项目代码（core/routers）不得 import pyarrow。

    只拦截"我们自己模块"发起的导入（v1.1.5 事故 = duckdb_engine 调
    to_arrow_table）。不能全局拦：pandas 3.x 在装有 pyarrow 的环境里会
    按需 import 它做 Arrow-backed string 等内部优化，半路拦截会把 pandas
    自己搞炸——而真实冻结包里 pandas 自导入起就检测不到 pyarrow、走
    object 回退，行为不同。冻结环境的全栈保真由 release CI 的
    frozen_smoke（真实打包产物）负责。
    """
    monkeypatch.delitem(sys.modules, "pyarrow", raising=False)
    real_import = builtins.__import__

    def blocked(name, *args, **kwargs):
        if name == "pyarrow" or name.startswith("pyarrow."):
            importer = ""
            if args and isinstance(args[0], dict):
                importer = args[0].get("__name__") or ""
            if importer.startswith(("core.", "routers.", "models.", "utils.")):
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


def test_bigint_frames_stay_on_fetchdf_and_remain_exact(con):
    """BIGINT 不触发慢速精确路径（COUNT(*)/主键帧保持向量化 fetchdf），
    精度由 fetchdf 的 Int64 可空 dtype + normalize 层保障。"""
    df = fetch_query_dataframe(
        con, "SELECT 9007199254740993::BIGINT AS b, count(*) OVER () AS c"
    )
    assert str(df["b"].dtype) in ("int64", "Int64")  # fetchdf 路径，非 object
    records = normalize_dataframe_output(df)
    assert records[0]["b"] == "9007199254740993"  # >2^53 → 字符串
    assert records[0]["c"] == 1  # 安全范围仍是数字


def test_nullable_bigint_beyond_js_safe_int_not_corrupted(con):
    """v1.1.5 活 bug：含 NULL 的 BIGINT 列输出 9007199254740992.0。
    实测定位：fetchdf 本身返回精确的 Int64 可空 dtype，坏值发生在旧
    normalize 的整帧 convert_dtypes/map 降型（已逐列化 + 去 map 修复）。
    本测试把 fetchdf→normalize 全链路钉死。"""
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
    """HUGEINT 以裸 Python 大整数进帧（fetchall 原生形态），normalize 的
    整帧 convert_dtypes 对超 int64 值抛 OverflowError；靠逐列降级隔离
    （utils.normalize），单列失败不再拖垮同帧日期列的 datetime64 空格格式。"""
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


def test_interval_format_consistent_between_paths(con):
    """同一 INTERVAL 值，走 fetchdf（pd.Timedelta）与走精确路径（stdlib
    timedelta）必须输出同一字符串（jsonable 先归一到 stdlib 再 str）。"""
    exact = normalize_dataframe_output(
        fetch_query_dataframe(con, "SELECT INTERVAL 3 DAY AS itv, 1.5::DECIMAL(4,2) AS d")
    )[0]["itv"]
    plain = normalize_dataframe_output(
        fetch_query_dataframe(con, "SELECT INTERVAL 3 DAY AS itv")
    )[0]["itv"]
    assert exact == plain == "3 days, 0:00:00"


def test_double_nan_inf_serialize_as_null_in_exact_frames(con):
    df = fetch_query_dataframe(
        con,
        "SELECT 'nan'::DOUBLE AS dn, 'inf'::DOUBLE AS di, 1.5::DECIMAL(4,2) AS d",
    )
    records = normalize_dataframe_output(df)
    assert records[0]["dn"] is None
    assert records[0]["di"] is None
