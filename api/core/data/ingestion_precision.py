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


logger = logging.getLogger(__name__)

# 纯数字字符串超过该位数一律保持 VARCHAR（避免 BIGINT 边界与 float 双花）
_MAX_INTEGER_STRING_DIGITS = 18

_IDENTIFIER_NAME_RE = re.compile(
    r"(^id$|_id$|^id_|_id_|^code$|_code$|code_|sku|serial|barcode|account|phone|zip|postal|order_no|tracking"
    r"|单号|编号|编码|号码|手机|电话|身份证|证件|卡号|账号|账户|工号|邮编)",
    re.IGNORECASE,
)

def is_identifier_column_name(name: str) -> bool:
    if not name:
        return False
    return bool(_IDENTIFIER_NAME_RE.search(str(name).strip().lower()))


# 标识符转义统一走 core.common.sql_identifiers(消灭历史 8 份副本)
from core.common.sql_identifiers import quote_identifier as _quote_identifier  # noqa: E402


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


def _column_values_are_long_integer_codes(values: List[Any]) -> bool:
    texts = [str(v).strip() for v in values if v is not None]
    if not texts:
        return False
    if not all(t.isdigit() for t in texts):
        return False
    return max(len(t) for t in texts) >= _MAX_INTEGER_STRING_DIGITS


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
                    sample_values = [
                        row[0]
                        for row in connection.execute(
                            f"SELECT {quoted} AS col FROM read_csv(?, all_varchar = true) LIMIT 500",
                            [file_path],
                        ).fetchall()
                    ]
                    if _column_values_are_long_integer_codes(sample_values):
                        overrides[name] = "VARCHAR"
                except Exception as exc:  # pylint: disable=broad-exception-caught
                    logger.debug(
                        "CSV long-integer sample check skipped for %s: %s", name, exc
                    )
    except Exception as exc:  # pylint: disable=broad-exception-caught
        logger.debug("sniff_csv failed for %s: %s", file_path, exc)
    return overrides


