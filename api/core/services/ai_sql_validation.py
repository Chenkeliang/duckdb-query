"""AI 子系统的 SQL 只读判定原语(供 Agent Engine / 各 Profile 复用)。

判定"是否全部为只读 SELECT"是底层能力,不属于任何单一 LLM 服务,故独立成模块。
"""

from __future__ import annotations

import duckdb


def is_select_only(sql: str) -> bool:
    """用 DuckDB 解析器判定 sql 是否全部为 SELECT(零新依赖,与导出端点同款手法)。"""
    if not sql or not sql.strip():
        return False
    parser = duckdb.connect()
    try:
        statements = parser.extract_statements(sql)
    except Exception:  # noqa: BLE001
        return False
    finally:
        parser.close()
    return bool(statements) and all(
        s.type == duckdb.StatementType.SELECT for s in statements
    )
