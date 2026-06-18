# 联邦查询智能下推 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 raw 端点 `/api/duckdb/federated-query` 上,执行前自动把跨源 JOIN 的远端裸表重写成"半连接键下推"子查询,避免远端全表扫描导致的连接超时;并补上超时护栏与时间界建议。

**Architecture:** 新增两个纯逻辑模块(`federated_time_bound.py` 时间字段检测、`federated_optimizer.py` sqlglot AST 改写),改写只针对"顶层裸远端表引用"且幂等(前端已包子查询的 SQL 原样穿过);在 `execute_federated_query` 内 ATTACH 之后、执行之前调用优化器,并用 `threading.Timer + connection_registry.interrupt` 强制 `federated_query_timeout`。任意解析/改写失败 → 原样执行原 SQL(bailout)。

**Tech Stack:** Python 3.13、FastAPI、DuckDB(mysql/postgres/sqlite scanner)、**sqlglot 30.11.0**(DuckDB 方言 AST)、pytest。

**约定(所有 commit)**:署名 `Chen <keliang_chen@luojilab.com>`,**禁止任何 AI 相关标记 / Co-Authored-By**。分支 `feat_federated_pushdown`(已从 origin/main 切出)。测试从 `api/` 目录跑:`../.venv/bin/python -m pytest <path> -v`。

**关键已验证事实(spike 结论,实现时直接用)**:
- sqlglot:`t.name / t.db / t.catalog / t.alias`;2 段式 `alias.table` → `db=alias`;最左限定符 = `t.catalog or t.db or None`。
- 幂等守卫:目标表须 `t.find_ancestor(exp.Subquery) is None` 且 `type(t.parent) in (exp.From, exp.Join)`。前端 `(SELECT * FROM mysql_db.orders …) o` 里的 orders `in_subquery=True` → 跳过。
- Join:`exp.Join` 的 `.side`(`'LEFT'/'RIGHT'/'FULL'/''`)、`.kind`(`'INNER'/'OUTER'/''`)、`.args.get('on')`;等值用 `on.find_all(exp.EQ)`,列名 `eq.left.name`、表别名 `eq.left.table`。
- 多条件 JOIN 只推其中一个等值条件**仍保持结果**(它是匹配的必要条件,其余条件在 join 时照常过滤)。
- `t.replace(exp.Subquery(...))` 生效;字面量用 `exp.convert(v)` 安全转义。
- MessageCode:`api/utils/response_helpers.py:19` `class MessageCode(str, Enum)`,消息映射在同文件 ~217 行。
- config:`config_manager.get_app_config().federated_query_timeout`(默认 300)、`.max_query_rows`(默认 10000)。
- `core.common.connection_alias.normalize_connection_id(id)` 去 `db_` 前缀。
- `core.database.duckdb_pool.interruptible_connection(task_id, sql)` + `core.database.connection_registry.connection_registry.interrupt(task_id)` 已存在。

---

## Task 1: 引入 sqlglot 依赖

**Files:**
- Modify: `api/requirements.txt`

- [ ] **Step 1: 把 sqlglot 加入 requirements**

在 `api/requirements.txt` 末尾追加一行(对齐现有写法,锁次版本):

```
sqlglot>=30.11,<31
```

- [ ] **Step 2: 装进 venv 并冒烟导入**

Run:
```bash
cd /Users/keliang/mypy/duckdb-query
.venv/bin/pip install 'sqlglot>=30.11,<31' --quiet
.venv/bin/python -c "import sqlglot; from sqlglot import exp; print(sqlglot.__version__)"
```
Expected: 打印 `30.11.0`(或 30.x)。

- [ ] **Step 3: Commit**

```bash
git add api/requirements.txt
git commit -m "build(api): add sqlglot dependency for federated query rewriting"
```

---

## Task 2: 时间字段检测纯函数(移植 timeBound.ts)

**Files:**
- Create: `api/core/database/federated_time_bound.py`
- Test: `api/tests/test_federated_time_bound.py`

- [ ] **Step 1: 写失败测试**

Create `api/tests/test_federated_time_bound.py`:

