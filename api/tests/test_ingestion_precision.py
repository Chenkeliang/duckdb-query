from pathlib import Path
from uuid import uuid4

import duckdb
import pytest
from core.data.ingestion_precision import is_identifier_column_name
from core.data.file_datasource_manager import create_table_from_file_path_typed
from core.data.excel_import_manager import load_excel_sheet_rows


def _make_table_name(prefix: str) -> str:
    return f"test_{prefix}_{uuid4().hex[:8]}"


def test_is_identifier_column_name():
    assert is_identifier_column_name("order_id")
    assert is_identifier_column_name("SKU_CODE")
    assert not is_identifier_column_name("amount")


def test_rows_ingest_preserves_long_integer_codes():
    """行式入库 + 促升：长整型编码列保持 VARCHAR 文本，值逐位保留。"""
    from core.data.ingestion_precision import promote_table_column_types_from_varchar
    from core.data.rows_ingest import load_rows_as_varchar_table

    con = duckdb.connect()
    try:
        temp, cleanup = load_rows_as_varchar_table(
            con,
            ["order_id", "qty", "price"],
            [
                ["1234567890123456789", "1", "12.50"],
                ["9876543210987654321", "2", "3.00"],
            ],
        )
        try:
            con.execute(f'CREATE TABLE t_rows AS SELECT * FROM "{temp}"')
        finally:
            cleanup()
        promote_table_column_types_from_varchar(con, "t_rows")
        types = {r[0]: r[1] for r in con.execute("DESCRIBE t_rows").fetchall()}
        assert types["order_id"] == "VARCHAR"  # 标识符名 + 长整型编码
        row = con.execute(
            "SELECT order_id, price FROM t_rows ORDER BY qty"
        ).fetchone()
        assert row[0] == "1234567890123456789"
        assert str(row[1]) == "12.50"
    finally:
        con.close()


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

    header, rows = load_excel_sheet_rows(str(xlsx_path), ws.title, header_rows=1)
    assert header[0] == "order_id"
    assert str(rows[0][0]) == "1234567890123456789"


# ---------- 值无损提升守卫（财务准则：任何存疑保持 VARCHAR） ----------

def _create_varchar_table(con, name, column, values):
    con.execute(f'CREATE TABLE "{name}" ("{column}" VARCHAR)')
    con.executemany(f'INSERT INTO "{name}" VALUES (?)', [(v,) for v in values])


def _column_type(con, table, column):
    rows = con.execute(f"PRAGMA table_info('{table}')").fetchall()
    return {r[1]: str(r[2]).upper() for r in rows}[column]


def test_promote_blocks_leading_zero_codes(ingestion_con):
    from core.data.ingestion_precision import promote_table_column_types_from_varchar

    t = _make_table_name("zero_pad")
    _create_varchar_table(ingestion_con, t, "val", ["007", "0001"])
    promote_table_column_types_from_varchar(ingestion_con, t)
    assert _column_type(ingestion_con, t, "val") == "VARCHAR"
    rows = [r[0] for r in ingestion_con.execute(f'SELECT val FROM "{t}" ORDER BY val').fetchall()]
    assert rows == ["0001", "007"]


def test_promote_blocks_leading_zero_decimals(ingestion_con):
    from core.data.ingestion_precision import promote_table_column_types_from_varchar

    t = _make_table_name("zero_dec")
    _create_varchar_table(ingestion_con, t, "val", ["007.50", "1.25"])
    promote_table_column_types_from_varchar(ingestion_con, t)
    assert _column_type(ingestion_con, t, "val") == "VARCHAR"


def test_promote_blocks_non_roundtrip_integers(ingestion_con):
    from core.data.ingestion_precision import promote_table_column_types_from_varchar

    t = _make_table_name("plus_sign")
    _create_varchar_table(ingestion_con, t, "val", ["+42", "17"])
    promote_table_column_types_from_varchar(ingestion_con, t)
    assert _column_type(ingestion_con, t, "val") == "VARCHAR"

    t2 = _make_table_name("overflow")
    _create_varchar_table(ingestion_con, t2, "val", ["9999999999999999999"])  # 19 位超 int64
    promote_table_column_types_from_varchar(ingestion_con, t2)
    assert _column_type(ingestion_con, t2, "val") == "VARCHAR"


