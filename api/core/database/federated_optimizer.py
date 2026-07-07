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

from core.database.federated_time_bound import detect_time_bound_candidates, default_time_bound_value

logger = logging.getLogger(__name__)


def _leftmost(t: exp.Table) -> Optional[str]:
    return t.catalog or t.db or None


def _is_top_level_bare(t: exp.Table) -> bool:
    """目标须为顶层裸表：不在任何子查询内,且父节点是 FROM 或 JOIN。"""
    if t.find_ancestor(exp.Subquery) is not None:
        return False
    return isinstance(t.parent, (exp.From, exp.Join))


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
    """ON 顶层 AND 链上的等值对：[(左表别名,左列,右表别名,右列), …]（仅纯列=列）。

    只收集经纯 AND 可达的 EQ：处于 OR/NOT 等其它布尔结构之下的等值不是
    JOIN 匹配的必要条件，据其下推 IN 过滤会静默丢掉走另一分支匹配的行
    （如 ON l.id=r.k OR l.alt=r.k，按 l.id 下推会滤掉仅由 l.alt 匹配的行）。
    """
    pairs = []
    stack = [on]
    while stack:
        node = stack.pop()
        if isinstance(node, exp.And):
            stack.extend((node.left, node.right))
        elif isinstance(node, exp.Paren):
            stack.append(node.this)
        elif isinstance(node, exp.EQ):
            l, r = node.left, node.right
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
            elif side == "LEFT":
                # A LEFT JOIN B ON …：仅 B(=join.this,非保留侧)可缩。
                # ON 操作数顺序任意,必须用 join.this 认非保留侧,不能靠 eq 左右位置。
                np_alias = (join.this.alias or join.this.name).lower()
                if ra == np_alias and reducible_remote(rt) and not is_remote(lt):
                    cand = (rt, rc, ra, lt, lc)
                elif la == np_alias and reducible_remote(lt) and not is_remote(rt):
                    cand = (lt, lc, la, rt, rc)
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


KeyProvider = Callable[[str, str, int], Optional[list]]


def apply_semijoin_pushdown(
    sql: str,
    attach_aliases: set[str],
    *,
    key_provider: KeyProvider,
    threshold: int,
    _tree: Optional[exp.Expression] = None,
) -> tuple[str, list[dict]]:
    """把合格半连接改写进 SQL；返回 (改写后 SQL, reports)。任何解析失败 → 原样返回。

    注意:下推命中时会原地改写 _tree,调用方传入共享树后不得再复用它做只读分析。
    """
    try:
        tree = _tree if _tree is not None else sqlglot.parse_one(sql, read="duckdb")
    except Exception as exc:  # noqa: BLE001
        logger.info("federated optimize: parse failed, passthrough: %s", exc)
        return sql, [{"error": "parse_failed", "pushed": False}]

    # 采样子句经 sqlglot 往返会被排到 LIMIT 之后（DuckDB 要求 USING SAMPLE 在 LIMIT 前，
    # 重排后是语法错误），且对采样查询做半连接下推意义有限：静默放行不优化。
    # 用 AST 判定而非文本正则——字符串字面量/注释里出现关键字不应误伤可下推的查询
    if tree.find(exp.TableSample) is not None:
        return sql, []

    try:
        plans = plan_semijoins(sql, attach_aliases, _tree=tree)
        reports: list[dict] = []
        pushed_any = False
        for p in plans:
            keys = key_provider(p.local_table_sql, p.local_col, threshold)
            if not keys:  # None 或空 → 不下推
                reports.append({"table": p.remote_node.name, "pushed": False, "reason": "over_threshold_or_empty"})
                continue
            in_expr = exp.In(
                this=exp.column(p.remote_col),
                expressions=[exp.convert(v) for v in keys],
            )
            inner = exp.select("*").from_(p.remote_node.copy()).where(in_expr)
            subq = exp.Subquery(this=inner, alias=exp.TableAlias(this=exp.to_identifier(p.remote_alias)))
            p.remote_node.replace(subq)
            pushed_any = True
            reports.append({"table": subq.this.args["from_"].sql(), "pushed": True, "keys": len(keys)})
        # 没有实际改写时必须返回原 SQL 字符串：sqlglot 重新生成(tree.sql)会改变
        # DuckDB 特有从句的顺序/写法，无改写却往返一遍纯属引入风险
        if not pushed_any:
            return sql, reports
        return tree.sql(dialect="duckdb"), reports
    except Exception as exc:  # noqa: BLE001 —— 改写阶段任何异常都保底放行
        logger.warning("federated optimize: rewrite failed, passthrough: %s", exc)
        return sql, [{"error": "rewrite_failed", "pushed": False}]


SchemaProvider = Callable[[str], list]