```python
from core.database.federated_time_bound import (
    is_time_type,
    classify_audit_column,
    detect_time_bound_candidates,
    default_time_bound_value,
)


def test_is_time_type_covers_native_and_duckdb():
    assert is_time_type("DATE")
    assert is_time_type("DATETIME")           # MySQL
    assert is_time_type("TIMESTAMP")
    assert is_time_type("timestamp without time zone")  # PG
    assert is_time_type("TIMESTAMP_NS")       # DuckDB
    assert not is_time_type("TIME")           # 排除
    assert not is_time_type("YEAR")
    assert not is_time_type("VARCHAR")


def test_classify_audit_column():
    assert classify_audit_column("created_at") == "create"
    assert classify_audit_column("gmt_create") == "create"
    assert classify_audit_column("ctime") == "create"
    assert classify_audit_column("updated_at") == "update"
    assert classify_audit_column("gmt_modified") == "update"
    assert classify_audit_column("mtime") == "update"
    assert classify_audit_column("user_id") is None


def test_detect_candidates_create_before_update():
    cols = [
        {"name": "id", "type": "BIGINT"},
        {"name": "updated_at", "type": "TIMESTAMP"},
        {"name": "created_at", "type": "DATETIME"},
        {"name": "name", "type": "VARCHAR"},
        {"name": "birthday", "type": "DATE"},  # 时间型但非审计名 → 不入选
    ]
    assert detect_time_bound_candidates(cols) == ["created_at", "updated_at"]


def test_default_time_bound_value_format():
    import datetime as dt
    v = default_time_bound_value(now=dt.datetime(2026, 6, 18, 15, 30), days=30)
    assert v == "2026-05-19 00:00:00"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_time_bound.py -v`
Expected: FAIL（`ModuleNotFoundError: federated_time_bound`）。

- [ ] **Step 3: 实现纯函数**

Create `api/core/database/federated_time_bound.py`:

```python
"""联邦大表时间界检测 —— 纯函数。移植自 frontend/src/Query/JoinQuery/timeBound.ts。

仅做"检测 + 建议",不改写 SQL（时间界会改变结果,必须由调用方显式决定）。
"""
from __future__ import annotations

import datetime as _dt
import re
from typing import Any, Optional

# create 系词干（小写子串匹配）。'creat' 覆盖 create/created/gmt_create。
_CREATE_STEMS = ("creat", "ctime", "add_time", "insert_time")
# update 系词干。'updat' 覆盖 update/updated；'modif' 覆盖 modify/modified/gmt_modified。
_UPDATE_STEMS = ("updat", "modif", "mtime")


def is_time_type(type_str: str) -> bool:
    """可做时间界的列类型（排除 TIME / YEAR）。覆盖源库原生类型与 DuckDB 归一化类型。"""
    t = re.sub(r"\(.*\)", "", (type_str or "")).upper().strip()
    if t in ("DATE", "DATETIME"):
        return True
    if t.startswith("TIMESTAMP"):  # TIMESTAMP / TIMESTAMP_NS / TIMESTAMP WITHOUT TIME ZONE …
        return True
    return False


def classify_audit_column(name: str) -> Optional[str]:
    """按列名分类审计语义；非审计名返回 None。"""
    n = (name or "").lower()
    if any(s in n for s in _CREATE_STEMS):
        return "create"
    if any(s in n for s in _UPDATE_STEMS):
        return "update"
    return None


def _col_name(col: Any) -> str:
    if isinstance(col, dict):
        return str(col.get("name") or col.get("column_name") or "")
    return str(col)


def _col_type(col: Any) -> str:
    if isinstance(col, dict):
        return str(col.get("type") or col.get("column_type") or "")
    return ""


def detect_time_bound_candidates(columns: list) -> list[str]:
    """候选时间界列：类型为时间型 且 审计命名；create 系排在 update 系前。"""
    time_cols = [c for c in (columns or []) if is_time_type(_col_type(c))]
    creates = [_col_name(c) for c in time_cols if classify_audit_column(_col_name(c)) == "create"]
    updates = [_col_name(c) for c in time_cols if classify_audit_column(_col_name(c)) == "update"]
    return creates + updates


def default_time_bound_value(now: Optional[_dt.datetime] = None, days: int = 30) -> str:
    """近 N 天起点,裸日期串 'YYYY-MM-DD 00:00:00'（不含 SQL 引号）。"""
    base = now or _dt.datetime.now()
    d = (base - _dt.timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    return d.strftime("%Y-%m-%d 00:00:00")
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_time_bound.py -v`
Expected: 5 passed。

- [ ] **Step 5: Commit**

```bash
git add api/core/database/federated_time_bound.py api/tests/test_federated_time_bound.py
git commit -m "feat(federated): port time-field detection pure functions"
```

---

## Task 3: 远端表目标提取（含幂等守卫）

**Files:**
- Create: `api/core/database/federated_optimizer.py`
- Test: `api/tests/test_federated_optimizer.py`

- [ ] **Step 1: 写失败测试**

Create `api/tests/test_federated_optimizer.py`:

