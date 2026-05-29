# pylint: disable=duplicate-code
"""
工具函数模块
"""

import json
import decimal
import numpy as np
import pandas as pd
from datetime import datetime, date
from typing import Any, Dict, List, Optional
from uuid import UUID

DATETIME_OUTPUT_FORMAT = "%Y-%m-%d %H:%M:%S.%f"

# JavaScript Number.MAX_SAFE_INTEGER — 超过则序列化为字符串，避免前端精度丢失
_JS_MAX_SAFE_INT = 9007199254740991


def jsonable_encoder(obj: Any) -> Any:
    """
    将对象转换为 JSON 可序列化的格式（供 API 响应 / 记录列表使用）。

    契约说明（与 DuckDB 表结构、JOIN 元数据区分）：
    - 本函数只影响「查询结果行」在 HTTP JSON 中的标量形态，不改变数据库里列的
      DuckDB 类型；Join / 可视化查询所依赖的列类型来自表结构接口（如列元数据），
      与此处是否输出 str 无直接耦合。
    - 对超出 JS 安全整数或 Decimal 的值使用 str，可避免前端 Number 精度丢失；
      若前端用 `===` 将单元格与另一来源的 number 比较、或仅识别 `typeof === 'number'`
      做数值统计，需改为宽松解析或依赖服务端类型字段。
    """
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    elif isinstance(obj, decimal.Decimal):
        # 使用十进制字符串，避免 float 精度损失；前端按字符串展示/筛选
        try:
            if hasattr(obj, "is_finite") and not obj.is_finite():
                return None
        except (decimal.InvalidOperation, ValueError, AttributeError):
            return None
        return str(obj)
    elif isinstance(obj, np.integer):
        val = int(obj)
        if abs(val) > _JS_MAX_SAFE_INT:
            return str(val)
        return val
    elif isinstance(obj, int) and not isinstance(obj, bool):
        if abs(obj) > _JS_MAX_SAFE_INT:
            return str(obj)
        return obj
    elif isinstance(obj, np.floating):
        # 检查 NaN 和 Inf
        if np.isnan(obj) or np.isinf(obj):
            return None
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
    elif isinstance(obj, float):
        # 处理 Python float 的 NaN/Inf
        import math
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
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


def duckdb_column_types_from_dataframe(
    con: Any,
    df: pd.DataFrame,
) -> List[Dict[str, str]]:
    """将结果 DataFrame 注册为临时视图后 DESCRIBE，得到 DuckDB 列类型。"""
    if df is None or len(df.columns) == 0:
        return []

    from uuid import uuid4

    temp = f"__coltypes_{uuid4().hex}"
    try:
        con.register(temp, df)
        rows = con.execute(f'DESCRIBE "{temp}"').fetchall()
        return [{"name": str(row[0]), "duckdb_type": str(row[1])} for row in rows]
    except Exception:
        return [
            {"name": str(col), "duckdb_type": str(df[col].dtype)}
            for col in df.columns
        ]
    finally:
        try:
            con.unregister(temp)
        except Exception:
            pass


def describe_query_column_types(
    con: Any,
    sql: str,
    fallback_df: Optional[pd.DataFrame] = None,
) -> List[Dict[str, str]]:
    """对查询 SQL 执行 DESCRIBE，失败时回退到 DataFrame 注册描述。"""
    cleaned = (sql or "").strip().rstrip(";")
    if not cleaned:
        return []
    try:
        rows = con.execute(f"DESCRIBE ({cleaned})").fetchall()
        if rows:
            return [{"name": str(row[0]), "duckdb_type": str(row[1])} for row in rows]
    except Exception:
        pass
    if fallback_df is not None:
        return duckdb_column_types_from_dataframe(con, fallback_df)
    return []


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

    object_cols = normalized.select_dtypes(include=["object", "string"]).columns.tolist()
    object_cols_backup = {col: normalized[col].copy() for col in object_cols}

    try:
        normalized = normalized.convert_dtypes()
    except Exception:
        normalized = normalized.astype(object)

    # 恢复 object 列的原始值（避免日期字符串被转换后重新格式化）
    for col in object_cols_backup:
        if col in normalized.columns:
            normalized[col] = object_cols_backup[col]


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