def test_promote_clean_integers_to_bigint(ingestion_con):
    from core.data.ingestion_precision import promote_table_column_types_from_varchar

    t = _make_table_name("clean_int")
    _create_varchar_table(ingestion_con, t, "val", ["42", "-17", "0"])
    promote_table_column_types_from_varchar(ingestion_con, t)
    assert _column_type(ingestion_con, t, "val") == "BIGINT"


def test_promote_decimal_uses_column_max_scale(ingestion_con):
    from decimal import Decimal
    from core.data.ingestion_precision import promote_table_column_types_from_varchar

    t = _make_table_name("mixed_scale")
    _create_varchar_table(ingestion_con, t, "val", ["1.5", "2.25", "-0.30"])
    promote_table_column_types_from_varchar(ingestion_con, t)
    assert _column_type(ingestion_con, t, "val") == "DECIMAL(38,2)"
    rows = [r[0] for r in ingestion_con.execute(f'SELECT val FROM "{t}" ORDER BY val').fetchall()]
    assert rows == [Decimal("-0.30"), Decimal("1.50"), Decimal("2.25")]


def test_promote_decimal_high_scale_exact_no_rounding(ingestion_con):
    from core.data.ingestion_precision import promote_table_column_types_from_varchar

    t = _make_table_name("high_scale")
    original = "0.1234567890123456789"  # 19 位小数：旧实现会被 18 位上限静默舍入
    _create_varchar_table(ingestion_con, t, "val", [original])
    promote_table_column_types_from_varchar(ingestion_con, t)
    assert _column_type(ingestion_con, t, "val") == "DECIMAL(38,19)"
    stored = ingestion_con.execute(f'SELECT CAST(val AS VARCHAR) FROM "{t}"').fetchone()[0]
    assert stored == original


def test_promote_decimal_over_capacity_stays_varchar(ingestion_con):
    from core.data.ingestion_precision import promote_table_column_types_from_varchar

    t = _make_table_name("over_cap")
    _create_varchar_table(
        ingestion_con, t, "val",
        ["12345678901234567890.123456789012345678901234567890"],  # 20+30 位 > DECIMAL(38) 容量
    )
    promote_table_column_types_from_varchar(ingestion_con, t)
    assert _column_type(ingestion_con, t, "val") == "VARCHAR"


def test_promote_skips_chinese_identifier_columns(ingestion_con):
    from core.data.ingestion_precision import promote_table_column_types_from_varchar

    for col in ["手机号", "渠道编码", "订单号"]:
        t = _make_table_name("cn_ident")
        _create_varchar_table(ingestion_con, t, col, ["13800138000"])
        promote_table_column_types_from_varchar(ingestion_con, t)
        assert _column_type(ingestion_con, t, col) == "VARCHAR", col


def test_promote_timestamp_text_not_truncated_to_date(ingestion_con):
    """回归：TRY_CAST(时间戳文本 AS DATE) 会截断成功——必须以文本往返阻止时分秒静默丢失"""
    from core.data.ingestion_precision import promote_table_column_types_from_varchar

    t = _make_table_name("ts_text")
    _create_varchar_table(ingestion_con, t, "val", ["2024-07-15 10:30:00", "2024-01-01 00:00:00"])
    promote_table_column_types_from_varchar(ingestion_con, t)
    assert _column_type(ingestion_con, t, "val") == "TIMESTAMP"
    stored = ingestion_con.execute(
        f'SELECT CAST(val AS VARCHAR) FROM "{t}" ORDER BY val DESC'
    ).fetchone()[0]
    assert stored == "2024-07-15 10:30:00"


def test_promote_pure_dates_to_date(ingestion_con):
    from core.data.ingestion_precision import promote_table_column_types_from_varchar

    t = _make_table_name("date_text")
    _create_varchar_table(ingestion_con, t, "val", ["2024-07-15", "2023-12-31"])
    promote_table_column_types_from_varchar(ingestion_con, t)
    assert _column_type(ingestion_con, t, "val") == "DATE"


def test_promote_mixed_date_formats_stay_varchar(ingestion_con):
    from core.data.ingestion_precision import promote_table_column_types_from_varchar

    t = _make_table_name("date_mixed")
    _create_varchar_table(ingestion_con, t, "val", ["2024-07-15", "2024-07-15 10:30:00"])
    promote_table_column_types_from_varchar(ingestion_con, t)
    assert _column_type(ingestion_con, t, "val") == "VARCHAR"