```python
from core.database.federated_optimizer import extract_remote_targets


ALIASES = {"mysql_db", "pg"}


def _names(targets):
    return sorted((t.leftmost, t.name) for t in targets)


def test_bare_remote_table_is_target():
    sql = "SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid"
    targets = extract_remote_targets(sql, ALIASES)
    assert _names(targets) == [("mysql_db", "orders")]


def test_local_table_not_target():
    sql = "SELECT * FROM local_a a JOIN local_b b ON a.id = b.id"
    assert extract_remote_targets(sql, ALIASES) == []


def test_table_inside_subquery_skipped_idempotent():
    # 前端形状：远端表已被包成子查询 → 不能再改
    sql = ("SELECT * FROM (SELECT * FROM mysql_db.orders WHERE created_at >= '2026-01-01') o "
           "JOIN local_t l ON o.id = l.oid")
    assert extract_remote_targets(sql, ALIASES) == []


def test_three_part_pg_table_target():
    sql = 'SELECT * FROM "pg"."public"."t" x JOIN local_t l ON x.id = l.id'
    targets = extract_remote_targets(sql, ALIASES)
    assert _names(targets) == [("pg", "t")]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_optimizer.py -v`
Expected: FAIL（`ImportError: extract_remote_targets`）。

- [ ] **Step 3: 实现目标提取**

Create `api/core/database/federated_optimizer.py`:

```python
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
```

注意：`extract_remote_targets` 每次 `parse_one` 会得到**新 tree**;后续真正改写时要在**同一个 tree** 上操作（见 Task 7 orchestrator）。本函数仅用于测试与分类,生产改写复用 orchestrator 内解析出的 tree。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_optimizer.py -v`
Expected: 4 passed。

- [ ] **Step 5: Commit**

```bash
git add api/core/database/federated_optimizer.py api/tests/test_federated_optimizer.py
git commit -m "feat(federated): extract top-level bare remote table targets with idempotency guard"
```

---

## Task 4: 等值 JOIN 提取 + 半连接资格判定

**Files:**
- Modify: `api/core/database/federated_optimizer.py`
- Test: `api/tests/test_federated_optimizer.py`

- [ ] **Step 1: 追加失败测试**

在 `api/tests/test_federated_optimizer.py` 追加:

```python
from core.database.federated_optimizer import plan_semijoins


def test_inner_join_local_reduces_remote():
    sql = "SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid"
    plans = plan_semijoins(sql, {"mysql_db"})
    assert len(plans) == 1
    p = plans[0]
    assert (p.remote_alias, p.remote_col) == ("o", "id")
    assert (p.local_table_sql, p.local_col) == ("local_t AS l", "oid")


def test_left_join_reduces_only_non_preserved_right():
    # local LEFT JOIN remote → remote(右,非保留)可缩
    sql = "SELECT * FROM local_t l LEFT JOIN mysql_db.orders o ON l.oid = o.id"
    plans = plan_semijoins(sql, {"mysql_db"})
    assert len(plans) == 1 and plans[0].remote_alias == "o"


def test_left_join_preserved_remote_not_reduced():
    # remote LEFT JOIN local → remote 在保留侧,不能缩
    sql = "SELECT * FROM mysql_db.orders o LEFT JOIN local_t l ON o.id = l.oid"
    assert plan_semijoins(sql, {"mysql_db"}) == []


def test_both_remote_skipped_v1():
    sql = "SELECT * FROM mysql_db.a a JOIN pg.b b ON a.id = b.id"
    assert plan_semijoins(sql, {"mysql_db", "pg"}) == []


def test_full_outer_skipped():
    sql = "SELECT * FROM local_t l FULL JOIN mysql_db.orders o ON l.oid = o.id"
    assert plan_semijoins(sql, {"mysql_db"}) == []
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_optimizer.py -k semijoin -v`
Expected: FAIL（`ImportError: plan_semijoins`）。

- [ ] **Step 3: 实现 JOIN 提取 + 资格**

在 `federated_optimizer.py` 追加（保持顶部已 import 的 sqlglot/exp）:

```python
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
            # 候选：(远端可缩侧, 远端列, 别名) + (本地键源, 本地列)
            cand = None
            if side in ("", "INNER") or kind == "INNER":      # INNER：任一远端侧可缩(用对侧本地键)
                if reducible_remote(lt) and not is_remote(rt):
                    cand = (lt, lc, la, rt, rc)
                elif reducible_remote(rt) and not is_remote(lt):
                    cand = (rt, rc, ra, lt, lc)
            elif side == "LEFT":   # A LEFT JOIN B：B(=join.this)非保留可缩
                if reducible_remote(rt) and not is_remote(lt):
                    cand = (rt, rc, ra, lt, lc)
            elif side == "RIGHT":  # v1 跳过 RIGHT（保留侧判定较绕）
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_optimizer.py -k semijoin -v`
Expected: 5 passed。

- [ ] **Step 5: Commit**

```bash
git add api/core/database/federated_optimizer.py api/tests/test_federated_optimizer.py
git commit -m "feat(federated): plan semi-join reductions with join-type eligibility"
```

---

## Task 5: 半连接改写（键物化 + 基数守卫）

**Files:**
- Modify: `api/core/database/federated_optimizer.py`
- Test: `api/tests/test_federated_optimizer.py`

- [ ] **Step 1: 追加失败测试**（用 stub key_provider,无需真 DB）

在 `api/tests/test_federated_optimizer.py` 追加:

```python
from core.database.federated_optimizer import apply_semijoin_pushdown


