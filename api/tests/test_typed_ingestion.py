import os
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import duckdb
import pandas as pd
import pytest

from core.data.file_datasource_manager import (
    create_table_from_dataframe,
    create_table_from_file_path_typed,
)


def _make_table_name(prefix: str) -> str:
    return f"test_{prefix}_{uuid4().hex[:8]}"


@pytest.fixture
def ingestion_con():
    con = duckdb.connect()
    yield con
    con.close()


def test_rows_ingestion_preserves_types(ingestion_con):
    """DataFrame 直入路径已随去 pandas 退役（生产零调用方）；同一"内存数据
    → 有类型的表"能力现在由 rows_ingest + 促升引擎承担。"""
    from core.data.ingestion_precision import promote_table_column_types_from_varchar
    from core.data.rows_ingest import load_rows_as_varchar_table

    con = ingestion_con
    table_name = _make_table_name("rows_typed")

    temp, cleanup = load_rows_as_varchar_table(
        con,
        ["amount", "quantity", "code"],
        [["1.25", "1", "A"], ["9.8", "2", "B"], ["2.5", "3", "C"]],
    )
    try:
        con.execute(f'CREATE TABLE "{table_name}" AS SELECT * FROM "{temp}"')
    finally:
        cleanup()
    promote_table_column_types_from_varchar(con, table_name)

    info = con.execute(f"PRAGMA table_info('{table_name}')").fetchall()
    column_types = {row[1]: row[2] for row in info}

    assert column_types["amount"].upper().startswith("DECIMAL")  # 精确十进制
    assert column_types["quantity"].upper().startswith("BIGINT")
    assert column_types["code"].upper().startswith("VARCHAR")

    values = con.execute(
        f'SELECT amount FROM "{table_name}" ORDER BY quantity'
    ).fetchall()
    assert [str(v[0]) for v in values] == ["1.25", "9.80", "2.50"]


def test_csv_ingestion_preserves_types(tmp_path, ingestion_con):
    con = ingestion_con
    table_name = _make_table_name("csv_typed")

    df = pd.DataFrame(
        {
            "price": ["12.50", "3.95", "100.00"],
            "qty": ["1", "2", "5"],
            "label": ["foo", "bar", "baz"],
        }
    )

    csv_path = Path(tmp_path) / "typed_dataset.csv"
    df.to_csv(csv_path, index=False)

    with patch("core.data.file_datasource_manager.file_datasource_manager.save_file_datasource"):
        metadata = create_table_from_file_path_typed(con, table_name, str(csv_path), "csv")

    info = con.execute(f"PRAGMA table_info('{table_name}')").fetchall()
    column_types = {row[1]: row[2] for row in info}

    assert "DECIMAL" in column_types["price"].upper()
    assert column_types["qty"].upper().startswith("BIGINT")
    assert column_types["label"].upper().startswith("VARCHAR")

    profiles = metadata.get("column_profiles") or []
    qty_profile = next((p for p in profiles if p["name"] == "qty"), None)
    assert qty_profile is not None
    assert qty_profile["duckdb_type"].upper().startswith("BIGINT")

    # 清理生成的文件
    con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
    if Path(csv_path).exists():
        os.remove(csv_path)