def _columns_with_time_predicate(tree: exp.Expression) -> set[tuple[str, str]]:
    """已写了范围类时间谓词的 (表别名小写, 列名小写) 集合（粗判:列出现在比较里即视为已设界）。"""
    out: set[tuple[str, str]] = set()
    for cmp_cls in (exp.GTE, exp.GT, exp.LT, exp.LTE, exp.Between, exp.EQ):
        for node in tree.find_all(cmp_cls):
            for col in node.find_all(exp.Column):
                out.add((col.table.lower(), col.name.lower()))
    return out


def build_time_bound_suggestions(
    sql: str,
    attach_aliases: set[str],
    *,
    schema_provider: SchemaProvider,
    days: int = 30,
    _tree: Optional[exp.Expression] = None,
) -> list[dict]:
    """远端表有审计时间列且 SQL 未对它设时间谓词 → 产出建议（不改 SQL）。解析失败 → []。

    只读遍历,不改树;共享 _tree 时必须在下推改写之前调用。
    """
    try:
        tree = _tree if _tree is not None else sqlglot.parse_one(sql, read="duckdb")
    except Exception:  # noqa: BLE001
        return []
    bounded = _columns_with_time_predicate(tree)
    suggestions: list[dict] = []
    seen: set[str] = set()
    for t in tree.find_all(exp.Table):
        lm = t.catalog or t.db or None
        if lm not in attach_aliases or not _is_top_level_bare(t):
            continue
        ref = ".".join(p for p in (t.catalog, t.db, t.name) if p)
        if ref in seen:
            continue
        seen.add(ref)
        cands = detect_time_bound_candidates(schema_provider(ref))
        alias = (t.alias or t.name).lower()
        cands = [c for c in cands
                 if (alias, c.lower()) not in bounded and ("", c.lower()) not in bounded]
        if not cands:
            continue
        col = cands[0]
        suggestions.append({
            "type": "time_bound",
            "table": ref,
            "column": col,
            "hint": (f"该表有审计列 {col} 且无时间过滤;加 WHERE {alias}.{col} >= "
                     f"'{default_time_bound_value(days=days)}' 可大幅减少远端扫描"),
        })
    return suggestions


def _make_key_provider(conn):
    def provider(local_table_sql: str, col: str, limit: int):
        q = (f'SELECT DISTINCT "{col}" FROM {local_table_sql} '
             f'WHERE "{col}" IS NOT NULL LIMIT {int(limit) + 1}')
        rows = conn.execute(q).fetchall()
        if len(rows) > limit:
            return None                       # 超阈值 → 跳过
        return [r[0] for r in rows]
    return provider


def _make_schema_provider(conn):
    def provider(remote_ref: str):
        rows = conn.execute(f"DESCRIBE {remote_ref}").fetchall()
        # DuckDB DESCRIBE: (column_name, column_type, null, key, default, extra)
        return [{"name": r[0], "type": r[1]} for r in rows]
    return provider


def optimize_federated_sql(conn, sql: str, attach_aliases: set[str], cfg) -> tuple[str, list[dict], list[dict]]:
    """主入口（已 ATTACH 的连接内调用）。返回 (优化后 SQL, suggestions, warnings)。

    全程 bailout：任何异常 → 返回原 SQL。优化保持结果;时间界仅作建议不改 SQL。
    """
    if not attach_aliases:
        return sql, [], []
    # 单次 parse,两阶段共用;解析失败整体放行(保持原有 parse_failed 告警形状)
    try:
        tree = sqlglot.parse_one(sql, read="duckdb")
    except Exception as exc:  # noqa: BLE001
        logger.info("federated optimize: parse failed, passthrough: %s", exc)
        return sql, [], [{"error": "parse_failed", "pushed": False}]
    # 采样查询两阶段都跳过:下推有重排风险,建议阶段的 DESCRIBE 远端 I/O 对已采样的查询纯属浪费
    if tree.find(exp.TableSample) is not None:
        return sql, [], []
    threshold = int(getattr(cfg, "federated_semijoin_threshold", 10000))
    # 建议先算:只读遍历;下推命中会原地改写树,顺序不能颠倒
    suggestions: list[dict] = []
    try:
        suggestions = build_time_bound_suggestions(
            sql, attach_aliases, schema_provider=_make_schema_provider(conn), _tree=tree)
    except Exception as exc:  # noqa: BLE001
        logger.info("time-bound suggestion skipped: %s", exc)
    warnings: list[dict] = []
    out_sql = sql
    try:
        out_sql, reports = apply_semijoin_pushdown(
            sql, attach_aliases, key_provider=_make_key_provider(conn),
            threshold=threshold, _tree=tree)
        warnings.extend(r for r in reports if r.get("error") or r.get("pushed") is False)
    except Exception as exc:  # noqa: BLE001
        logger.warning("federated optimize bailout: %s", exc)
        out_sql = sql
    return out_sql, suggestions, warnings