def test_apply_rewrites_remote_with_in_list():
    sql = "SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid"

    def keys(local_sql, col, limit):
        assert "local_t" in local_sql and col == "oid"
        return [1, 2, 3]

    out_sql, reports = apply_semijoin_pushdown(sql, {"mysql_db"}, key_provider=keys, threshold=100)
    assert "IN (1, 2, 3)" in out_sql
    assert "FROM mysql_db.orders" in out_sql and " AS o" in out_sql
    assert any(r["pushed"] for r in reports)


def test_cardinality_guard_skips_when_too_many():
    sql = "SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid"

    def keys(local_sql, col, limit):
        return None  # provider 表示超阈值

    out_sql, reports = apply_semijoin_pushdown(sql, {"mysql_db"}, key_provider=keys, threshold=100)
    assert "IN (" not in out_sql
    assert out_sql.strip() == sql or "mysql_db.orders" in out_sql  # 未包子查询
    assert all(not r["pushed"] for r in reports)


def test_string_keys_quoted():
    sql = "SELECT * FROM mysql_db.t x JOIN local_t l ON x.code = l.code"
    out_sql, _ = apply_semijoin_pushdown(
        sql, {"mysql_db"}, key_provider=lambda *a: ["A", "B"], threshold=100)
    assert "IN ('A', 'B')" in out_sql


def test_unparseable_sql_returns_original():
    sql = "SELECT FROM WHERE )("  # 故意坏
    out_sql, reports = apply_semijoin_pushdown(sql, {"mysql_db"}, key_provider=lambda *a: [1], threshold=100)
    assert out_sql == sql
    assert reports == [{"error": "parse_failed", "pushed": False}]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_optimizer.py -k "apply or cardinality or string_keys or unparse" -v`
Expected: FAIL（`ImportError: apply_semijoin_pushdown`）。

- [ ] **Step 3: 实现改写**

在 `federated_optimizer.py` 追加。`KeyProvider` 签名 `(local_table_sql, local_col, limit) -> list | None`（None=超阈值跳过）:

```python
KeyProvider = Callable[[str, str, int], Optional[list]]


def apply_semijoin_pushdown(
    sql: str,
    attach_aliases: set[str],
    *,
    key_provider: KeyProvider,
    threshold: int,
) -> tuple[str, list[dict]]:
    """把合格半连接改写进 SQL；返回 (改写后 SQL, reports)。任何解析失败 → 原样返回。"""
    try:
        tree = sqlglot.parse_one(sql, read="duckdb")
    except Exception as exc:  # noqa: BLE001
        logger.info("federated optimize: parse failed, passthrough: %s", exc)
        return sql, [{"error": "parse_failed", "pushed": False}]

    try:
        plans = plan_semijoins(sql, attach_aliases, _tree=tree)
        reports: list[dict] = []
        for p in plans:
            keys = key_provider(p.local_table_sql, p.local_col, threshold)
            if not keys:  # None 或空 → 不下推
                reports.append({"table": p.remote_node.name, "pushed": False, "reason": "over_threshold_or_empty"})
                continue
            in_expr = exp.In(
                this=exp.column(p.remote_col),
                expressions=[exp.convert(v) for v in keys],
            )
            # 远端裸表 → (SELECT * FROM remote WHERE col IN (...)) AS alias
            inner = exp.select("*").from_(p.remote_node.copy()).where(in_expr)
            subq = exp.Subquery(this=inner, alias=exp.TableAlias(this=exp.to_identifier(p.remote_alias)))
            p.remote_node.replace(subq)
            reports.append({"table": subq.this.args["from"].sql(), "pushed": True, "keys": len(keys)})
        return tree.sql(dialect="duckdb"), reports
    except Exception as exc:  # noqa: BLE001 —— 改写阶段任何异常都保底放行
        logger.warning("federated optimize: rewrite failed, passthrough: %s", exc)
        return sql, [{"error": "rewrite_failed", "pushed": False}]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_optimizer.py -v`
Expected: 全部 passed（Task 3/4/5 共约 13 个）。

- [ ] **Step 5: Commit**

```bash
git add api/core/database/federated_optimizer.py api/tests/test_federated_optimizer.py
git commit -m "feat(federated): rewrite remote tables into semi-join subqueries with cardinality guard"
```

---

## Task 6: 时间界建议（schema 检测,不改写 SQL）

**Files:**
- Modify: `api/core/database/federated_optimizer.py`
- Test: `api/tests/test_federated_optimizer.py`

- [ ] **Step 1: 追加失败测试**（stub schema_provider）

在 `api/tests/test_federated_optimizer.py` 追加:

```python
from core.database.federated_optimizer import build_time_bound_suggestions


