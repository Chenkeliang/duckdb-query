"""convert_table_to_varchar / check_and_convert_table_types：无外部连接时自持连接贯穿全流程。"""

import uuid

from core.database.duckdb_engine import (
    check_and_convert_table_types,
    convert_table_to_varchar,
    with_duckdb_connection,
)


def _column_types(table: str) -> dict:
    with with_duckdb_connection() as con:
        rows = con.execute(f'DESCRIBE "{table}"').fetchall()
    return {row[0]: row[1] for row in rows}


def test_convert_table_to_varchar_without_connection():
    table = f"varchar_conv_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f'CREATE TABLE "{table}" AS SELECT 1 AS i, 2.5 AS d')

    try:
        # con=None：函数内部自持一个连接，跨 backup/drop/create 步骤复用
        assert convert_table_to_varchar(table) is True
        types = _column_types(table)
        assert types["i"].upper().startswith("VARCHAR")
        assert types["d"].upper().startswith("VARCHAR")
    finally:
        with with_duckdb_connection() as con:
            con.execute(f'DROP TABLE IF EXISTS "{table}"')


def test_check_and_convert_skips_all_varchar_table():
    table = f"varchar_skip_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f"CREATE TABLE \"{table}\" AS SELECT 'a' AS s")

    try:
        # 全是 VARCHAR，无需转换，返回 True
        assert check_and_convert_table_types(table) is True
        assert _column_types(table)["s"].upper().startswith("VARCHAR")
    finally:
        with with_duckdb_connection() as con:
            con.execute(f'DROP TABLE IF EXISTS "{table}"')
