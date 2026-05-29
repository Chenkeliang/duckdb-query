"""DuckDB 查询耗时日志与可选自动 EXPLAIN。"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

DEFAULT_SLOW_WARN_MS = 1000


def log_query_duration(
    connection: Any,
    sql: str,
    elapsed_ms: float,
    row_count: int,
    *,
    slow_warn_ms: int = DEFAULT_SLOW_WARN_MS,
    explain_threshold_ms: int = 0,
    log: Optional[logging.Logger] = None,
) -> None:
    """
    记录慢查询警告；超过 explain_threshold_ms 时在日志中输出 EXPLAIN 计划。
    """
    active_logger = log or logger

    if elapsed_ms >= slow_warn_ms:
        active_logger.warning(
            "Slow query detected: %.2fms elapsed, %d rows returned",
            elapsed_ms,
            row_count,
        )
    else:
        active_logger.debug(
            "Query completed: %.2fms, %d rows returned", elapsed_ms, row_count
        )

    threshold = max(explain_threshold_ms or 0, 0)
    if threshold and elapsed_ms >= threshold:
        try:
            plan_rows = connection.execute(f"EXPLAIN {sql}").fetchall()
            plan_text = "\n".join(str(row[0]) for row in plan_rows)
            active_logger.warning("Slow query execution plan:\n%s", plan_text)
        except Exception as explain_error:
            active_logger.debug("Failed to generate execution plan: %s", explain_error)