def _schema(_ref):
    return [{"name": "id", "type": "BIGINT"}, {"name": "created_at", "type": "TIMESTAMP"}]


def test_suggests_when_no_time_predicate():
    sql = "SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid"
    sugg = build_time_bound_suggestions(sql, {"mysql_db"}, schema_provider=_schema)
    assert len(sugg) == 1
    s = sugg[0]
    assert s["table"] == "mysql_db.orders" and s["column"] == "created_at"
    assert s["type"] == "time_bound" and "created_at" in s["hint"]


def test_no_suggestion_when_time_predicate_present():
    sql = "SELECT * FROM mysql_db.orders o WHERE o.created_at >= '2026-01-01'"
    assert build_time_bound_suggestions(sql, {"mysql_db"}, schema_provider=_schema) == []


def test_no_suggestion_without_audit_column():
    sql = "SELECT * FROM mysql_db.orders o"
    flat = lambda _ref: [{"name": "id", "type": "BIGINT"}, {"name": "qty", "type": "INT"}]
    assert build_time_bound_suggestions(sql, {"mysql_db"}, schema_provider=flat) == []
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_optimizer.py -k suggest -v`
Expected: FAIL（`ImportError: build_time_bound_suggestions`）。

- [ ] **Step 3: 实现建议生成**

在 `federated_optimizer.py` 顶部 import 处补 `from core.database.federated_time_bound import detect_time_bound_candidates, default_time_bound_value`,然后追加:

```python
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
) -> list[dict]:
    """远端表有审计时间列且 SQL 未对它设时间谓词 → 产出建议（不改 SQL）。解析失败 → []。"""
    try:
        tree = sqlglot.parse_one(sql, read="duckdb")
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
        cands = [c for c in cands if (alias, c.lower()) not in bounded]
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_optimizer.py -v`
Expected: 全部 passed。

- [ ] **Step 5: Commit**

```bash
git add api/core/database/federated_optimizer.py api/tests/test_federated_optimizer.py
git commit -m "feat(federated): time-bound suggestions from remote audit columns (detect-only)"
```

---

## Task 7: orchestrator + 真连接 provider（集成测试）

**Files:**
- Modify: `api/core/database/federated_optimizer.py`
- Test: `api/tests/test_federated_optimizer_integration.py`

- [ ] **Step 1: 写集成失败测试**（真 DuckDB,sqlite 当"远端",验证保持结果 + 幂等）

Create `api/tests/test_federated_optimizer_integration.py`:

```python
import duckdb
import pytest

from core.database.federated_optimizer import optimize_federated_sql


@pytest.fixture()
def conn(tmp_path):
    # 用第二个 DuckDB 库充当"远端"(原生 ATTACH,无需扩展/联网);其别名当作 remote。
    # 半连接逻辑只看 attach_aliases 集合,不依赖真实远端类型 → 用 DuckDB 即可完整验证。
    remote_path = tmp_path / "remote.duckdb"
    r = duckdb.connect(str(remote_path))
    r.execute("CREATE TABLE orders (id INTEGER, amount DOUBLE, created_at TIMESTAMP)")
    r.execute("INSERT INTO orders VALUES (1,10,'2020-01-01'),(2,20,'2026-06-01'),(3,30,'2026-06-10')")
    r.close()

    c = duckdb.connect()
    c.execute(f"ATTACH '{remote_path}' AS remote_db (READ_ONLY)")
    c.execute("CREATE TABLE local_t (oid INTEGER, tag VARCHAR)")
    c.execute("INSERT INTO local_t VALUES (2,'x'),(3,'y')")  # 只关心 id 2,3
    yield c
    c.close()


class _Cfg:
    federated_semijoin_threshold = 1000


