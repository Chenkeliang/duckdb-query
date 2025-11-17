"""
工具函数模块
"""

import json
import decimal
import numpy as np
import pandas as pd
from datetime import datetime, date
from typing import Any, Dict, List
from uuid import UUID

DATETIME_OUTPUT_FORMAT = "%Y-%m-%d %H:%M:%S.%f"


def jsonable_encoder(obj: Any) -> Any:
    """
    将对象转换为JSON可序列化的格式
    """
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    elif isinstance(obj, decimal.Decimal):
        return float(obj)
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (bytes, bytearray, memoryview)):
        return bytes(obj).decode("utf-8", errors="replace")
    elif isinstance(obj, dict):
        return {key: jsonable_encoder(value) for key, value in obj.items()}
    elif isinstance(obj, (list, tuple, set)):
        return [jsonable_encoder(item) for item in obj]
    elif isinstance(obj, UUID):
        return str(obj)
    elif pd.api.types.is_scalar(obj):
        try:
            if pd.isna(obj):
                return None
        except TypeError:
            pass
        return obj
    else:
        return obj


def handle_non_serializable_data(obj: Any) -> Any:
    """
    处理不可序列化的数据类型，转换为JSON可序列化的格式
    这是jsonable_encoder的别名，保持向后兼容
    """
    return jsonable_encoder(obj)


def normalize_dataframe_output(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    将DataFrame转换为JSON安全的记录列表，统一处理中间类型
    """
    if df is None or df.empty:
        return []

    normalized = df.copy()

    numeric_cols = normalized.select_dtypes(include=["number"])
    if not numeric_cols.empty:
        normalized[numeric_cols.columns] = numeric_cols.replace([np.inf, -np.inf], np.nan)

    try:
        normalized = normalized.convert_dtypes()
    except Exception:
        normalized = normalized.astype(object)

    datetime_cols = [
        col for col in normalized.columns if pd.api.types.is_datetime64_any_dtype(normalized[col])
    ]

    for col in datetime_cols:
        series = normalized[col]
        if isinstance(series.dtype, pd.DatetimeTZDtype):
            series = series.dt.tz_convert("UTC").dt.tz_localize(None)

        formatted_series = series.dt.strftime(DATETIME_OUTPUT_FORMAT)
        formatted_series = formatted_series.str.rstrip("0").str.rstrip(".")
        normalized[col] = formatted_series.where(~series.isna(), None)

    normalized = normalized.where(pd.notnull(normalized), None)
    if hasattr(normalized, "map"):
        normalized = normalized.map(handle_non_serializable_data)
    else:
        normalized = normalized.applymap(handle_non_serializable_data)

    records = normalized.to_dict(orient="records")
    safe_records: List[Dict[str, Any]] = []
    for record in records:
        safe_record: Dict[str, Any] = {}
        for key, value in record.items():
            processed_value = handle_non_serializable_data(value)
            if isinstance(processed_value, dict):
                safe_record[key] = json.dumps(processed_value, ensure_ascii=False)
            elif isinstance(processed_value, (list, tuple, set)):
                serialized_list = [jsonable_encoder(item) for item in processed_value]
                safe_record[key] = json.dumps(serialized_list, ensure_ascii=False)
            else:
                safe_record[key] = processed_value
        safe_records.append(safe_record)
    return safe_records
