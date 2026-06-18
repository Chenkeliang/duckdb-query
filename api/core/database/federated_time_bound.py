"""联邦大表时间界检测 —— 纯函数。移植自 frontend/src/Query/JoinQuery/timeBound.ts。

仅做"检测 + 建议",不改写 SQL（时间界会改变结果,必须由调用方显式决定）。
"""
from __future__ import annotations

import datetime as _dt
import re
from typing import Any, Optional

# create 系词干（小写子串匹配）。'creat' 覆盖 create/created/gmt_create。
_CREATE_STEMS = ("creat", "ctime", "add_time", "insert_time")
# update 系词干。'updat' 覆盖 update/updated；'modif' 覆盖 modify/modified/gmt_modified。
_UPDATE_STEMS = ("updat", "modif", "mtime")


def is_time_type(type_str: str) -> bool:
    """可做时间界的列类型（排除 TIME / YEAR）。覆盖源库原生类型与 DuckDB 归一化类型。"""
    t = re.sub(r"\(.*\)", "", (type_str or "")).upper().strip()
    if t in ("DATE", "DATETIME"):
        return True
    if t.startswith("TIMESTAMP"):  # TIMESTAMP / TIMESTAMP_NS / TIMESTAMP WITHOUT TIME ZONE …
        return True
    return False


def classify_audit_column(name: str) -> Optional[str]:
    """按列名分类审计语义；非审计名返回 None。"""
    n = (name or "").lower()
    if any(s in n for s in _CREATE_STEMS):
        return "create"
    if any(s in n for s in _UPDATE_STEMS):
        return "update"
    return None


def _col_name(col: Any) -> str:
    if isinstance(col, dict):
        return str(col.get("name") or col.get("column_name") or "")
    return str(col)


def _col_type(col: Any) -> str:
    if isinstance(col, dict):
        return str(col.get("type") or col.get("column_type") or "")
    return ""


def detect_time_bound_candidates(columns: list) -> list[str]:
    """候选时间界列：类型为时间型 且 审计命名；create 系排在 update 系前。"""
    time_cols = [c for c in (columns or []) if is_time_type(_col_type(c))]
    creates = [_col_name(c) for c in time_cols if classify_audit_column(_col_name(c)) == "create"]
    updates = [_col_name(c) for c in time_cols if classify_audit_column(_col_name(c)) == "update"]
    return creates + updates


def default_time_bound_value(now: Optional[_dt.datetime] = None, days: int = 30) -> str:
    """近 N 天起点,裸日期串 'YYYY-MM-DD 00:00:00'（不含 SQL 引号）。"""
    base = now or _dt.datetime.now()
    d = (base - _dt.timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    return d.strftime("%Y-%m-%d 00:00:00")
