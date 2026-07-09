"""FileIngestionService 单元测试。"""

from pathlib import Path
from uuid import uuid4

import duckdb
import pandas as pd
import pytest

from core.services.file_ingestion_service import (
    inspect_excel_at_path,
    ingest_tabular_file,
    resolve_unique_table_name,
)


@pytest.fixture
def duck_con():
    con = duckdb.connect()
    yield con
    con.close()


def test_resolve_unique_table_name(duck_con):
    name = resolve_unique_table_name(duck_con, "my_data", user_provided=True)
    assert name == "my_data"


def test_resolve_unique_table_name_no_conflict_returns_original(duck_con):
    duck_con.execute("CREATE TABLE other_table AS SELECT 1 AS a")
    name = resolve_unique_table_name(duck_con, "my_data", user_provided=True)
    assert name == "my_data"


def test_resolve_unique_table_name_single_conflict_appends_1(duck_con):
    duck_con.execute("CREATE TABLE my_data AS SELECT 1 AS a")
    name = resolve_unique_table_name(duck_con, "my_data", user_provided=True)
    assert name == "my_data_1"


def test_resolve_unique_table_name_repeated_conflicts_increment(duck_con):
    duck_con.execute("CREATE TABLE my_data AS SELECT 1 AS a")
    duck_con.execute("CREATE TABLE my_data_1 AS SELECT 1 AS a")
    name = resolve_unique_table_name(duck_con, "my_data", user_provided=True)
    assert name == "my_data_2"


def test_resolve_unique_table_name_case_insensitive_conflict(duck_con):
    duck_con.execute("CREATE TABLE My_Data AS SELECT 1 AS a")
    name = resolve_unique_table_name(duck_con, "my_data", user_provided=True)
    assert name == "my_data_1"


def test_resolve_unique_table_name_allow_leading_digit_regression(duck_con):
    # user_provided=True 时允许别名以数字开头，不应回归为加前缀
    name = resolve_unique_table_name(duck_con, "2024_sales", user_provided=True)
    assert name == "2024_sales"

    # user_provided=False（自动生成的默认名）时数字开头要加 prefix
    name2 = resolve_unique_table_name(duck_con, "2024_sales", user_provided=False)
    assert name2 == "table_2024_sales"


def test_ingest_tabular_csv_literal(duck_con, tmp_path):
    csv_path = Path(tmp_path) / "ids.csv"
    csv_path.write_text("order_id,amount\n1234567890123456789,1.5\n", encoding="utf-8")
    table = f"t_{uuid4().hex[:8]}"
    result = ingest_tabular_file(
        duck_con,
        str(csv_path),
        "csv",
        table,
        import_mode="literal",
    )
    assert result.table_name == table
    col_types = {
        row[1]: row[2]
        for row in duck_con.execute(
            f"PRAGMA table_info('{table}')"
        ).fetchall()
    }
    assert col_types["amount"].upper().startswith("VARCHAR")


def test_inspect_excel_at_path_prefix(tmp_path):
    import openpyxl

    xlsx = Path(tmp_path) / "book.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Data"
    ws.append(["a", 1])
    wb.save(xlsx)

    out = inspect_excel_at_path(str(xlsx), "my_prefix")
    assert out["default_table_prefix"] == "my_prefix"
    assert out["sheets"][0]["default_table_name"].startswith("my_prefix")
