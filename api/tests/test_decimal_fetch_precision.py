"""保真传输全链路：fetch_query_records（纯 Python 直构）的输出契约电池。

records 直构由 DuckDB 原生返回 decimal.Decimal / 任意精度 int，不经任何
DataFrame 中间层——v1.2.x 修过的 5 个改值 bug 全部源自 pandas 各推断层
（fetchdf 压 HUGEINT、构造器推断可空整型、convert_dtypes 整帧降型、map
重推断、read_sql coerce_float）。本电池钉死输出契约（与 v1.2.0 版
normalize 链路 22 列对拍逐字节一致），并以"项目代码不得 import pyarrow"
作回归绊线（v1.1.5 冻结包事故）。
"""

import builtins
import sys
from decimal import Decimal

import duckdb
import pytest

from core.database.duckdb_engine import fetch_query_records


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
    按需 import 它做内部优化，半路拦截会把 pandas 自己搞炸——而真实冻结
    包里 pandas 自导入起就检测不到 pyarrow、走 object 回退，行为不同。
    冻结环境的全栈保真由 release CI 的 frozen_smoke（真实打包产物）负责。
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


def _records(con, sql):
    _, records = fetch_query_records(con, sql)
    return records


def test_decimal_preserves_exact_values(con):
    records = _records(
        con,
        "SELECT -0.30::DECIMAL(38,2) AS amt, "
        "0.1234567890123456789::DECIMAL(38,19) AS hp, 42::BIGINT AS b",
    )
    assert records[0]["amt"] == "-0.30"  # 标度保留（不是 -0.3）
    assert records[0]["hp"] == "0.1234567890123456789"
    assert records[0]["b"] == 42 and isinstance(records[0]["b"], int)


def test_columns_order_matches_projection(con):
    columns, records = fetch_query_records(con, "SELECT 2 AS b, 1 AS a, 3 AS c")
    assert columns == ["b", "a", "c"]
    assert list(records[0].keys()) == ["b", "a", "c"]


def test_bigint_exact_across_js_safe_boundary(con):
    records = _records(
        con, "SELECT 9007199254740993::BIGINT AS b, count(*) OVER () AS c"
    )
    assert records[0]["b"] == "9007199254740993"  # >2^53 → 字符串
    assert records[0]["c"] == 1 and isinstance(records[0]["c"], int)


def test_nullable_bigint_beyond_js_safe_int_not_corrupted(con):
    """v1.1.5 活 bug：含 NULL 的 BIGINT 列输出 9007199254740992.0（旧
    normalize 的整帧 convert_dtypes/map 降型）。records 直构从机制上免疫，
    isinstance 断言必不可少：42.0 == 42 为 True，等值断言抓不住浮点化。"""
    records = _records(
        con,
        "SELECT * FROM (VALUES (9007199254740993::BIGINT), (NULL), (42)) t(b) "
        "ORDER BY b NULLS LAST",
    )
    values = [r["b"] for r in records]
    assert values[0] == 42 and isinstance(values[0], int)
    assert values[1] == "9007199254740993"
    assert values[2] is None


def test_nullable_ubigint_not_corrupted(con):
    records = _records(
        con, "SELECT * FROM (VALUES (18446744073709551615::UBIGINT), (NULL)) t(u)"
    )
    assert records[0]["u"] == "18446744073709551615"
    assert records[1]["u"] is None


def test_hugeint_beyond_js_safe_int_serialized_as_string(con):
    records = _records(
        con, "SELECT 170141183460469231731687303715884105727::HUGEINT AS h"
    )
    assert records[0]["h"] == "170141183460469231731687303715884105727"


def test_datetime_space_separated_format(con):
    """空格分隔 '%Y-%m-%d %H:%M:%S(.f)' 去尾零——前端日期列采样正则、
    CSV 导出 Excel 防误解析正则都依赖此格式（非 isoformat 的 "T"）。"""
    records = _records(
        con,
        "SELECT DATE '2024-07-15' AS dt, "
        "TIMESTAMP '2024-07-15 10:30:00.5' AS ts, "
        "1.5::DECIMAL(38,2) AS d",
    )
    assert records[0]["dt"] == "2024-07-15 00:00:00"
    assert records[0]["ts"] == "2024-07-15 10:30:00.5"


def test_sentinel_date_9999(con):
    """财务哨兵日期 9999-12-31 不得让查询失败。"""
    records = _records(con, "SELECT DATE '9999-12-31' AS dt, 1.5::DECIMAL(4,2) AS d")
    assert records[0]["dt"] == "9999-12-31 00:00:00"


def test_timestamptz_normalized_to_utc(con):
    records = _records(
        con, "SELECT TIMESTAMPTZ '2024-07-15 10:30:00+08:00' AS ts"
    )
    assert records[0]["ts"] == "2024-07-15 02:30:00"


def test_variant_serializes_as_json_string(con):
    """v1.1.5 活 bug：VARIANT×DECIMAL 同帧时 Arrow 转换抛 NotImplemented。"""
    records = _records(
        con, "SELECT {'k': [1, 2]}::VARIANT AS v, 1.5::DECIMAL(4,2) AS d"
    )
    assert records[0]["v"] == '{"k": [1, 2]}'
    assert records[0]["d"] == "1.50"


def test_struct_map_list_json_string_shapes(con):
    """STRUCT/MAP 是 JSON 对象字符串、整数不带 .0；列表内 >2^53 走字符串守护
    （前端 TSV/CSV 复制按 String(value)，裸对象会静默变 [object Object]）。"""
    records = _records(
        con,
        "SELECT {'a': 1, 'b': 'x'} AS st, MAP {'k': 1} AS mp, "
        "[9007199254740993] AS li, 1.5::DECIMAL(4,2) AS d",
    )
    assert records[0]["st"] == '{"a": 1, "b": "x"}'
    assert records[0]["mp"] == '{"k": 1}'
    assert records[0]["li"] == '["9007199254740993"]'


def test_interval_pinned_contract(con):
    """契约：str(stdlib timedelta)，与 DECIMAL 同帧与否无关。"""
    with_dec = _records(con, "SELECT INTERVAL 3 DAY AS itv, 1.5::DECIMAL(4,2) AS d")
    plain = _records(con, "SELECT INTERVAL 3 DAY AS itv")
    assert with_dec[0]["itv"] == plain[0]["itv"] == "3 days, 0:00:00"


def test_double_nan_inf_serialize_as_null(con):
    records = _records(
        con,
        "SELECT 'nan'::DOUBLE AS dn, 'inf'::DOUBLE AS di, "
        "0.1::DOUBLE + 0.2::DOUBLE AS f",
    )
    assert records[0]["dn"] is None
    assert records[0]["di"] is None
    assert isinstance(records[0]["f"], float)  # DOUBLE 保持 JSON number 语义


def test_decimal_value_object_available_upstream(con):
    """DuckDB 原生游标给出 decimal.Decimal——保真不是字符串魔法，是源头无损。"""
    row = con.execute("SELECT -0.30::DECIMAL(38,2) AS amt").fetchone()
    assert row[0] == Decimal("-0.30")


def test_duplicate_column_names_keep_all_values(con):
    """复审实锤回归：SELECT 1 AS id, 2 AS id 曾经 dict 覆盖静默丢前值。
    契约对齐旧 pandas 语义：去重为 id, id_1，两个值都保留。"""
    columns, records = fetch_query_records(con, "SELECT 1 AS id, 2 AS id, 3 AS id")
    assert columns == ["id", "id_1", "id_2"]
    assert records[0] == {"id": 1, "id_1": 2, "id_2": 3}
