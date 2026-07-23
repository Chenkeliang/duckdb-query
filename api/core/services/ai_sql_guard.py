"""Agent run_query 的授权闸(sqlglot AST,fail-closed)。

这是承重墙:引擎级沙箱在共享池上不可行——enable_external_access 是库实例级
设置且运行期关闭后不可重开,同进程也无法对 main.db 开第二个连接/ATTACH
(unique file handle conflict,2026-07-23 实证),因此文件/URL/系统面的所有
边界只能在这里强制。威胁模型:被样例数据注入的模型,不是本机用户(用户在
编辑器本可执行任意 SQL)。

分层(调用方顺序):L1 _is_select_only(语句类型) → L2 本闸 → L3 EXPLAIN。
本闸规则:
- 单语句;拒 PRAGMA(1.5.3 中 PRAGMA 语句类型是 SELECT,L1 拦不住)
- 表引用的 this 必须是纯 Identifier —— 统杀 read_csv/read_parquet/glob/
  pragma_database_list 等一切表函数(含 CTE/JOIN 深处)
- 拒标识符含 "/"、"\\"、"://"(文件路径与 URL 的 FROM 'x.csv' 形态)
- 限定名(catalog/db)必须落在 本地目录 ∪ 授权别名;表名 system_ 前缀拒绝
- 标量函数黑名单(getenv 等环境泄露面)
- sqlglot 解析失败一律拒绝
"""

from __future__ import annotations

import logging
from typing import Sequence, Tuple

import sqlglot
from sqlglot import exp

logger = logging.getLogger(__name__)

# 本地目录/模式限定名的合法取值(current_database()=main_db,schema=main)
_LOCAL_QUALIFIERS = {"main", "main_db", "memory"}
# 环境/系统信息泄露面的标量函数
_DENIED_FUNCTIONS = {"getenv"}
# 无外部副作用的纯生成器表函数(模型做日期/数列脚手架的正当用法)
_SAFE_TABLE_FUNCTIONS = {"range", "generate_series", "unnest"}


def _denied_reason_for_table(table: exp.Table, allowed: set, cte_names: set) -> str | None:
    this = table.this
    if this is None or not isinstance(this, exp.Identifier):
        func_name = ""
        if isinstance(this, exp.Anonymous):
            func_name = str(this.name).lower()
        elif isinstance(this, exp.Func):
            func_name = this.sql_name().lower() if hasattr(this, "sql_name") else ""
        if func_name in _SAFE_TABLE_FUNCTIONS:
            return None
        # ReadCSV/ReadParquet/Anonymous/Literal 等一切非普通标识符的 FROM 目标
        return f"table function or non-identifier relation is not allowed: {table.sql()[:80]}"
    name = str(this.name)
    if name in cte_names and not table.db and not table.catalog:
        return None  # CTE 引用
    if "/" in name or "\\" in name or "://" in name:
        return f"file path or URL relation is not allowed: {name[:80]}"
    if name.lower().startswith("system_"):
        return f"system table is not allowed: {name[:80]}"
    for qualifier in (table.catalog, table.db):
        q = str(qualifier).lower() if qualifier else ""
        if q and q not in allowed:
            return f"unauthorized database qualifier: {q}"
    return None


def check_sql(sql: str, authorized_aliases: Sequence[str]) -> Tuple[bool, str]:
    """返回 (allowed, reason)。任何不确定形态一律拒绝(fail-closed)。"""
    allowed = _LOCAL_QUALIFIERS | {str(a).lower() for a in authorized_aliases}
    try:
        statements = sqlglot.parse(sql, read="duckdb")
    except Exception as exc:  # noqa: BLE001  解析失败 = 不可审计 = 拒绝
        return False, f"unparseable SQL rejected: {str(exc)[:120]}"
    statements = [s for s in statements if s is not None]
    if len(statements) != 1:
        return False, f"exactly one statement required, got {len(statements)}"
    tree = statements[0]

    if tree.find(exp.Pragma) is not None:
        return False, "PRAGMA is not allowed"
    if tree.find(exp.Command) is not None:
        return False, "command statement is not allowed"

    cte_names = {str(cte.alias) for cte in tree.find_all(exp.CTE) if cte.alias}

    for table in tree.find_all(exp.Table):
        reason = _denied_reason_for_table(table, allowed, cte_names)
        if reason:
            return False, reason

    for func in tree.find_all(exp.Anonymous):
        if str(func.name).lower() in _DENIED_FUNCTIONS:
            return False, f"function is not allowed: {func.name}"
    for func in tree.find_all(exp.Func):
        if func.__class__.__name__.lower() in _DENIED_FUNCTIONS:
            return False, f"function is not allowed: {func.__class__.__name__}"

    return True, "ok"
