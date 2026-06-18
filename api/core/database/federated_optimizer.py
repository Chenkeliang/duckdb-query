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
