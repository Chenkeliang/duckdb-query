"""jsonable_encoder / records_from_cursor 单元契约。

（全类型端到端契约见 test_decimal_fetch_precision 的电池；本文件测编码器
本身的标量分支与游标边界。）
"""

import os
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import duckdb

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from core.common.utils import jsonable_encoder, records_from_cursor


class TestJsonableEncoder:
    def test_decimal_to_exact_string(self):
        assert jsonable_encoder(Decimal("1.230")) == "1.230"  # 标度保留
        assert jsonable_encoder(Decimal("-0.30")) == "-0.30"
        assert jsonable_encoder(Decimal("NaN")) is None

    def test_int_js_safe_boundary(self):
        assert jsonable_encoder(9007199254740991) == 9007199254740991
        assert jsonable_encoder(9007199254740992) == "9007199254740992"
        assert jsonable_encoder(-9007199254740992) == "-9007199254740992"

    def test_bool_not_treated_as_int(self):
        assert jsonable_encoder(True) is True

    def test_float_nan_inf_to_null(self):
        assert jsonable_encoder(float("nan")) is None
        assert jsonable_encoder(float("inf")) is None
        assert jsonable_encoder(0.5) == 0.5

    def test_datetime_isoformat(self):
        assert jsonable_encoder(date(2024, 7, 15)) == "2024-07-15"
        assert (
            jsonable_encoder(datetime(2024, 7, 15, 10, 30))
            == "2024-07-15T10:30:00"
        )

    def test_timedelta_pinned_contract(self):
        assert jsonable_encoder(timedelta(days=3)) == "3 days, 0:00:00"

    def test_bytes_decoded_with_replacement(self):
        assert jsonable_encoder(b"hello") == "hello"
        assert jsonable_encoder(bytes([0xFF])) == bytes([0xFF]).decode(
            "utf-8", errors="replace"
        )

    def test_containers_recursive(self):
        out = jsonable_encoder({"a": Decimal("1.5"), "b": [9007199254740993]})
        assert out == {"a": "1.5", "b": ["9007199254740993"]}

    def test_uuid_to_string(self):
        value = UUID("12345678-1234-5678-1234-567812345678")
        assert jsonable_encoder(value) == str(value)


class TestRecordsFromCursor:
    def test_empty_result_keeps_columns(self):
        con = duckdb.connect()
        try:
            res = con.execute("SELECT 1 AS a, 'x' AS b WHERE false")
            columns, records = records_from_cursor(res, res.description)
            assert columns == ["a", "b"]
            assert records == []
        finally:
            con.close()

    def test_dict_and_list_emitted_as_json_strings(self):
        con = duckdb.connect()
        try:
            res = con.execute(
                "SELECT {'a': 1, 'b': [1, 2, 3]} AS st, [{'k': 'v'}, NULL] AS li"
            )
            _, records = records_from_cursor(res, res.description)
            assert records[0]["st"] == '{"a": 1, "b": [1, 2, 3]}'
            assert records[0]["li"] == '[{"k": "v"}, null]'
        finally:
            con.close()
