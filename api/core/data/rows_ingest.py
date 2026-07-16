"""行数据 → DuckDB 的统一入库原语（无 DataFrame 中间层）。

v1.2.1 去 pandas：粘贴导入、Excel 原生行迭代、编码转码兜底等所有
"先拿到 Python 行数据再入库"的路径共用此原语——行数据落成 UTF-8 临时
CSV，由 DuckDB read_csv 以全 VARCHAR 忠实读入临时表（与摄取精度铁律的
"先忠实读入为文本，再做可证无损的类型促升"一致），后续 CREATE TABLE AS
SELECT / 促升引擎照常工作。相比逐行 executemany，大行集走 DuckDB 的
向量化 CSV 读取器。
"""

from __future__ import annotations

import csv
import logging
import math
import os
import tempfile
from decimal import Decimal
from typing import Any, Callable, Iterable, List, Sequence, Tuple
from uuid import uuid4

logger = logging.getLogger(__name__)


def _cell_text(value: Any) -> str:
    """单元格 → 文本。None/纯空白 → 空字段（不加引号 → 读回 NULL）。

    str() 即"忠实文本"：bool → 'True'/'False'、Decimal/日期保持原样字面量，
    与摄取铁律的 all_varchar 读入口径一致。两个例外：
    - float 的 str() 对极小/极大值给科学计数法（2.3e-05），促升引擎认不出
      会整列滞留 VARCHAR——展开成纯十进制文本（Decimal 精确展开，不引入
      新的舍入）;
    - 纯空白单元格清成 NULL（对齐旧 cell_to_literal 语义）：append 到已
      建类型表的裸 INSERT 无 TRY_CAST 兜底，'   ' 会让整批失败。
    """
    if value is None:
        return ""
    if isinstance(value, float):
        if not math.isfinite(value):
            return ""
        return format(Decimal(str(value)), "f")
    text = str(value)
    if not text.strip():
        return ""
    return text


def load_rows_as_varchar_table(
    connection: Any,
    header: Sequence[str],
    rows: Iterable[Sequence[Any]],
) -> Tuple[str, Callable[[], None]]:
    """把 (header, rows) 读入全 VARCHAR 的 DuckDB 临时表。

    返回 (临时表名, cleanup)。cleanup 负责删临时表与临时文件，调用方在
    finally 里调用；临时表名已做随机化，可直接内插进 SQL（仍建议引号包裹）。
    空字段（None/空串）读回 NULL——与 pandas 路径的 NaN→NULL 口径一致。
    """
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", newline="", suffix=".csv", delete=False
    ) as tmp:
        tmp_path = tmp.name
        writer = csv.writer(tmp, quoting=csv.QUOTE_MINIMAL)
        writer.writerow([str(name) for name in header])
        for row in rows:
            writer.writerow([_cell_text(value) for value in row])

    table_name = f"rows_src_{uuid4().hex[:8]}"
    try:
        connection.execute(
            f'CREATE TEMP TABLE "{table_name}" AS '
            "SELECT * FROM read_csv(?, all_varchar=true, header=true, "
            "delim=',', quote='\"', escape='\"', "
            "sample_size=-1, strict_mode=false)",
            [tmp_path],
        )
    except Exception:
        _remove_quietly(tmp_path)
        raise

    def cleanup() -> None:
        try:
            connection.execute(f'DROP TABLE IF EXISTS "{table_name}"')
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.debug("drop temp rows table %s failed: %s", table_name, exc)
        _remove_quietly(tmp_path)

    return table_name, cleanup


def _remove_quietly(path: str) -> None:
    try:
        os.remove(path)
    except OSError as exc:
        logger.debug("remove temp csv %s failed: %s", path, exc)


def fetch_rows(connection: Any, sql: str) -> Tuple[List[str], List[tuple]]:
    """轻量取行：返回 (列名, 行元组列表)。摄取层预览等内部用途。"""
    res = connection.execute(sql)
    names = [str(col[0]) for col in (res.description or [])]
    return names, res.fetchall()
