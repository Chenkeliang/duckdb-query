"""Shared SQL helpers for join-query and pivot-query routers."""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)


def remove_auto_added_limit(sql: str) -> str:
    """Remove system-added LIMIT (equals max_query_rows), keep user LIMIT."""
    from core.common.config_manager import config_manager

    try:
        max_rows = config_manager.get_app_config().max_query_rows
    except Exception:
        max_rows = 10000

    sql_cleaned = sql.rstrip("; \t\n\r")
    limit_pattern = rf"\s+LIMIT\s+{max_rows}$"

    if re.search(limit_pattern, sql_cleaned, re.IGNORECASE):
        sql_cleaned = re.sub(limit_pattern, "", sql_cleaned, flags=re.IGNORECASE)
        logger.info("Removed system-added LIMIT %s, restored user original SQL", max_rows)
    else:
        logger.info("Keeping user original SQL LIMIT clause")

    return sql_cleaned.strip()


def get_join_type_sql(join_type: str) -> str:
    """Convert frontend join type to SQL JOIN syntax."""
    join_type = join_type.lower()
    if join_type == "inner":
        return "INNER JOIN"
    if join_type == "left":
        return "LEFT JOIN"
    if join_type == "right":
        return "RIGHT JOIN"
    if join_type in ("outer", "full_outer"):
        return "FULL OUTER JOIN"
    if join_type == "cross":
        return "CROSS JOIN"
    return "INNER JOIN"


_NO_LIMIT_PATTERNS = [
    r"^DESCRIBE\b",
    r"^DESC\b",
    # SUMMARIZE 不接受 LIMIT 后缀(PIVOT/UNPIVOT 会编译成 SELECT、可以接,它不行)
    r"^SUMMARIZE\b",
    r"^SHOW\b",
    r"^EXPLAIN\b",
    r"^PRAGMA\b",
    r"^SET\b",
    r"^CREATE\b",
    r"^ALTER\b",
    r"^DROP\b",
    r"^TRUNCATE\b",
    r"^INSERT\b",
    r"^UPDATE\b",
    r"^DELETE\b",
    r"^GRANT\b",
    r"^REVOKE\b",
    r"^CALL\b",
    r"^EXECUTE\b",
    r"^USE\b",
    r"^BEGIN\b",
    r"^COMMIT\b",
    r"^ROLLBACK\b",
    # 扩展与库管理语句同样不接 LIMIT(INSTALL inet LIMIT 100 是语法错误)
    r"^INSTALL\b",
    r"^FORCE\b",  # FORCE INSTALL
    r"^LOAD\b",
    r"^ATTACH\b",
    r"^DETACH\b",
    r"^COPY\b",
    r"^EXPORT\b",
    r"^IMPORT\b",
    r"^CHECKPOINT\b",
    r"^VACUUM\b",
    r"^ANALYZE\b",
]


def statement_accepts_limit(query: str) -> bool:
    """该语句能否在末尾追加 LIMIT(SELECT/WITH 等可以;DDL/扩展管理等不行)。"""
    query_upper = query.strip().upper()
    return not any(re.match(p, query_upper) for p in _NO_LIMIT_PATTERNS)


def ensure_query_has_limit(query: str, default_limit: int = 1000) -> str:
    """Append LIMIT when missing (skip DDL/DESCRIBE/SHOW etc.)."""
    query_stripped = query.strip()

    if not statement_accepts_limit(query_stripped):
        return query

    if not re.search(r"\sLIMIT\s+\d+\s*($|;)", query, re.IGNORECASE):
        if query_stripped.endswith(";"):
            return f"{query_stripped[:-1]} LIMIT {default_limit};"
        return f"{query_stripped} LIMIT {default_limit}"
    return query
