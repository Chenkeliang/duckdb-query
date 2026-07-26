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
from typing import Mapping, Optional, Sequence, Tuple

import sqlglot
from sqlglot import exp

logger = logging.getLogger(__name__)

# 本地目录/模式限定名的合法取值(current_database()=main_db,schema=main)
_LOCAL_QUALIFIERS = {"main", "main_db", "memory"}
# 三段名 catalog.schema.table 里,库内 schema 段的黑名单:首段已是被授权的库/别名,
# 第二段是该库内部的 schema,不能再拿"是否是授权别名"来判定(PostgreSQL 多 schema 就
# 卡在这)。改为只挡系统/元数据 schema,避免绕过限定符校验去读目录与系统表。
_DENIED_SCHEMAS = {
    "information_schema", "pg_catalog", "pg_toast",
    "mysql", "performance_schema", "sys",
}
# 环境/系统信息泄露面的标量函数
_DENIED_FUNCTIONS = {"getenv"}
# 无外部副作用的纯生成器表函数(模型做日期/数列脚手架的正当用法)
_SAFE_TABLE_FUNCTIONS = {"range", "generate_series", "unnest"}


class ScopeLimits:
    """用户在对话里选定的问数范围(None = 该来源整体放行,不逐表限制)。

    只有用户**明确勾了表**时才收紧:一张没勾 = 整个来源可问(与改动前行为一致)。
    空集与 None 语义不同——空集表示"该来源不在范围内",一张表都不放行。
    """

    __slots__ = ("local_tables", "alias_tables")

    def __init__(
        self,
        local_tables: Sequence[str] | None = None,
        alias_tables: Mapping[str, Sequence[str]] | None = None,
    ) -> None:
        self.local_tables = None if local_tables is None else {
            str(t).lower() for t in local_tables
        }
        self.alias_tables = None if alias_tables is None else {
            str(a).lower(): {str(t).lower() for t in ts} for a, ts in alias_tables.items()
        }

    def local_allowed(self, name: str) -> bool:
        return self.local_tables is None or name.lower() in self.local_tables

    def alias_allowed(self, alias: str, name: str) -> bool:
        if self.alias_tables is None:
            return True
        allowed = self.alias_tables.get(alias.lower())
        return allowed is None or name.lower() in allowed


def _scope_reason(table: exp.Table, name: str, qualifier: str, limits: ScopeLimits) -> str | None:
    """范围外的表:拒绝并点名,让模型走 refuse 请用户把表加进范围,而不是偷查。"""
    del table
    if qualifier and qualifier not in _LOCAL_QUALIFIERS:
        if not limits.alias_allowed(qualifier, name):
            return (
                f"table is outside the scope the user selected: {qualifier}.{name}"
                " — ask the user to add it to the scope instead of querying it"
            )
        return None
    if not limits.local_allowed(name):
        return (
            f"table is outside the scope the user selected: {name}"
            " — ask the user to add it to the scope instead of querying it"
        )
    return None


def _denied_reason_for_table(
    table: exp.Table, allowed: set, cte_names: set, limits: ScopeLimits
) -> str | None:
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
    catalog = str(table.catalog).lower() if table.catalog else ""
    db = str(table.db).lower() if table.db else ""
    if catalog:
        # 三段名:首段必须是本地库或本次授权的别名;第二段是该库内部的 schema,
        # 只挡系统/元数据 schema(PostgreSQL 的 public 等业务 schema 照常放行)。
        if catalog not in allowed:
            return f"unauthorized database qualifier: {catalog}"
        if db in _DENIED_SCHEMAS:
            return f"system schema is not allowed: {db}"
    elif db and db not in allowed:
        # 两段名:限定符要么是本地目录/模式,要么是授权别名
        return f"unauthorized database qualifier: {db}"
    # 授权通过后再看用户选定的范围:别名取三段名的首段,否则取两段名的限定符
    return _scope_reason(table, name, catalog or db, limits)


def check_sql(
    sql: str,
    authorized_aliases: Sequence[str],
    limits: Optional[ScopeLimits] = None,
) -> Tuple[bool, str]:
    """返回 (allowed, reason)。任何不确定形态一律拒绝(fail-closed)。

    limits 为用户选定的问数范围(默认 None = 不逐表限制,与改动前一致)。
    """
    allowed = _LOCAL_QUALIFIERS | {str(a).lower() for a in authorized_aliases}
    limits = limits or ScopeLimits()
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
        reason = _denied_reason_for_table(table, allowed, cte_names, limits)
        if reason:
            return False, reason

    for func in tree.find_all(exp.Anonymous):
        if str(func.name).lower() in _DENIED_FUNCTIONS:
            return False, f"function is not allowed: {func.name}"
    for func in tree.find_all(exp.Func):
        if func.__class__.__name__.lower() in _DENIED_FUNCTIONS:
            return False, f"function is not allowed: {func.__class__.__name__}"

    return True, "ok"
