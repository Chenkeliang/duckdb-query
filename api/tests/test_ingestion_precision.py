from pathlib import Path
from uuid import uuid4

import duckdb
import pandas as pd
import pytest
from core.data.ingestion_precision import (
    coerce_dataframe_numeric_columns_safe,
    is_identifier_column_name,
)
from core.data.file_datasource_manager import create_table_from_file_path_typed
from core.data.excel_import_manager import load_excel_sheet_dataframe


def _make_table_name(prefix: str) -> str:
    return f"test_{prefix}_{uuid4().hex[:8]}"


def test_is_identifier_column_name():
    assert is_identifier_column_name("order_id")
    assert is_identifier_column_name("SKU_CODE")
    assert not is_identifier_column_name("amount")


def test_coerce_preserves_long_integer_codes():
    df = pd.DataFrame(
        {
            "order_id": ["1234567890123456789", "9876543210987654321"],
            "qty": ["1", "2"],
            "price": ["12.50", "3.00"],
        }
    )
    out = coerce_dataframe_numeric_columns_safe(df)
    assert out["order_id"].dtype == object
    assert out["order_id"].iloc[0] == "1234567890123456789"
    assert out["qty"].iloc[0] in ("1", 1)
    assert str(out["price"].iloc[0]) in ("12.50", "12.5")


@pytest.fixture
def ingestion_con():
    con = duckdb.connect()
    yield con
    con.close()


def test_csv_long_id_stored_as_varchar(tmp_path, ingestion_con):
    con = ingestion_con
    table_name = _make_table_name("csv_long_id")
    csv_path = Path(tmp_path) / "ids.csv"
    csv_path.write_text("order_id,amount\n1234567890123456789,1.5\n2,2.0\n", encoding="utf-8")

    create_table_from_file_path_typed(con, table_name, str(csv_path), "csv")

    info = con.execute(f"PRAGMA table_info('{table_name}')").fetchall()
    column_types = {row[1]: row[2] for row in info}
    assert column_types["order_id"].upper().startswith("VARCHAR")

    value = con.execute(
        f'SELECT "order_id" FROM "{table_name}" LIMIT 1'
    ).fetchone()[0]
    assert str(value) == "1234567890123456789"

    con.execute(f'DROP TABLE IF EXISTS "{table_name}"')


def test_csv_literal_mode_all_varchar(tmp_path, ingestion_con):
    con = ingestion_con
    table_name = _make_table_name("csv_literal")
    csv_path = Path(tmp_path) / "mixed.csv"
    csv_path.write_text("order_id,amount\n1234567890123456789,1.5\n2,2.0\n", encoding="utf-8")

    create_table_from_file_path_typed(
        con, table_name, str(csv_path), "csv", import_mode="literal"
    )

    info = con.execute(f"PRAGMA table_info('{table_name}')").fetchall()
    column_types = {row[1]: row[2].upper() for row in info}
    assert column_types["order_id"].startswith("VARCHAR")
    assert column_types["amount"].startswith("VARCHAR")

    con.execute(f'DROP TABLE IF EXISTS "{table_name}"')


def test_excel_load_preserves_long_id_in_object_column(tmp_path):
    import openpyxl

    xlsx_path = Path(tmp_path) / "long_id.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["order_id", "qty"])
    ws.append(["1234567890123456789", 1])
    ws.append(["2", 2])
    wb.save(xlsx_path)

    df = load_excel_sheet_dataframe(str(xlsx_path), ws.title, header_rows=1)
    assert df["order_id"].dtype == object
    assert str(df["order_id"].iloc[0]) == "1234567890123456789"
