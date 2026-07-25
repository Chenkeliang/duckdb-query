"""AI 子系统的 SQL 只读判定原语(供 Agent Engine / 各 Profile 复用)。

判定"是否全部为只读 SELECT"是底层能力,不属于任何单一 LLM 服务,故独立成模块。
"""

from __future__ import annotations

import duckdb


def normalize_sql(sql: str) -> str:
    """规范化 SQL 供"是否本次真跑过"匹配:仅去首尾空白 + 尾分号,**内部字符严格保留**。

    绝不折叠内部空白——否则字符串字面量/注释里的空白会被抹平,导致
    `SELECT 'a  b'` 与 `SELECT 'a b'` 规范化相同,从而绕过"执行 A、回答 B"防线。
    用于 data_qa grounding 门控:final.result.sql 规范化后必须严格命中本次 run 成功执行过
    的某条 run_query(同样规范化)。宁可让模型多跑一次,也不能错误放行。
    """
    if not sql:
        return ""
    return sql.strip().rstrip(";").strip()


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