def infer_varchar_column_promotion(
    connection: Any, quoted_table: str, column_name: str
) -> Optional[str]:
    """根据列内实际文本推断可无损提升的目标类型；无法保证则返回 None（保持 VARCHAR）。

    值无损不变量（财务准则）：
    - 整数列：逐值文本往返一致（CAST(CAST(v AS BIGINT) AS VARCHAR) = v），
      一条判据同时封死前导零、正号、超界等一切文本变形；
    - 小数列：以列内最大小数位数为 DECIMAL 标度（数学上不可能发生舍入），
      整数位 + 小数位超出 DECIMAL(38) 容量则保持 VARCHAR，绝不静默舍入；
      混合标度（1.5 与 1.50 同列）按最大标度归一，数值严格相等；
    - 任何值带前导零（007、007.50）视作编码语义，整列不提升。
    """
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
            count(*) FILTER (WHERE regexp_full_match(v, '^[+-]?0\\d.*')) AS zero_padded
        FROM src
        """
    ).fetchone()

    if not stats or stats[0] == 0:
        return None

    n, int_like, dec_like, zero_padded = stats
    if zero_padded:
        return None

    if int_like == n:
        roundtrip = connection.execute(
            f"""
            WITH src AS (
                SELECT trim(CAST({qcol} AS VARCHAR)) AS v
                FROM {quoted_table}
                WHERE {qcol} IS NOT NULL AND trim(CAST({qcol} AS VARCHAR)) <> ''
            )
            SELECT count(*) FILTER (
                WHERE CAST(TRY_CAST(v AS BIGINT) AS VARCHAR) IS DISTINCT FROM v
            ) FROM src
            """
        ).fetchone()
        if roundtrip and roundtrip[0] == 0:
            return "BIGINT"
        return None

    # int_like + dec_like == n:整列全是纯整数或纯小数(至少一个带小数点,否则上面
    # int_like==n 分支已返回)。整数行按 0 位小数并入,与小数行一起提升为 DECIMAL——
    # ["1","2.50"] 这类"金额列里部分值写成整数"不再因两分支都不满足而退回 VARCHAR。
    if int_like + dec_like == n:
        digits_row = connection.execute(
            f"""
            WITH src AS (
                SELECT trim(CAST({qcol} AS VARCHAR)) AS v
                FROM {quoted_table}
                WHERE {qcol} IS NOT NULL AND trim(CAST({qcol} AS VARCHAR)) <> ''
            )
            SELECT
                max(length(split_part(v, '.', 2))) AS frac_digits,
                max(length(replace(replace(split_part(v, '.', 1), '-', ''), '+', ''))) AS int_digits
            FROM src
            """
        ).fetchone()
        if not digits_row:
            return None
        scale = int(digits_row[0] or 0)
        int_digits = int(digits_row[1] or 0)
        if scale < 1 or scale > 38 or int_digits + scale > 38:
            return None
        return f"DECIMAL(38,{scale})"

    # 日期/时间戳同样要求文本往返一致：DuckDB 的 TRY_CAST('2024-07-15 10:30:00' AS DATE)
    # 会"成功"并截断时间部分——只按可转判断会静默丢失时分秒
    date_stats = connection.execute(
        f"""
        WITH src AS (
            SELECT trim(CAST({qcol} AS VARCHAR)) AS v
            FROM {quoted_table}
            WHERE {qcol} IS NOT NULL AND trim(CAST({qcol} AS VARCHAR)) <> ''
        )
        SELECT
            count(*) AS n,
            count(*) FILTER (
                WHERE CAST(TRY_CAST(v AS DATE) AS VARCHAR) IS DISTINCT FROM v
            ) AS date_not_roundtrip,
            count(*) FILTER (
                WHERE CAST(TRY_CAST(v AS TIMESTAMP) AS VARCHAR) IS DISTINCT FROM v
            ) AS ts_not_roundtrip
        FROM src
        """
    ).fetchone()
    if date_stats and date_stats[0] > 0 and date_stats[1] == 0:
        return "DATE"
    if date_stats and date_stats[0] > 0 and date_stats[2] == 0:
        return "TIMESTAMP"

    return None


def analyze_numeric_cast(
    connection: Any, quoted_table: str, column_name: str
) -> Dict[str, Any]:
    """在(已筛选的)数据上刻画一列作为数值 cast 目标的安全性,用于透视文本聚合 / JOIN 冲突
    的数据感知推荐。关键:DECIMAL 标度取自实际最大小数位,而非固定常量——从根上避免
    "固定 scale < 数据精度" 导致的舍入假匹配。

    quoted_table 可为真实表名(已转义)或子查询 "(SELECT ...)";列名必须在其中可见。
    返回 {recommended, total, numeric, non_numeric, max_int_digits, max_frac_digits, fits_decimal38}：
    - recommended: 'BIGINT' | 'DECIMAL(38,s)' | None(有不可转行 / 超 DECIMAL(38) 容量时为 None,
      交由前端提示,不静默丢数据)。
    """
    qcol = _quote_identifier(column_name)
    # 只对【全部为纯十进制/整数文本】的列给 DECIMAL/BIGINT 推荐,标度按文本有效位精确取值:
    #  - 数字判定:TRY_CAST(v AS DOUBLE) 非空且 isfinite(排除 inf/nan——DuckDB 会把它们转成 DOUBLE);
    #  - v_plain:纯十进制/整数文本(无指数)。这类值的整数位/小数位按文本长度精确计,
    #    24-38 位大整数也不会被任何固定 DECIMAL 中间量误判;
    #  - 科学计数法等 non_plain 数值(如真实 DOUBLE 的 '4e-07' / '1e-20'):无法从文本可靠定标度,
    #    且二进制浮点量化成 DECIMAL 本就有损——一律不自动推荐(recommended=None),交用户显式选,
    #    绝不用一个可能舍入/清零的 DECIMAL 静默出结果(Codex 对抗复审:1e-20 曾被荐 BIGINT 并舍成 0)。
    stats = connection.execute(
        f"""
        WITH src AS (
            SELECT trim(CAST({qcol} AS VARCHAR)) AS v
            FROM {quoted_table}
            WHERE {qcol} IS NOT NULL AND trim(CAST({qcol} AS VARCHAR)) <> ''
        ),
        norm AS (
            SELECT
                v,
                regexp_full_match(v, '^[+-]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)$') AS v_plain,
                TRY_CAST(v AS DOUBLE) AS d
            FROM src
        )
        SELECT
            count(*) AS n,
            count(*) FILTER (WHERE d IS NOT NULL AND isfinite(d)) AS numeric_n,
            count(*) FILTER (WHERE d IS NOT NULL AND isfinite(d) AND NOT v_plain) AS non_plain_n,
            max(CASE WHEN v_plain THEN length(split_part(v, '.', 2)) ELSE 0 END) AS max_frac,
            max(CASE WHEN v_plain
                     THEN length(replace(replace(split_part(v, '.', 1), '-', ''), '+', ''))
                     ELSE 0 END) AS max_int
        FROM norm
        """
    ).fetchone()

    empty = {
        "recommended": None, "total": 0, "numeric": 0, "non_numeric": 0,
        "max_int_digits": 0, "max_frac_digits": 0, "fits_decimal38": False,
    }
    if not stats or not stats[0]:
        return empty

    total, numeric = int(stats[0]), int(stats[1])
    non_plain = int(stats[2])
    max_frac, max_int = int(stats[3] or 0), int(stats[4] or 0)
    non_numeric = total - numeric
    # 全部可转有限数字、全部是纯十进制文本(无科学计数法)、整数位+小数位 ≤ 38 才安全可 DECIMAL 化
    fits_decimal38 = (
        non_numeric == 0 and non_plain == 0 and (max_int + max_frac) <= 38
    )

    recommended: Optional[str] = None
    if fits_decimal38:
        if max_frac == 0:
            # 全整数值:≤18 位走 BIGINT(SUM 自动升 HUGEINT),更大走 DECIMAL(38,0)
            recommended = "BIGINT" if max_int <= 18 else "DECIMAL(38,0)"
        else:
            recommended = f"DECIMAL(38,{max_frac})"

    return {
        "recommended": recommended, "total": total, "numeric": numeric,
        "non_numeric": non_numeric, "max_int_digits": max_int,
        "max_frac_digits": max_frac, "fits_decimal38": fits_decimal38,
    }


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
        if "\x00" in str(col_name):
            # NUL 字节列名连引号包裹都救不了(DuckDB ParserException),
            # 跳过该列的促升,不让整表促升失败
            logger.warning(
                "promote skipped column with NUL byte in name (table %s)", table_name
            )
            continue
        if is_identifier_column_name(col_name):
            continue

        target = infer_varchar_column_promotion(connection, quoted_table, col_name)
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
