"""schema_sampler 数据样例采集单测:全部在真实 DuckDB(内存库)上执行。"""

import duckdb
import pytest

from core.common.sql_identifiers import quote_identifier
from core.services import schema_sampler


@pytest.fixture(name="con")
def _con():
    c = duckdb.connect()
    yield c
    c.close()


def _cols(con, table: str):
    return [
        (r[0], r[1])
        for r in con.execute(f"DESCRIBE {quote_identifier(table)}").fetchall()
    ]


def test_sample_block_has_rows_and_low_cardinality_values(con):
    con.execute("CREATE TABLE t(id INTEGER, status VARCHAR)")
    con.execute(
        "INSERT INTO t VALUES (1,'active'),(2,'closed'),(3,'active'),(4,'pending')"
    )
    block = schema_sampler.sample_table_block(con, '"t"', _cols(con, "t"))
    assert "sample rows:" in block
    assert "'active'" in block
    # 低基数 VARCHAR 列枚举全部取值
    values_line = next(l for l in block.splitlines() if "status values:" in l)
    assert "'closed'" in values_line and "'pending'" in values_line
    # 数值列不做取值枚举
    assert "id values:" not in block


def test_sample_block_empty_table_reports_no_rows(con):
    con.execute("CREATE TABLE empty_t(a INTEGER)")
    block = schema_sampler.sample_table_block(con, '"empty_t"', _cols(con, "empty_t"))
    assert "(no rows)" in block


def test_sample_block_truncates_long_cell_values(con):
    con.execute("CREATE TABLE longv(a VARCHAR)")
    con.execute("INSERT INTO longv VALUES (?)", ["x" * 500])
    block = schema_sampler.sample_table_block(con, '"longv"', _cols(con, "longv"))
    assert "…" in block
    assert "x" * (schema_sampler.MAX_CELL_CHARS + 1) not in block


def test_sample_block_skips_all_null_column_values(con):
    con.execute("CREATE TABLE nullish(a VARCHAR, b INTEGER)")
    con.execute("INSERT INTO nullish VALUES (NULL, 1), (NULL, 2)")
    block = schema_sampler.sample_table_block(con, '"nullish"', _cols(con, "nullish"))
    assert "a values:" not in block  # 全 NULL 列不出取值行
    assert "NULL" in block  # 但样本行如实展示 NULL


def test_sample_block_skips_high_cardinality_column_values(con):
    con.execute("CREATE TABLE hicard(v VARCHAR)")
    con.execute(
        "INSERT INTO hicard SELECT 'val_' || range::VARCHAR FROM range(50)"
    )
    block = schema_sampler.sample_table_block(con, '"hicard"', _cols(con, "hicard"))
    assert "sample rows:" in block
    assert "v values:" not in block  # 采样内基数 > 上限,不枚举


def test_sample_block_wide_table_capped_and_budgeted(con):
    cols_sql = ", ".join(f"c{i} INTEGER" for i in range(30))
    con.execute(f"CREATE TABLE wide({cols_sql})")
    con.execute(f"INSERT INTO wide VALUES ({', '.join('1' for _ in range(30))})")
    block = schema_sampler.sample_table_block(
        con, '"wide"', _cols(con, "wide"), max_chars=200
    )
    assert "[+10 more columns]" in block or "…(truncated)" in block
    assert len(block) <= 200 + len("…(truncated)")


def test_sample_block_quoted_unicode_identifiers(con):
    table, col = '订单 表', '状态"列'
    qt, qc = quote_identifier(table), quote_identifier(col)
    con.execute(f"CREATE TABLE {qt}({qc} VARCHAR)")
    con.execute(f"INSERT INTO {qt} VALUES ('启用'), ('停用')")
    block = schema_sampler.sample_table_block(con, qt, _cols(con, table))
    assert "'启用'" in block


def test_sample_block_missing_table_returns_empty(con):
    block = schema_sampler.sample_table_block(con, '"no_such_table"', [("a", "INTEGER")])
    assert block == ""


def test_sample_block_zero_budget_returns_empty(con):
    con.execute("CREATE TABLE zb(a INTEGER)")
    con.execute("INSERT INTO zb VALUES (1)")
    assert schema_sampler.sample_table_block(con, '"zb"', _cols(con, "zb"), max_chars=0) == ""
