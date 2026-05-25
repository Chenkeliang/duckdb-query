"""MySQL 双引号字符串 → DuckDB 单引号归一化"""

from core.common.sql_mysql_quotes import (
    normalize_mysql_double_quoted_strings_for_duckdb,
)


def test_in_list_conversion():
    sql = (
        'SELECT * FROM t WHERE state NOT IN '
        '("TRADE_BUYER_SIGNED","TRADE_CLOSED")'
    )
    out = normalize_mysql_double_quoted_strings_for_duckdb(sql)
    assert out == (
        "SELECT * FROM t WHERE state NOT IN "
        "('TRADE_BUYER_SIGNED','TRADE_CLOSED')"
    )


def test_qualified_identifiers_unchanged():
    sql = 'SELECT * FROM "mysql_sorder"."iget_order"'
    assert normalize_mysql_double_quoted_strings_for_duckdb(sql) == sql


def test_comparison_rhs():
    sql = 'SELECT * FROM t WHERE state = "OPEN"'
    assert normalize_mysql_double_quoted_strings_for_duckdb(sql) == (
        "SELECT * FROM t WHERE state = 'OPEN'"
    )
