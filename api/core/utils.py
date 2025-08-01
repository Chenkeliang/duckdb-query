"""
工具函数模块
"""

import json
import decimal
import numpy as np
import pandas as pd
from datetime import datetime, date
from typing import Any


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
    elif pd.isna(obj):
        return None
    elif isinstance(obj, dict):
        return {key: jsonable_encoder(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [jsonable_encoder(item) for item in obj]
    else:
        return obj


def handle_non_serializable_data(obj: Any) -> Any:
    """
    处理不可序列化的数据类型，转换为JSON可序列化的格式
    这是jsonable_encoder的别名，保持向后兼容
    """
    return jsonable_encoder(obj)
