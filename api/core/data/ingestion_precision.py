"""
文件导入：在尽量保持原文件语义的前提下，避免 DOUBLE / 科学计数法导致的精度与显示问题。

推荐策略（DuckDB 1.4+）：
1. 先忠实读入：CSV / Excel 使用 all_varchar（或 DataFrame 单元格转字面量字符串）。
2. 再整列无损提升：仅当列内每个非空值都能安全 CAST 时才升为 BIGINT / DECIMAL / DATE 等，**不升为 DOUBLE**。
"""

from __future__ import annotations

import logging
import math
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

logger = logging.getLogger(__name__)

# 纯数字字符串超过该位数一律保持 VARCHAR（避免 BIGINT 边界与 float 双花）
_MAX_INTEGER_STRING_DIGITS = 18

_IDENTIFIER_NAME_RE = re.compile(
    r"(^id$|_id$|^id_|_id_|^code$|_code$|code_|sku|serial|barcode|account|phone|zip|postal|order_no|tracking)",
    re.IGNORECASE,
)

def is_identifier_column_name(name: str) -> bool:
    if not name:
        return False
    return bool(_IDENTIFIER_NAME_RE.search(str(name).strip().lower()))


def _quote_identifier(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def _float_to_plain_decimal_str(value: float) -> str:
    if not math.isfinite(value):
        return ""
    if value == 0.0:
        return "0"
    try:
        text = format(Decimal(str(value)), "f")
    except Exception:  # pylint: disable=broad-exception-caught
        text = repr(value)
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def cell_to_literal(value: Any) -> Any:
    """将单元格转为可无损落库的字面量（日期时间除外）。"""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    if isinstance(value, (datetime, date)):
        return value
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, float):
        if math.isfinite(value) and value == math.floor(value):
            return str(int(value))
        return _float_to_plain_decimal_str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value).decode("utf-8", errors="replace")

    text = str(value).strip()
    if text.lower() in {"", "nan", "none", "<na>", "nat"}:
        return None
    return text


def dataframe_to_literal_fidelity(df: pd.DataFrame) -> pd.DataFrame:
    """多 Sheet Excel 等路径：先统一为字面量，再由 DuckDB 做安全类型提升。"""
    if df is None or df.empty:
        return df

    result = df.copy()
    for col in result.columns:
        if pd.api.types.is_datetime64_any_dtype(result[col]):
            continue
        result[col] = result[col].map(cell_to_literal)
    return result


def _parse_sniff_columns(columns_value: Any) -> List[Tuple[str, str]]:
    if columns_value is None:
        return []
    pairs: List[Tuple[str, str]] = []
    if not isinstance(columns_value, list):
        return pairs
    for item in columns_value:
        if isinstance(item, dict):
            name = item.get("name") or item.get("column_name")
            dtype = item.get("type") or item.get("column_type") or "VARCHAR"
            if name:
                pairs.append((str(name), str(dtype)))
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            pairs.append((str(item[0]), str(item[1])))
    return pairs


def _column_values_are_long_integer_codes(series: pd.Series) -> bool:
    non_null = series.dropna()
    if non_null.empty:
        return False
    as_str = non_null.astype(str).str.strip()
    if not as_str.str.match(r"^\d+$").all():
        return False
    return int(as_str.str.len().max()) >= _MAX_INTEGER_STRING_DIGITS


def build_csv_column_type_overrides(
    connection: Any, file_path: str, sample_size: int = -1
) -> Dict[str, str]:
    """
    非 fidelity 模式下的 CSV 类型覆盖（fidelity 模式请用 all_varchar + promote）。
    """
    overrides: Dict[str, str] = {}
    try:
        row = connection.execute(
            "SELECT Columns FROM sniff_csv(?, sample_size = ?)",
            [file_path, sample_size],
        ).fetchone()
        if not row:
            return overrides
        for name, dtype in _parse_sniff_columns(row[0]):
            upper = dtype.upper()
            if is_identifier_column_name(name):
                overrides[name] = "VARCHAR"
                continue
            if upper in {"DOUBLE", "FLOAT", "REAL"}:
                try:
                    quoted = _quote_identifier(name)
                    sample_df = connection.execute(
                        f"SELECT {quoted} AS col FROM read_csv(?, all_varchar = true) LIMIT 500",
                        [file_path],
                    ).fetchdf()
                    if _column_values_are_long_integer_codes(sample_df["col"]):
                        overrides[name] = "VARCHAR"
                except Exception as exc:  # pylint: disable=broad-exception-caught
                    logger.debug(
                        "CSV long-integer sample check skipped for %s: %s", name, exc
                    )
    except Exception as exc:  # pylint: disable=broad-exception-caught
        logger.debug("sniff_csv failed for %s: %s", file_path, exc)
    return overrides


