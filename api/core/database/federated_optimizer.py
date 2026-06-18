"""联邦查询 SQL 智能下推 —— sqlglot AST 改写。

只改"顶层裸远端表引用"、幂等、bailout 保底放行。详见
docs/superpowers/specs/2026-06-18-federated-pushdown-design.md。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Optional

import sqlglot
from sqlglot import exp

logger = logging.getLogger(__name__)


@dataclass
class RemoteTarget:
    """一个可改写的顶层裸远端表引用。"""
    node: exp.Table       # sqlglot 表节点（用于 replace）
    leftmost: str         # attach 别名（catalog or db）
    name: str             # 表名
    alias: str            # SQL 中的表别名（无则用表名）


def _leftmost(t: exp.Table) -> Optional[str]:
    return t.catalog or t.db or None


def _is_top_level_bare(t: exp.Table) -> bool:
    """目标须为顶层裸表：不在任何子查询内,且父节点是 FROM 或 JOIN。"""
    if t.find_ancestor(exp.Subquery) is not None:
        return False
    return isinstance(t.parent, (exp.From, exp.Join))


def extract_remote_targets(sql: str, attach_aliases: set[str]) -> list[RemoteTarget]:
    """从 SQL 中提取可改写的顶层裸远端表（其前缀 ∈ attach_aliases）。"""
    tree = sqlglot.parse_one(sql, read="duckdb")
    out: list[RemoteTarget] = []
    for t in tree.find_all(exp.Table):
        lm = _leftmost(t)
        if lm in attach_aliases and _is_top_level_bare(t):
            out.append(RemoteTarget(node=t, leftmost=lm, name=t.name, alias=t.alias or t.name))
    return out


@dataclass
class SemiJoinPlan:
    """一条半连接下推计划：用 local 侧键集去缩 remote 侧。"""
    remote_node: exp.Table   # 要被改写的远端表节点（同一 tree 内）
    remote_alias: str
    remote_col: str
    local_table_sql: str     # 物化键的来源表 SQL（如 'local_t AS l'）
    local_col: str


def _alias_to_table(tree: exp.Expression) -> dict[str, exp.Table]:
    """SQL 中 表别名(小写) → Table 节点。"""
    m: dict[str, exp.Table] = {}
    for t in tree.find_all(exp.Table):
        key = (t.alias or t.name).lower()
        m[key] = t
    return m


def _eq_pairs(on: exp.Expression):
    """ON 里的等值对：[(左表别名,左列,右表别名,右列), …]（仅纯列=列）。"""
    pairs = []
    for eq in on.find_all(exp.EQ):
        l, r = eq.left, eq.right
        if isinstance(l, exp.Column) and isinstance(r, exp.Column):
            pairs.append((l.table.lower(), l.name, r.table.lower(), r.name))
    return pairs


def plan_semijoins(sql: str, attach_aliases: set[str], *, _tree: Optional[exp.Expression] = None) -> list[SemiJoinPlan]:
    """对每个等值 JOIN 产出 0/1 条半连接计划（v1：仅 INNER 双侧 / LEFT 右侧;另一侧必须是本地表）。

    多条件 JOIN 只取第一条可用等值（推子集仍保持结果）。每张远端表最多一条计划。
    """
    tree = _tree if _tree is not None else sqlglot.parse_one(sql, read="duckdb")
    alias_map = _alias_to_table(tree)

    def is_remote(tbl: exp.Table) -> bool:
        return (tbl.catalog or tbl.db or None) in attach_aliases

    def reducible_remote(tbl: exp.Table) -> bool:
        return is_remote(tbl) and not isinstance(tbl.parent, exp.Subquery) and tbl.find_ancestor(exp.Subquery) is None

    plans: list[SemiJoinPlan] = []
    used_remote: set[int] = set()

    for join in tree.find_all(exp.Join):
        side = (join.side or "").upper()
        kind = (join.kind or "").upper()
        on = join.args.get("on")
        if on is None or kind == "CROSS" or side == "FULL":
            continue
        for la, lc, ra, rc in _eq_pairs(on):
            lt, rt = alias_map.get(la), alias_map.get(ra)
            if lt is None or rt is None:
                continue
            cand = None
            if side in ("", "INNER") or kind == "INNER":      # INNER：任一远端侧可缩(用对侧本地键)
                if reducible_remote(lt) and not is_remote(rt):
                    cand = (lt, lc, la, rt, rc)
                elif reducible_remote(rt) and not is_remote(lt):
                    cand = (rt, rc, ra, lt, lc)
            elif side == "LEFT":   # A LEFT JOIN B：B(=join.this)非保留可缩
                if reducible_remote(rt) and not is_remote(lt):
                    cand = (rt, rc, ra, lt, lc)
            elif side == "RIGHT":  # v1 跳过 RIGHT
                cand = None
            if cand is None:
                continue
            remote_node, remote_col, remote_alias, local_node, local_col = cand
            if id(remote_node) in used_remote:
                continue
            used_remote.add(id(remote_node))
            plans.append(SemiJoinPlan(
                remote_node=remote_node, remote_alias=remote_alias, remote_col=remote_col,
                local_table_sql=local_node.sql(dialect="duckdb"), local_col=local_col,
            ))
            break  # 该 JOIN 取一条即可
    return plans
