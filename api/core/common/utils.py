# pylint: disable=duplicate-code
"""
工具函数模块
"""

import json
import decimal
from datetime import datetime, date, timedelta, timezone
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
    elif isinstance(obj, timedelta):
        # INTERVAL 列契约：str(stdlib timedelta)，如 '3 days, 0:00:00'
        return str(obj)
    elif isinstance(obj, decimal.Decimal):
        # 使用十进制字符串，避免 float 精度损失；前端按字符串展示/筛选
        try:
            if hasattr(obj, "is_finite") and not obj.is_finite():
                return None
        except (decimal.InvalidOperation, ValueError, AttributeError):
            return None
        return str(obj)
    elif isinstance(obj, int) and not isinstance(obj, bool):
        if abs(obj) > _JS_MAX_SAFE_INT:
            return str(obj)
        return obj
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
    else:
        return obj


def handle_non_serializable_data(obj: Any) -> Any:
    """
    处理不可序列化的数据类型，转换为JSON可序列化的格式
    这是jsonable_encoder的别名，保持向后兼容
    """
    return jsonable_encoder(obj)


def describe_query_column_types(con: Any, sql: str) -> List[Dict[str, str]]:
    """对查询 SQL 执行 DESCRIBE 得到列类型；失败（多语句/PRAGMA 等）返回空。"""
    cleaned = (sql or "").strip().rstrip(";")
    if not cleaned:
        return []
    try:
        rows = con.execute(f"DESCRIBE ({cleaned})").fetchall()
        if rows:
            return [{"name": str(row[0]), "duckdb_type": str(row[1])} for row in rows]
    except Exception:
        pass
    return []


def _encode_cell(value: Any, is_datetime_col: bool) -> Any:
    """单个结果单元格 → JSON 安全标量（records_from_cursor 专用）。"""
    if value is None:
        return None
    if is_datetime_col:
        if not isinstance(value, datetime):
            # DATE 列：date → 当日零点，对齐 fetchdf/datetime64 的展示口径
            value = datetime(value.year, value.month, value.day)
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value.strftime(DATETIME_OUTPUT_FORMAT).rstrip("0").rstrip(".")
    encoded = jsonable_encoder(value)
    if isinstance(encoded, (dict, list, tuple, set)):
        # STRUCT/MAP/LIST/JSON：以 JSON 字符串下发（前端 TSV/CSV 复制按
        # String(value) 处理，裸对象会静默变 "[object Object]"）
        if isinstance(encoded, (tuple, set)):
            encoded = list(encoded)
        return json.dumps(encoded, ensure_ascii=False)
    return encoded


def records_from_cursor(res: Any, desc: Optional[List[Any]] = None) -> tuple:
    """DuckDB 游标 → (列名列表, JSON 安全记录列表)，纯 Python 直构。

    v1.2.x 在 pandas 各推断层（fetchdf 压 HUGEINT、DataFrame 构造器推断
    可空整型、convert_dtypes 整帧降型、map 按返回值重推断）累计修过 5 个
    改值 bug——records 直构把这一类发源地整体绕开。输出契约与
    normalize_dataframe_output 逐字节一致（22 列全类型电池对拍）：
    - DATE/TIMESTAMP*：空格分隔 '%Y-%m-%d %H:%M:%S.%f' 去尾零，TZ 先归 UTC
    - DECIMAL / 超 2^53 整数 → 十进制字符串；NULL/NaN/Inf → null
    - STRUCT/MAP/LIST/JSON → json.dumps 字符串；INTERVAL → str(timedelta)
    """
    if desc is None:
        desc = res.description or []
    names = [str(col[0]) for col in desc]
    if len(set(names)) != len(names):
        # 重复列名（SELECT 1 AS id, 2 AS id / 未加别名的 JOIN）：dict 记录会
        # 静默丢前值，按旧 pandas 语义去重为 id, id_1, id_2…（值全保留）
        seen: Dict[str, int] = {}
        deduped: List[str] = []
        for name in names:
            if name not in seen:
                seen[name] = 0
                deduped.append(name)
            else:
                seen[name] += 1
                candidate = f"{name}_{seen[name]}"
                while candidate in seen:
                    seen[name] += 1
                    candidate = f"{name}_{seen[name]}"
                seen[candidate] = 0
                deduped.append(candidate)
        names = deduped
    is_dt = [
        (t == "DATE" or t.startswith("TIMESTAMP"))
        for t in (str(col[1]).upper() for col in desc)
    ]
    records: List[Dict[str, Any]] = []
    for row in res.fetchall():
        records.append(
            {name: _encode_cell(value, dt) for name, dt, value in zip(names, is_dt, row)}
        )
    return names, records
