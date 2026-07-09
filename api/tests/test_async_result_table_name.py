"""异步结果表名解析与覆盖守卫（N3）。

回归(2026-07): custom_table_name 只做字符清洗，无非空校验、无禁止覆盖守卫——
"!!!" 洗成空表名，"orders" 静默 CREATE OR REPLACE 掉用户已有的 orders 表丢数据。
"""

import duckdb
import pytest

from routers.async_tasks import _resolve_result_table_name, _raise_if_table_exists


def test_custom_name_sanitized_and_flagged_custom():
    name, is_custom = _resolve_result_table_name("my result-01", "task-abc")
    assert name == "my_result_01"
    assert is_custom is True


def test_washed_empty_name_falls_back_to_task_id_not_empty():
    # "!!!" 清洗后为空 → 回退到 task_id 名，绝不建空名表；且不标记为 custom
    name, is_custom = _resolve_result_table_name("!!!", "task-abc")
    assert name  # 非空
    assert is_custom is False


def test_no_custom_name_uses_task_id():
    name, is_custom = _resolve_result_table_name(None, "task-abc")
    assert name
    assert is_custom is False


def test_raise_if_table_exists_blocks_overwrite():
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE orders AS SELECT 1 AS a")
    with pytest.raises(ValueError):
        _raise_if_table_exists(con, "orders")


def test_raise_if_table_exists_allows_new_name():
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE orders AS SELECT 1 AS a")
    # 不存在的表名不应抛错
    _raise_if_table_exists(con, "orders_result_2025")