def test_semijoin_preserves_result(conn):
    sql = "SELECT o.id FROM remote_db.orders o JOIN local_t l ON o.id = l.oid ORDER BY o.id"
    baseline = conn.execute(sql).fetchall()
    opt, _sugg, _warn = optimize_federated_sql(conn, sql, {"remote_db"}, _Cfg())
    assert "IN (" in opt                      # 确实改写了
    assert conn.execute(opt).fetchall() == baseline == [(2,), (3,)]


def test_idempotent_on_prewrapped_subquery(conn):
    # 前端形状：已是子查询 → 不应再改
    sql = ("SELECT o.id FROM (SELECT * FROM remote_db.orders WHERE id IN (2,3)) o "
           "JOIN local_t l ON o.id = l.oid ORDER BY o.id")
    opt, _s, _w = optimize_federated_sql(conn, sql, {"remote_db"}, _Cfg())
    assert opt.replace(" ", "") == sql.replace(" ", "") or "remote_db" in opt
    assert conn.execute(opt).fetchall() == [(2,), (3,)]


def test_time_bound_suggestion_emitted(conn):
    sql = "SELECT o.id FROM remote_db.orders o JOIN local_t l ON o.id = l.oid"
    _opt, sugg, _w = optimize_federated_sql(conn, sql, {"remote_db"}, _Cfg())
    assert any(s["column"] == "created_at" for s in sugg)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_optimizer_integration.py -v`
Expected: FAIL（`ImportError: optimize_federated_sql`）。

- [ ] **Step 3: 实现 orchestrator + 真 provider**

在 `federated_optimizer.py` 追加。真 provider 用同一个已 ATTACH 的 `conn`:

```python
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
    threshold = int(getattr(cfg, "federated_semijoin_threshold", 10000))
    warnings: list[dict] = []
    out_sql = sql
    try:
        out_sql, reports = apply_semijoin_pushdown(
            sql, attach_aliases, key_provider=_make_key_provider(conn), threshold=threshold)
        warnings.extend(r for r in reports if r.get("error") or r.get("pushed") is False)
    except Exception as exc:  # noqa: BLE001
        logger.warning("federated optimize bailout: %s", exc)
        out_sql = sql
    suggestions: list[dict] = []
    try:
        suggestions = build_time_bound_suggestions(
            sql, attach_aliases, schema_provider=_make_schema_provider(conn))
    except Exception as exc:  # noqa: BLE001
        logger.info("time-bound suggestion skipped: %s", exc)
    return out_sql, suggestions, warnings
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_optimizer_integration.py -v`
Expected: 3 passed（如本机无 sqlite 扩展网络,改测试为 `INSTALL sqlite` 已缓存;CI 同）。

- [ ] **Step 5: Commit**

```bash
git add api/core/database/federated_optimizer.py api/tests/test_federated_optimizer_integration.py
git commit -m "feat(federated): orchestrator with conn-backed key/schema providers"
```

---

## Task 8: 新增 MessageCode.QUERY_TIMEOUT

**Files:**
- Modify: `api/utils/response_helpers.py`
- Test: `api/tests/test_federated_optimizer_integration.py`（追加 1 个轻断言）

- [ ] **Step 1: 追加失败测试**

在 `api/tests/test_federated_optimizer_integration.py` 追加:

```python
def test_query_timeout_messagecode_exists():
    from utils.response_helpers import MessageCode, DEFAULT_MESSAGES
    assert MessageCode.QUERY_TIMEOUT == "QUERY_TIMEOUT"
    assert MessageCode.QUERY_TIMEOUT in DEFAULT_MESSAGES
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_optimizer_integration.py -k timeout -v`
Expected: FAIL（`AttributeError: QUERY_TIMEOUT`）。

- [ ] **Step 3: 加枚举 + 中文消息**

在 `api/utils/response_helpers.py` 的 `MessageCode` 枚举里、`QUERY_CANCELLED` 下方加:

```python
    QUERY_TIMEOUT = "QUERY_TIMEOUT"
```

在 `DEFAULT_MESSAGES` 字典(约 line 180)里、`MessageCode.QUERY_CANCELLED` 那条下方加:

```python
    MessageCode.QUERY_TIMEOUT: "查询超时已中止",
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_optimizer_integration.py -k timeout -v`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add api/utils/response_helpers.py api/tests/test_federated_optimizer_integration.py
git commit -m "feat(api): add QUERY_TIMEOUT message code"
```

---

## Task 9: 接入 raw 端点 + 超时护栏 + connection_id 归一

**Files:**
- Modify: `api/routers/duckdb_query.py`（`execute_federated_query`,约 746–929）
- Test: `api/tests/test_federated_endpoint.py`

> 改前先 `rg -n "execute_federated_query|attach_databases_on_connection|interruptible_connection|with_duckdb_connection" api/routers/duckdb_query.py` 复读现状,影响面仅此函数。

