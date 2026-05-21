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
