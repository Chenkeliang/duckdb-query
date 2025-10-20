import os
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pandas as pd

from core.duckdb_engine import get_db_connection
from core.file_datasource_manager import create_table_from_dataframe


def _make_table_name(prefix: str) -> str:
    return f"test_{prefix}_{uuid4().hex[:8]}"


def test_dataframe_ingestion_preserves_types():
    con = get_db_connection()
    table_name = _make_table_name("df_typed")

    df = pd.DataFrame(
        {
            "amount": pd.Series([1.25, 9.8], dtype="float64"),
            "quantity": pd.Series([1, 2, 3], dtype="int64"),
            "code": ["A", "B", "C"],
        }
    )

    with patch("core.file_datasource_manager.file_datasource_manager.save_file_datasource"):
        metadata = create_table_from_dataframe(con, table_name, df)

    info = con.execute(f"PRAGMA table_info('{table_name}')").fetchall()
    column_types = {row[1]: row[2] for row in info}

    assert column_types["amount"].upper().startswith("DOUBLE")
    assert column_types["quantity"].upper().startswith("BIGINT")
    assert column_types["code"].upper().startswith("VARCHAR")

    profiles = metadata.get("column_profiles") or []
    assert len(profiles) == 3
    amount_profile = next((p for p in profiles if p["name"] == "amount"), None)
    assert amount_profile is not None
    assert amount_profile["duckdb_type"].upper().startswith("DOUBLE")
    assert amount_profile["statistics"]["null_count"] == 0

    con.execute(f"DROP TABLE IF EXISTS '{table_name}'")


def test_csv_ingestion_preserves_types(tmp_path):
    con = get_db_connection()
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

    with patch("core.file_datasource_manager.file_datasource_manager.save_file_datasource"):
        metadata = create_table_from_dataframe(con, table_name, str(csv_path), "csv")

    info = con.execute(f"PRAGMA table_info('{table_name}')").fetchall()
    column_types = {row[1]: row[2] for row in info}

    assert column_types["price"].upper().startswith("DOUBLE")
    assert column_types["qty"].upper().startswith("BIGINT")
    assert column_types["label"].upper().startswith("VARCHAR")

    profiles = metadata.get("column_profiles") or []
    qty_profile = next((p for p in profiles if p["name"] == "qty"), None)
    assert qty_profile is not None
    assert qty_profile["duckdb_type"].upper().startswith("BIGINT")

    # 清理生成的文件
    con.execute(f"DROP TABLE IF EXISTS '{table_name}'")
    if Path(csv_path).exists():
        os.remove(csv_path)
