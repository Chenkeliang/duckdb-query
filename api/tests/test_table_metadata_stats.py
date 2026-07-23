"""列统计回归(Codex S-16 收敛后):合并 stats+minmax 为一次扫描、复用外层
DESCRIBE、标识符转义。断言统计值与旧行为一致,且怪名列不破坏 SQL。"""
import duckdb

from core.services.table_metadata_service import (
    get_column_statistics,
    get_table_metadata,
)


def _con():
    con = duckdb.connect(":memory:")
    con.execute(
        'CREATE TABLE t AS SELECT * FROM (VALUES '
        "(1, 'a', CAST(10.5 AS DECIMAL(10,2))), "
        "(2, 'b', CAST(20.0 AS DECIMAL(10,2))), "
        "(3, NULL, CAST(30.0 AS DECIMAL(10,2)))"
        ') v(id, name, amount)'
    )
    return con


def test_numeric_column_stats_combined_query():
    con = _con()
    s = get_column_statistics("t", "id", con, data_type="INTEGER")
    assert s.null_count == 0
    assert s.distinct_count == 3
    assert s.min_value in (1, "1") or float(s.min_value) == 1
    assert float(s.max_value) == 3
    assert abs(s.avg_value - 2.0) < 1e-9


def test_decimal_min_max_exact_string():
    con = _con()
    s = get_column_statistics("t", "amount", con, data_type="DECIMAL(10,2)")
    # DECIMAL 的 min/max 以精确十进制字符串返回
    assert s.min_value == "10.50"
    assert s.max_value == "30.00"


def test_non_numeric_column_null_and_distinct():
    con = _con()
    s = get_column_statistics("t", "name", con, data_type="VARCHAR")
    assert s.null_count == 1
    assert s.distinct_count == 2
    assert s.min_value is None and s.max_value is None
    assert set(s.sample_values) == {"a", "b"}


def test_weird_column_name_does_not_break_sql():
    con = duckdb.connect(":memory:")
    con.execute('CREATE TABLE w ("a""b" INT)')
    con.execute('INSERT INTO w VALUES (1), (2)')
    s = get_column_statistics("w", 'a"b', con, data_type="INTEGER")
    assert s.distinct_count == 2


def test_get_table_metadata_covers_all_columns():
    con = _con()
    meta = get_table_metadata("t", con, use_cache=False)
    assert meta.row_count == 3
    assert meta.column_count == 3
    names = {c.column_name for c in meta.columns}
    assert names == {"id", "name", "amount"}
