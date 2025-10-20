#!/usr/bin/env python3
"""Quick typed ingestion smoke test.

Usage::

    python scripts/check_typed_ingestion.py --file data/sample.csv --table sample_table

The script will ingest the file using the repository's typed pipeline and
print the detected DuckDB column types plus sampled statistics.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.duckdb_engine import get_db_connection  # noqa: E402
from core.file_datasource_manager import create_table_from_dataframe  # noqa: E402
from core.file_utils import detect_file_type  # noqa: E402


def _derive_file_type(path: Path, explicit: Optional[str]) -> str:
    if explicit:
        return explicit.lower()
    return detect_file_type(path.name)


def run_ingestion(file_path: Path, table_name: str, file_type: Optional[str]) -> None:
    con = get_db_connection()
    inferred_type = _derive_file_type(file_path, file_type)

    # 若文件类型为 pandas 不直接支持的格式也能输出信息（例如 jsonl）
    payload = str(file_path)
    if inferred_type in {"csv", "excel", "json", "jsonl", "parquet"}:
        payload = str(file_path)

    metadata = create_table_from_dataframe(con, table_name, payload, inferred_type)

    print(json.dumps({
        "table": table_name,
        "file": str(file_path),
        "file_type": inferred_type,
        "row_count": metadata.get("row_count"),
        "column_count": metadata.get("column_count"),
        "column_profiles": metadata.get("column_profiles"),
    }, ensure_ascii=False, indent=2))


def main(argv: Optional[list] = None) -> None:
    parser = argparse.ArgumentParser(description="Run typed ingestion checks against a file")
    parser.add_argument("--file", required=True, help="Path to the input file")
    parser.add_argument("--table", required=False, help="Target DuckDB table name")
    parser.add_argument("--file-type", required=False, help="Explicit file type override (csv, excel, parquet, json, jsonl)")
    parser.add_argument("--drop", action="store_true", help="Drop the table after verification")

    args = parser.parse_args(argv)
    file_path = Path(args.file).expanduser()
    if not file_path.exists():
        raise SystemExit(f"File not found: {file_path}")

    table_name = args.table or f"typed_check_{file_path.stem}"

    run_ingestion(file_path, table_name, args.file_type)

    if args.drop:
        con = get_db_connection()
        con.execute(f"DROP TABLE IF EXISTS \"{table_name}\"")


if __name__ == "__main__":
    main()
