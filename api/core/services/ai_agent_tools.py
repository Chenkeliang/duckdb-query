"""数据智能体的内建只读工具集(v1:search_tables / inspect_table / run_query)。

契约要点(为将来 Skills/MCP Adapter 留缝):
- AgentTool 用 Pydantic args_model 编写,对外契约是派生的 JSON Schema
  (未来 MCP 工具无法反向合成 Pydantic,Adapter 直接携带 schema 即可)
- tier 字段 v1 恒为 "read",confirm 语义预留给未来写工具
- handler 永不向循环抛业务异常:一切失败都作为 observation 文本回喂模型
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

import duckdb
from pydantic import BaseModel

from core.database.duckdb_engine import validate_query_syntax, with_duckdb_connection
from core.database.duckdb_pool import interruptible_connection
from core.database.federated_attach import (
    attach_databases_on_connection,
    detach_databases_on_connection,
    format_qualified_table_reference,
)
from core.services import ai_sql_guard, schema_sampler, table_registry
from core.services.ai_sql_validation import is_select_only, normalize_sql

logger = logging.getLogger(__name__)

ROW_CAP = 100
OBS_BYTE_CAP = 8192
QUERY_TIMEOUT_S = 20
_SEARCH_CAP = 20


@dataclass
class ToolResult:
    model_text: str  # 回喂模型的紧凑内容(≤OBS_BYTE_CAP,截断带标记)
    ui_summary: str  # 前端步骤条展示(短)
    data: Optional[dict] = None
    truncated: bool = False
    elapsed_ms: int = 0
    ok: bool = True


@dataclass
class AgentRunCtx:
    run_id: str
    authorized_aliases: List[str]
    attach_configs: list  # resolve_attach_configs 的产物,run_query/inspect 挂载用
    locale: str = "zh"
    provider: str = ""
    model: str = ""
    session_id: Optional[str] = None  # 仅关联标识,回显用;不落库(不做会话历史)
    sql_calls_used: int = 0
    sql_rejected: int = 0
    llm_calls: int = 0  # 真实 LLM 调用总数(steps + reformats)
    executed_sql: set = field(default_factory=set)  # 本次 run 成功执行过的 run_query SQL(规范化);
    #                                                  data_qa final 的 grounding 门控据此判定
    unavailable_aliases: List[Tuple[str, str]] = field(default_factory=list)
    #   本次授权但解析/连接失败、已被排除的别名 [(alias, reason)];逐别名降级(见 ai.py _prepare_agent),
    #   由 profile 上下文显式列给 Agent,避免静默把联邦查询范围缩成本地
    scope_limits: Optional["ai_sql_guard.ScopeLimits"] = None
    #   用户在对话里选定的问数范围:None = 未逐表限制(整库可问,与收紧前一致);
    #   本地空集 = 本地不在范围内。目录注入与 run_query 闸共用这一份事实


@dataclass
class AgentTool:
    name: str
    description: str
    args_model: type[BaseModel]
    handler: Callable[[AgentRunCtx, BaseModel], "ToolResult"]
    capability: str = "read"  # v1 恒 read;confirm 语义预留给未来写工具
    origin: str = "builtin"   # builtin / skill / mcp:<server>(未来 Adapter)

    def args_schema(self) -> dict:
        return self.args_model.model_json_schema()


class SearchTablesArgs(BaseModel):
    query: str = ""


class InspectTableArgs(BaseModel):
    table: str


class DescribeTablesArgs(BaseModel):
    tables: List[str] = []


class RunQueryArgs(BaseModel):
    sql: str


def _clip(text: str, cap: int = OBS_BYTE_CAP) -> tuple[str, bool]:
    raw = text.encode("utf-8")
    if len(raw) <= cap:
        return text, False
    return raw[:cap].decode("utf-8", errors="ignore") + "\n…(truncated)", True


def _search_tables(ctx: AgentRunCtx, args: SearchTablesArgs) -> ToolResult:
    t0 = time.time()
    needle = (args.query or "").strip().lower()
    with with_duckdb_connection() as con:
        rows = con.execute(
            """
            SELECT table_name, estimated_size FROM duckdb_tables()
            WHERE NOT internal AND database_name = current_database()
              AND schema_name = 'main'
            """
        ).fetchall()
    names = [r[0] for r in rows if not r[0].lower().startswith("system_")]
    sizes = {r[0]: int(r[1] or 0) for r in rows}
    registry = table_registry.sync(names)
    names.sort(key=lambda n: (registry.get(n) or {}).get("sort_seq") or 0, reverse=True)
    if needle:
        names = [n for n in names if needle in n.lower()]
    # 联邦发现:枚举已授权别名下的远端表,返回限定名 alias.table(只取元数据不采样)。
    remote = _discover_attached_tables(ctx, needle)
    local_total, remote_total = len(names), len(remote)
    # 本地与联邦共用一个有界上限:本地优先占额,余额给远端
    shown_local = names[:_SEARCH_CAP]
    shown_remote = remote[: max(0, _SEARCH_CAP - len(shown_local))]
    lines = []
    for n in shown_local:
        created = (registry.get(n) or {}).get("created_at")
        created_s = f", created {str(created)[:16]}" if created else ""
        lines.append(f"- {n} (~{sizes.get(n, 0)} rows{created_s})")
    for qn in shown_remote:
        lines.append(f"- {qn} (attached, query by this qualified name)")
    if ctx.authorized_aliases:
        lines.append(
            "Attached aliases (query as alias.table): "
            + ", ".join(ctx.authorized_aliases)
        )
    extra = (local_total - len(shown_local)) + (remote_total - len(shown_remote))
    if extra > 0:
        lines.append(f"…and {extra} more; refine the query.")
    text = "\n".join(lines) if lines else "(no matching tables)"
    grand_total = local_total + remote_total
    return ToolResult(
        model_text=text,
        ui_summary=(
            f"matched {grand_total} tables" if needle
            else f"listed {min(grand_total, _SEARCH_CAP)} tables"
        ),
        elapsed_ms=int((time.time() - t0) * 1000),
    )


# 远端表清单的**进程内**短 TTL 缓存(绝不落盘):远端库结构随时可能被 DDL 改动,
# 缓存只用来省掉同一轮对话里的重复 ATTACH 扫描;真正写 SQL 前仍由执行链上的
# EXPLAIN(活库)裁决,所以最坏后果是多跑一轮,而不是给出错误答案。
_ATTACHED_TTL_S = 45.0
_ATTACHED_CACHE: Dict[str, Tuple[float, List[str]]] = {}
# 默认 schema:这些不进限定名(DuckDB/SQLite 是 main);其余 schema(PostgreSQL 的
# public/业务 schema、MySQL 的库名)保留成三段名 alias.schema.table。
_DEFAULT_SCHEMAS = {"main"}


def _cache_key(alias: str, db_config: dict) -> str:
    ident = "|".join(str(db_config.get(k, "")) for k in
                     ("type", "host", "port", "database", "path"))
    return f"{alias.lower()}::{ident}"


def _scan_attached_tables(alias: str, db_config: dict) -> List[str]:
    """ATTACH 一个别名并枚举其表(含 schema),返回限定名列表。只取元数据,不采样。"""
    with with_duckdb_connection() as con:
        attached = attach_databases_on_connection(con, [(alias, db_config)])
        try:
            rrows = con.execute(
                "SELECT schema_name, table_name FROM duckdb_tables() "
                "WHERE database_name = ? AND NOT internal "
                "ORDER BY schema_name, table_name",
                [alias],
            ).fetchall()
        finally:
            if attached:
                detach_databases_on_connection(con, attached)
    out: List[str] = []
    for schema, tname in rrows:
        sname = str(schema or "")
        if sname.lower() in _DEFAULT_SCHEMAS or not sname:
            out.append(f"{alias}.{tname}")
        else:
            out.append(f"{alias}.{sname}.{tname}")
    return out


def out_of_scope_candidates(ctx: "AgentRunCtx", text: str, cap: int = 3) -> List[str]:
    """从答复文本里挑出「用户库里确实存在、但本轮不在范围内」的表名。

    用途:拒答时前端给一个「加入该表」按钮,一键把它加进作用域重问,而不是让
    用户自己回面板里找。只认**真实存在**的表名(本地目录 ∪ 已授权别名的表清单),
    模型随口编的名字不会变成按钮。
    """
    limits = ctx.scope_limits
    if limits is None or not text:
        return []  # 未收窄范围 = 无所谓"范围外"

    body = text.lower()
    found: List[str] = []

    def consider(name: str, in_scope: bool) -> None:
        if in_scope or not name or len(name) < 2:
            return
        if name.lower() in body and name not in found:
            found.append(name)

    try:
        with with_duckdb_connection() as con:
            rows = con.execute(
                "SELECT table_name FROM duckdb_tables() WHERE NOT internal "
                "AND database_name = current_database() AND schema_name = 'main'"
            ).fetchall()
        for (tname,) in rows:
            if str(tname).lower().startswith("system_"):
                continue
            consider(str(tname), limits.local_allowed(str(tname)))
    except Exception:  # noqa: BLE001  目录读不到就少给建议,不影响回答本身
        pass

    for alias, db_config in ctx.attach_configs or []:
        try:
            names, _age = attached_tables_cached(alias, db_config)
        except Exception:  # noqa: BLE001
            continue
        for qualified in names:
            short = qualified.split(".")[-1]
            consider(short, limits.alias_allowed(alias, short))

    return found[:cap]


def attached_tables_cached(alias: str, db_config: dict,
                           ttl: float = _ATTACHED_TTL_S) -> Tuple[List[str], float]:
    """返回 (限定名列表, 缓存年龄秒)。命中 TTL 内的缓存则不再连远端。"""
    key = _cache_key(alias, db_config)
    now = time.time()
    hit = _ATTACHED_CACHE.get(key)
    if hit and (now - hit[0]) < ttl:
        return hit[1], now - hit[0]
    names = _scan_attached_tables(alias, db_config)
    _ATTACHED_CACHE[key] = (now, names)
    return names, 0.0


def invalidate_attached_tables(alias: Optional[str] = None) -> None:
    """强制下次重新读取库结构(用户点"刷新结构",或查询报表/列不存在时自愈)。"""
    if alias is None:
        _ATTACHED_CACHE.clear()
        return
    prefix = f"{alias.lower()}::"
    for key in [k for k in _ATTACHED_CACHE if k.startswith(prefix)]:
        _ATTACHED_CACHE.pop(key, None)


def _discover_attached_tables(ctx: AgentRunCtx, needle: str) -> List[str]:
    """枚举本次请求已授权别名(ctx.attach_configs)下的远端表,返回限定名。

    只 ATTACH 当前请求明确授权的配置;每个别名独立容错(一个连接失败不阻断本地及
    其他别名);ATTACH 必在 finally DETACH;发现阶段只返回表名元数据,不采样、不外发
    远端数据行。带 schema 的库(PostgreSQL 等)返回三段名 alias.schema.table。
    """
    if not ctx.attach_configs:
        return []
    out: List[str] = []
    for alias, db_config in ctx.attach_configs:
        try:
            names, _age = attached_tables_cached(alias, db_config)
        except Exception as exc:  # noqa: BLE001  单别名失败不阻断本地/其他别名发现
            logger.warning("agent search: discover attached alias '%s' failed: %s", alias, exc)
            continue
        for qualified in names:
            if needle and needle not in qualified.lower():
                continue
            out.append(qualified)
    return out


def _inspect_table(ctx: AgentRunCtx, args: InspectTableArgs) -> ToolResult:
    t0 = time.time()
    name = args.table.strip()
    is_alias = "." in name
    if is_alias:
        alias = name.split(".", 1)[0].lower()
        if alias not in {a.lower() for a in ctx.authorized_aliases}:
            return ToolResult(
                model_text=f"error: alias '{alias}' is not authorized in this conversation",
                ui_summary=f"unauthorized alias {alias}",
                ok=False,
                elapsed_ms=int((time.time() - t0) * 1000),
            )
    try:
        with with_duckdb_connection() as con:
            attached: list[str] = []
            try:
                if is_alias and ctx.attach_configs:
                    attached = attach_databases_on_connection(con, ctx.attach_configs)
                ref = format_qualified_table_reference(name)
                rows = con.execute(f"DESCRIBE {ref}").fetchall()
                cols = ", ".join(f"{r[0]} {r[1]}" for r in rows)
                parts = [f"{name}({cols})"]
                if not is_alias:
                    block = schema_sampler.sample_table_block(
                        con, ref, [(r[0], r[1]) for r in rows]
                    )
                    if block:
                        parts.append(block)
                else:
                    parts.append(
                        "  (external table: no pre-sampling; verify values via a "
                        "bounded run_query)"
                    )
                text, truncated = _clip("\n".join(parts))
                return ToolResult(
                    model_text=text,
                    ui_summary=f"inspected {name} ({len(rows)} columns)",
                    truncated=truncated,
                    elapsed_ms=int((time.time() - t0) * 1000),
                )
            finally:
                if attached:
                    detach_databases_on_connection(con, attached)
    except Exception as exc:  # noqa: BLE001  失败作为 observation 回喂
        return ToolResult(
            model_text=f"error: {str(exc)[:300]}",
            ui_summary=f"inspect {name} failed",
            ok=False,
            elapsed_ms=int((time.time() - t0) * 1000),
        )


_DESCRIBE_CAP = 8          # 每次最多描述几张表(挡住"把整库列定义一次性灌进上下文")
_DESCRIBE_COL_CAP = 60     # 单表列数上限,超出截断并标注


def _describe_tables(ctx: AgentRunCtx, args: DescribeTablesArgs) -> ToolResult:
    """一次挂载、批量取多张表的列定义(本地 + 已授权别名)。

    广度工具:只读元数据、不采样数据行、不计入 sql_calls,用来替代"一张表一个 step"的
    inspect_table 轮询;要看真实取值仍走 inspect_table(本地)或带行帽的 run_query。
    单表失败只影响该表(错误写进该行),其余照常返回。
    """
    t0 = time.time()
    names = [n.strip() for n in (args.tables or []) if n and n.strip()]
    if not names:
        return ToolResult(
            model_text="error: tables must be a non-empty list of table names",
            ui_summary="no table given", ok=False,
            elapsed_ms=int((time.time() - t0) * 1000),
        )
    dropped = max(0, len(names) - _DESCRIBE_CAP)
    names = names[:_DESCRIBE_CAP]
    authorized = {a.lower() for a in ctx.authorized_aliases}
    lines: List[str] = []
    ok_count = 0
    try:
        with with_duckdb_connection() as con:
            attached: list[str] = []
            try:
                if any("." in n for n in names) and ctx.attach_configs:
                    attached = attach_databases_on_connection(con, ctx.attach_configs)
                for name in names:
                    alias = name.split(".", 1)[0].lower() if "." in name else ""
                    if alias and alias not in authorized:
                        lines.append(f"{name}: error: alias '{alias}' is not authorized")
                        continue
                    try:
                        ref = format_qualified_table_reference(name)
                        rows = con.execute(f"DESCRIBE {ref}").fetchall()
                    except Exception as exc:  # noqa: BLE001  单表失败不拖垮整批
                        lines.append(f"{name}: error: {str(exc)[:160]}")
                        continue
                    shown = rows[:_DESCRIBE_COL_CAP]
                    cols = ", ".join(f"{r[0]} {r[1]}" for r in shown)
                    more = (f" …and {len(rows) - len(shown)} more columns"
                            if len(rows) > len(shown) else "")
                    lines.append(f"{name}({cols}){more}")
                    ok_count += 1
            finally:
                if attached:
                    detach_databases_on_connection(con, attached)
    except Exception as exc:  # noqa: BLE001
        return ToolResult(
            model_text=f"error: {str(exc)[:300]}",
            ui_summary="describe failed", ok=False,
            elapsed_ms=int((time.time() - t0) * 1000),
        )
    if dropped:
        lines.append(f"(only the first {_DESCRIBE_CAP} tables were described; "
                     f"{dropped} more were skipped — call again for the rest)")
    lines.append("Values are NOT sampled here — verify literals with a bounded run_query.")
    text, truncated = _clip("\n".join(lines))
    return ToolResult(
        model_text=text,
        ui_summary=f"described {ok_count}/{len(names)} tables",
        ok=ok_count > 0,
        truncated=truncated,
        elapsed_ms=int((time.time() - t0) * 1000),
    )


def _rows_to_text(columns: List[str], rows: List[tuple]) -> str:
    header = "\t".join(columns)
    body = "\n".join(
        "\t".join("NULL" if v is None else str(v)[:200] for v in row) for row in rows
    )
    return f"{header}\n{body}" if body else f"{header}\n(no rows)"


def _execute_guarded(ctx: AgentRunCtx, sql: str) -> ToolResult:
    """同步执行体:跑在线程里,由 interruptible_connection 提供真实中断。"""
    t0 = time.time()
    with interruptible_connection(ctx.run_id, sql) as con:
        attached: list[str] = []
        try:
            if ctx.attach_configs:
                attached = attach_databases_on_connection(con, ctx.attach_configs)
            ok, err = validate_query_syntax(sql, con=con)
            if not ok:
                ctx.sql_rejected += 1
                return ToolResult(
                    model_text=f"error: {err[:400]}",
                    ui_summary="query failed validation",
                    ok=False,
                    elapsed_ms=int((time.time() - t0) * 1000),
                )
            # 行帽:最外层缺 LIMIT 时补 ROW_CAP;模型自带 LIMIT 也由 fetchmany 截断
            from routers.query_sql_utils import (  # pylint: disable=import-outside-toplevel
                ensure_query_has_limit,
                has_top_level_limit,
            )

            # 帽 +1:留一行"哨兵"以便探测是否被截断
            exec_sql = (
                sql if has_top_level_limit(sql) else ensure_query_has_limit(sql, ROW_CAP + 1)
            )
            # 执行期异常(EXPLAIN 过、con.execute/fetchmany 才炸,如 Conversion/InvalidInput/
            # OutOfRange)必须作为 observation 回喂,让模型自修复(改 json_extract_string、
            # TRY_CAST 等),不能逃逸成 Loop 的 internal_error(见模块契约 §7、回归
            # test_ai_agent_tools 运行期错误用例)。InterruptException 是中断/超时信号,
            # 原样上抛交回 run_query_async,绝不吞——不改变取消与超时行为。
            try:
                cur = con.execute(exec_sql)
                columns = [d[0] for d in (cur.description or [])]
                rows = cur.fetchmany(ROW_CAP + 1)
            except duckdb.InterruptException:
                raise
            except duckdb.Error as exc:
                return ToolResult(
                    model_text=f"error: query execution failed: {str(exc)[:280]}",
                    ui_summary="query execution failed",
                    ok=False,
                    elapsed_ms=int((time.time() - t0) * 1000),
                )
            truncated_rows = len(rows) > ROW_CAP
            rows = rows[:ROW_CAP]
            text, clipped = _clip(_rows_to_text(columns, rows))
            note = f"\n({len(rows)} rows returned"
            note += ", truncated)" if (truncated_rows or clipped) else ")"
            return ToolResult(
                model_text=text + note,
                ui_summary=f"returned {len(rows)} rows"
                + (" (truncated)" if truncated_rows or clipped else ""),
                truncated=truncated_rows or clipped,
                elapsed_ms=int((time.time() - t0) * 1000),
            )
        finally:
            if attached:
                detach_databases_on_connection(con, attached)


async def run_query_async(ctx: AgentRunCtx, args: RunQueryArgs, max_sql_calls: int) -> ToolResult:
    """五层闸 + 线程执行 + 超时中断。唯一的 async 工具(其余轻查询直接同步)。"""
    sql = args.sql.strip().rstrip(";")
    if ctx.sql_calls_used >= max_sql_calls:
        return ToolResult(
            model_text=(
                "error: query budget exhausted; finalize with what you have observed"
            ),
            ui_summary="query budget exhausted",
            ok=False,
        )
    ctx.sql_calls_used += 1
    if not is_select_only(sql):
        ctx.sql_rejected += 1
        return ToolResult(
            model_text="error: only a single read-only SELECT statement is allowed",
            ui_summary="non-SELECT rejected",
            ok=False,
        )
    allowed, reason = ai_sql_guard.check_sql(sql, ctx.authorized_aliases, ctx.scope_limits)
    if not allowed:
        ctx.sql_rejected += 1
        return ToolResult(
            model_text=f"error: {reason}",
            ui_summary="query rejected by guard",
            ok=False,
        )
    task = asyncio.create_task(asyncio.to_thread(_execute_guarded, ctx, sql))
    try:
        result = await asyncio.wait_for(asyncio.shield(task), timeout=QUERY_TIMEOUT_S)
        if result.ok:
            # 记录本次 run 成功执行过的查询(规范化),供 data_qa final 的 grounding 门控
            ctx.executed_sql.add(normalize_sql(sql))
        return result
    except asyncio.TimeoutError:
        interrupt_run(ctx.run_id)
        try:
            await asyncio.wait_for(task, timeout=5)
        except Exception:  # noqa: BLE001  中断后的收尾异常不再关心
            pass
        return ToolResult(
            model_text=f"error: query exceeded {QUERY_TIMEOUT_S}s and was interrupted",
            ui_summary="query timed out",
            ok=False,
        )
    except asyncio.CancelledError:
        interrupt_run(ctx.run_id)
        task.add_done_callback(_swallow_task_result)
        raise


def _swallow_task_result(task: "asyncio.Task") -> None:
    """取消/中断后的孤儿线程任务:取回异常避免 'never retrieved' 告警。"""
    if not task.cancelled():
        exc = task.exception()
        if exc:
            logger.debug("agent query task ended after interrupt: %s", exc)


def interrupt_run(run_id: str) -> None:
    """中断该 run 正在执行的探查查询(DuckDB interrupt + 远端 KILL)。"""
    try:
        from core.database.connection_registry import (  # pylint: disable=import-outside-toplevel
            connection_registry,
        )

        connection_registry.interrupt_with_remote(run_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("agent interrupt failed: %s", exc)


def build_registry() -> Dict[str, AgentTool]:
    return {
        "search_tables": AgentTool(
            name="search_tables",
            description="find tables in the catalog (newest first, with creation time)",
            args_model=SearchTablesArgs,
            handler=_search_tables,
        ),
        "inspect_table": AgentTool(
            name="inspect_table",
            description="columns, types, a few real rows and low-cardinality values",
            args_model=InspectTableArgs,
            handler=_inspect_table,
        ),
        "describe_tables": AgentTool(
            name="describe_tables",
            description=("columns of several tables at once (local or alias.table); "
                         "metadata only, no sample rows, does not use a query budget"),
            args_model=DescribeTablesArgs,
            handler=_describe_tables,
        ),
        "run_query": AgentTool(
            name="run_query",
            description="run one read-only DuckDB SELECT (row limit enforced)",
            args_model=RunQueryArgs,
            handler=None,  # async 特例,循环里直连 run_query_async
        ),
    }


def render_tools_for_prompt(
    registry: Dict[str, AgentTool], allowed: Optional[tuple] = None
) -> str:
    lines = []
    for name, tool in registry.items():
        if allowed is not None and name not in allowed:
            continue
        props = tool.args_schema().get("properties", {})
        args = ", ".join(f'"{k}"' for k in props) or "(none)"
        lines.append(f"{tool.name}: {tool.description} — args: {args}")
    return "\n".join(lines)
