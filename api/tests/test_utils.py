import json
import os
import sys
from decimal import Decimal

import pandas as pd
import pytest

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from core.common.utils import normalize_dataframe_output


def test_normalize_dataframe_output_handles_nullable_numeric_and_datetime():
    tz_series = pd.Series(
        pd.to_datetime(
            ["2024-01-15T08:00:00Z", "2024-01-15T10:30:00Z", None], utc=True
        )
    )

    df = pd.DataFrame(
        {
            "int_col": pd.Series([1, pd.NA, 3], dtype="Int64"),
            "decimal_col": [Decimal("1.23"), Decimal("4.56"), Decimal("0")],
            "timestamp_col": pd.to_datetime(
                ["2024-02-01 12:34:56.123450", None, "2024-02-03 00:00:00.000000"]
            ),
            "tz_timestamp": tz_series,
            "bytes_col": [b"hello", None, bytes([0xFF])],
        }
    )

    records = normalize_dataframe_output(df)

    assert len(records) == 3
    assert records[0]["int_col"] == 1
    assert records[1]["int_col"] is None
    assert records[0]["decimal_col"] == pytest.approx(1.23)
    assert records[0]["timestamp_col"] == "2024-02-01 12:34:56.12345"
    assert records[2]["timestamp_col"] == "2024-02-03 00:00:00"
    assert records[1]["timestamp_col"] is None
    assert records[0]["tz_timestamp"] == "2024-01-15 08:00:00"
    assert records[1]["tz_timestamp"] == "2024-01-15 10:30:00"
    assert records[2]["tz_timestamp"] is None
    assert records[0]["bytes_col"] == "hello"
    assert records[2]["bytes_col"] == bytes([0xFF]).decode("utf-8", errors="replace")


def test_normalize_dataframe_output_handles_empty_frames():
    df = pd.DataFrame(columns=["a", "b"])
    assert normalize_dataframe_output(df) == []


def test_normalize_dataframe_output_handles_json_structures():
    df = pd.DataFrame(
        {
            "dict_col": [{"a": 1, "b": [1, 2, 3]}, None],
            "list_col": [[{"k": "v"}, 2], None],
            "mixed": [["alpha", None], [1, 2]],
        }
    )

    records = normalize_dataframe_output(df)

    dict_payload = json.loads(records[0]["dict_col"])
    list_payload = json.loads(records[0]["list_col"])
    mixed_payload = json.loads(records[0]["mixed"])

    assert dict_payload["b"] == [1, 2, 3]
    assert list_payload[0]["k"] == "v"
    assert mixed_payload[1] is None
    assert records[1]["dict_col"] is None


def test_normalize_dataframe_output_handles_inf_without_touching_objects():
    import numpy as np

    df = pd.DataFrame(
        {
            "numeric": [1.0, np.inf, -np.inf],
            "objects": [[1.5, 2], [3, 4], None],  # Use normal values, not inf
        }
    )

    records = normalize_dataframe_output(df)

    assert records[0]["numeric"] == 1.0
    assert records[1]["numeric"] is None  # inf becomes None
    assert records[2]["numeric"] is None  # -inf becomes None

    # For object columns with normal values
    object_payload = json.loads(records[0]["objects"])
    assert object_payload[0] == 1.5