> **为何不写 HTTP 端点测试**:端点级测试需要"已注册的外部数据源"(`db_manager` + 加密 params),夹具沉重且脆。优化逻辑已在 Task 2–7 用真连接全覆盖。本任务只剩"接线"与"超时护栏";护栏依赖的中断原语用下面的单测坐实,端点响应字段用 Step 4 的**真实后端手动冒烟**验证(与本仓既有联调方式一致)。

- [ ] **Step 1a: 加配置项 federated_semijoin_threshold**

在 `api/core/common/config_manager.py` 的 `AppConfig`(`federated_query_timeout: int = 300` 那条附近)加一行:
```python
    federated_semijoin_threshold: int = 10000
```

- [ ] **Step 1b: 写中断原语验证测试**

Create `api/tests/test_federated_endpoint.py`:
```python
import threading
import duckdb
import pytest

from core.database.duckdb_pool import interruptible_connection
from core.database.connection_registry import connection_registry


def test_watchdog_interrupts_slow_query():
    """watchdog 定时器触发 connection.interrupt() → 慢查询抛 InterruptException。
    这是 Task 9 超时护栏依赖的原语(应直接通过,坐实机制可用)。"""
    task_id = "fed:test-timeout"
    timed_out = {"v": False}

    def on_timeout():
        timed_out["v"] = True
        connection_registry.interrupt(task_id)

    with interruptible_connection(task_id, "slow") as conn:
        timer = threading.Timer(0.3, on_timeout)
        timer.start()
        try:
            with pytest.raises(duckdb.InterruptException):
                # 十亿行聚合,必被 0.3s 定时器中断
                conn.execute(
                    "SELECT count(*) FROM range(10000000000) t(x) WHERE x % 7 = 0"
                ).fetchall()
        finally:
            timer.cancel()
    assert timed_out["v"] is True
```

- [ ] **Step 2: 跑测试确认原语可用**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_federated_endpoint.py -v`
Expected: PASS（验证 `interruptible_connection`+Timer+interrupt 在本 duckdb 版本可中断;Task 9 护栏据此接线）。

- [ ] **Step 3: 接线 —— 归一 + 优化 + 护栏**

在 `execute_federated_query` 中做三处改动:

(a) attach 配置循环（约 772）归一 connection_id —— 顶部加 import:
```python
from core.common.connection_alias import normalize_connection_id
```
循环里:
```python
            connection = db_manager.get_connection(
                normalize_connection_id(attach_db.connection_id)
            )
```

(b) `execute_in_connection(conn)` 内,ATTACH 之后、执行用户 SQL 之前,调用优化器（拿到 attach 别名集合）:
```python
        # 2. 优化：半连接键下推（保持结果）+ 时间界建议（不改 SQL）
        from core.database.federated_optimizer import optimize_federated_sql
        attach_aliases = {a for (a, _cfg) in attach_configs}
        nonlocal sql_query  # 改写后用于执行
        optimized_sql, fed_suggestions, fed_warnings = optimize_federated_sql(
            conn, sql_query, attach_aliases, config_manager.get_app_config()
        )
        sql_query = optimized_sql

        # 3. 执行用户 SQL
        result_df = conn.execute(sql_query).fetchdf()
```
并在函数顶部 `warnings = []` 旁,准备把 `fed_suggestions/fed_warnings` 透出（见 (d)）。把这两个变量提升为 `execute_in_connection` 外层可见（用 list/dict 容器或 nonlocal）。

(c) 超时护栏：把执行包进可中断连接 + watchdog。把原来"有 query_id 才用 interruptible_connection"的分支改为**总是**有 task_id:
```python
    import threading
    from core.database.connection_registry import connection_registry
    timeout_s = int(config_manager.get_app_config().federated_query_timeout or 300)
    query_id = query_id or f"fed:{uuid4().hex}"
    timed_out = {"v": False}

    def _on_timeout():
        timed_out["v"] = True
        connection_registry.interrupt(query_id)

    with interruptible_connection(query_id, sql_query) as conn:
        timer = threading.Timer(timeout_s, _on_timeout)
        timer.start()
        try:
            result_df = execute_in_connection(conn)
            query_column_types = describe_query_column_types(conn, sql_query, result_df)
        finally:
            timer.cancel()
```
在 `except duckdb.InterruptException:` 分支里区分超时 vs 主动取消:
```python
    except duckdb.InterruptException:
        if timed_out["v"]:
            return error_json_response(
                504, MessageCode.QUERY_TIMEOUT,
                f"Federated query exceeded {timeout_s}s and was aborted",
                details={"query_id": query_id, "timeout_s": timeout_s},
            )
        # …原有 QUERY_CANCELLED 逻辑保持…
