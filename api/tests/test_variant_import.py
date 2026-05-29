"""VARIANT JSON 入湖测试（需 duckdb==1.5.3）"""

import json
import os
import tempfile

import pytest

duckdb = pytest.importorskip("duckdb")

from core.data.file_utils import load_file_to_duckdb


def test_load_json_as_variant_columns():
    payload = [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as handle:
        json.dump(payload, handle)
        path = handle.name

    try:
        con = duckdb.connect()
        load_file_to_duckdb(
            con,
            "variant_json_test",
            path,
            "json",
            import_mode="variant",
        )
        types = {
            row[0]: row[1]
            for row in con.execute(
                "SELECT column_name, column_type FROM (DESCRIBE variant_json_test)"
            ).fetchall()
        }
        assert types.get("name") == "VARIANT"
        assert types.get("age") == "VARIANT"
        row_count = con.execute("SELECT COUNT(*) FROM variant_json_test").fetchone()[0]
        assert row_count == 2
    finally:
        os.unlink(path)