def _infer_varchar_column_promotion(
    connection: Any, quoted_table: str, column_name: str
) -> Optional[str]:
    """根据列内实际文本推断可无损提升的目标类型；无法保证则返回 None（保持 VARCHAR）。"""
    qcol = _quote_identifier(column_name)
    stats = connection.execute(
        f"""
        WITH src AS (
            SELECT trim(CAST({qcol} AS VARCHAR)) AS v
            FROM {quoted_table}
            WHERE {qcol} IS NOT NULL AND trim(CAST({qcol} AS VARCHAR)) <> ''
        )
        SELECT
            count(*) AS n,
            count(*) FILTER (WHERE regexp_full_match(v, '^[+-]?\\d+$')) AS int_like,
            count(*) FILTER (WHERE regexp_full_match(v, '^[+-]?\\d+\\.\\d+$')) AS dec_like,
            max(length(v)) AS max_len
        FROM src
        """
    ).fetchone()

    if not stats or stats[0] == 0:
        return None

    n, int_like, dec_like, _max_len = stats
    if int_like == n:
        digit_stats = connection.execute(
            f"""
            WITH src AS (
                SELECT trim(CAST({qcol} AS VARCHAR)) AS v
                FROM {quoted_table}
                WHERE {qcol} IS NOT NULL AND trim(CAST({qcol} AS VARCHAR)) <> ''
            )
            SELECT max(length(replace(replace(v, '-', ''), '+', ''))) FROM src
            """
        ).fetchone()
        max_digits = digit_stats[0] if digit_stats else 0
        if max_digits and max_digits <= _MAX_INTEGER_STRING_DIGITS:
            return "BIGINT"
        return None

    if dec_like == n:
        scale_row = connection.execute(
            f"""
            WITH src AS (
                SELECT trim(CAST({qcol} AS VARCHAR)) AS v
                FROM {quoted_table}
                WHERE {qcol} IS NOT NULL AND trim(CAST({qcol} AS VARCHAR)) <> ''
            )
            SELECT max(length(split_part(v, '.', 2))) FROM src
            """
        ).fetchone()
        scale = int(scale_row[0] or 0) if scale_row else 0
        scale = min(max(scale, 0), 18)
        return f"DECIMAL(38,{scale})"

    date_stats = connection.execute(
        f"""
        WITH src AS (
            SELECT trim(CAST({qcol} AS VARCHAR)) AS v
            FROM {quoted_table}
            WHERE {qcol} IS NOT NULL AND trim(CAST({qcol} AS VARCHAR)) <> ''
        )
        SELECT
            count(*) AS n,
            count(*) FILTER (WHERE TRY_CAST(v AS DATE) IS NULL) AS bad_date,
            count(*) FILTER (WHERE TRY_CAST(v AS TIMESTAMP) IS NULL) AS bad_ts
        FROM src
        """
    ).fetchone()
    if date_stats and date_stats[0] > 0 and date_stats[1] == 0:
        return "DATE"
    if date_stats and date_stats[0] > 0 and date_stats[2] == 0:
        return "TIMESTAMP"

    return None


def promote_table_column_types_from_varchar(
    connection: Any, table_name: str
) -> List[Tuple[str, str]]:
    """
    对已落库的表，将可安全转型的 VARCHAR 列提升为 BIGINT / DECIMAL / DATE / TIMESTAMP。
    永不提升为 DOUBLE，避免科学计数法与 ID 精度问题。
    """
    quoted_table = _quote_identifier(table_name)
    promoted: List[Tuple[str, str]] = []

    try:
        columns_info = connection.execute(
            f"PRAGMA table_info({quoted_table})"
        ).fetchall()
    except Exception as exc:  # pylint: disable=broad-exception-caught
        logger.debug("promote_table_column_types: pragma failed for %s: %s", table_name, exc)
        return promoted

    for col_info in columns_info:
        col_name = col_info[1]
        col_type = str(col_info[2]).upper()
        if col_type != "VARCHAR":
            continue
        if is_identifier_column_name(col_name):
            continue

        target = _infer_varchar_column_promotion(connection, quoted_table, col_name)
        if not target or target == "VARCHAR":
            continue

        qcol = _quote_identifier(col_name)
        try:
            connection.execute(
                f"""
                ALTER TABLE {quoted_table}
                ALTER COLUMN {qcol} SET DATA TYPE {target}
                USING TRY_CAST(trim(CAST({qcol} AS VARCHAR)) AS {target})
                """
            )
            promoted.append((col_name, target))
            logger.info("Promoted column %s.%s to %s", table_name, col_name, target)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.debug(
                "Column promotion skipped for %s.%s -> %s: %s",
                table_name,
                col_name,
                target,
                exc,
            )

    return promoted


def coerce_dataframe_numeric_columns_safe(
    df: pd.DataFrame, import_mode: Optional[str] = None
) -> pd.DataFrame:
    """将 Sheet 数据转为字面量；import_mode 由落库后的 promote 体现（auto）或保持 VARCHAR（literal）。"""
    from core.data.import_mode import normalize_import_mode

    if df is None or df.empty:
        return df
    normalize_import_mode(import_mode)
    return dataframe_to_literal_fidelity(df)