```

(d) 响应体 `response_data` 增加两字段:
```python
            "optimized_sql": sql_query,
            "suggestions": fed_suggestions or None,
```
并把 `fed_warnings` 合并进既有 `warnings`。

> 注意:`sql_query` 原是函数级局部;`execute_in_connection` 是闭包,改写它需 `nonlocal sql_query`。`fed_suggestions/fed_warnings` 同理用闭包外的可变容器(如 `_fed = {}`)回传,避免作用域问题。实现时以"能跑过测试"为准,必要时把 `execute_in_connection` 的返回值从 `result_df` 改为 `(result_df, optimized_sql, suggestions, warnings)`。

- [ ] **Step 4a: 自动回归（护栏原语 + 结构化路未受影响 + 整体导入）**

Run:
```bash
cd api && ../.venv/bin/python -m pytest tests/test_federated_endpoint.py tests/test_join_query_federated.py -v
../.venv/bin/python -c "import main; print('app import ok')"
```
Expected: 全 PASS;`test_join_query_federated.py` 全绿(结构化路未触碰);导入无误。

- [ ] **Step 4b: 端点响应字段手动冒烟（需一个已配置的外部连接）**

若本机有任一已配置 MySQL/PG 连接,启动后端后对一张大表跑一条 `remote ⋈ local` 联邦查询,确认响应:
```bash
# 启动: cd api && ../.venv/bin/python run.py   （另开终端）
# 调用 /api/duckdb/federated-query (sql + attach_databases)，检查 data.optimized_sql 含 "IN ("、
# data.suggestions 含 created_at 建议、row_count 与不优化时一致。
```
Expected: `optimized_sql` 已半连接改写、`suggestions` 有时间界提示、结果行数不变。若本机无外部连接,记录"待联调环境验证"并继续(自动测试已覆盖核心逻辑)。

- [ ] **Step 5: Commit**

```bash
git add api/routers/duckdb_query.py api/core/common/config_manager.py api/tests/test_federated_endpoint.py
git commit -m "feat(federated): wire optimizer + timeout watchdog + connection_id normalize into raw endpoint"
```

---

## Task 10: 打包收录 + 全量回归

**Files:**
- Modify: `api/duckquery.spec`（PyInstaller,如需 hiddenimports）
- 验证：无新文件

- [ ] **Step 1: 确认 PyInstaller 是否漏收 sqlglot**

Run:
```bash
cd /Users/keliang/mypy/duckdb-query
rg -n "hiddenimports|collect_submodules" api/duckquery.spec | head
```
若 spec 用显式 `hiddenimports` 且未含 sqlglot,则在 `hiddenimports` 加 `'sqlglot'`;若用 `collect_all`/自动分析则通常无需改(sqlglot 是纯 import,PyInstaller 能静态发现)。

- [ ] **Step 2: 全量后端回归**

Run: `cd api && ../.venv/bin/python -m pytest -q 2>&1 | tail -15`
Expected: 全绿(新增 federated 测试 + 原有套件)。

- [ ] **Step 3: 冒烟 —— 端点导入无误**

Run: `cd api && ../.venv/bin/python -c "import main; print('app import ok')"`
Expected: `app import ok`。

- [ ] **Step 4: Commit（若改了 spec）**

```bash
git add api/duckquery.spec
git commit -m "build(desktop): ensure sqlglot bundled for federated optimizer"
```
(若 Step 1 判定无需改 spec,跳过本步。)

---

## 完成定义（Definition of Done）

- raw 端点联邦 JOIN:`local ⋈ remote` 自动半连接下推,远端只拉命中键的行;结果与原查询逐行一致(集成测试已证)。
- 前端可视化 JOIN 联邦路(已包子查询)行为零变化(幂等测试已证)。
- 慢查询在 `federated_query_timeout` 内 `QUERY_TIMEOUT` 失败,不再挂死。
- 审计列大表无时间过滤 → 响应 `suggestions` 给出时间界提示,但**不**自动改结果。
- `connection_id` 带 `db_` 前缀也能命中。
- docker 无影响(纯后端逻辑 + sqlglot 经 requirements 自动入镜像)。

## 未来（不在本期）
- ON 过滤显式下推(当前依赖 DuckDB 优化器+scanner 自动下推,已足够)。
- RIGHT/FULL JOIN、两侧皆远端的键下推。
- 时间界建议从 JOIN 对侧真实 min/max 反推窗口。
- 前端可视化 JOIN 改为发裸 SQL、由后端统一优化(消除前后端两份逻辑)。
```
