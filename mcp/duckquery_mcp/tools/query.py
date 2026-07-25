from typing import Any

from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.config import Config


def _truncate(data: dict, cfg: Config) -> dict:
    """Compact a /execute-style result; cap rows at cfg.row_cap."""
    rows = data.get("data") or []
    capped = rows[: cfg.row_cap]
    return {
        "columns": data.get("columns"),
        "rows": capped,
        "row_count": data.get("row_count", len(rows)),
        "truncated": len(rows) > len(capped),
    }


async def run_sql(
    client: DuckQueryClient, cfg: Config, *, sql: str, preview: bool = True, confirm: bool = False
) -> Any:
    """Run DuckDB SQL against local tables. Returns columns + (capped) rows.

    DDL/DML (anything that isn't SELECT/WITH/EXPLAIN/PRAGMA/DESCRIBE/SHOW) needs
    confirm=true outside read-only mode — this can drop/alter/delete real tables,
    it gets the same confirmation gate as the generic passthrough tool, not a
    lighter one just because it has a dedicated name.
    """
    from duckquery_mcp.safety import confirm_required, is_write_sql
    blocked = confirm_required(cfg, is_write_sql(sql), confirm)
    if blocked:
        return blocked
    data = await client.call("POST", "/api/duckdb/execute",
                             json_body={"sql": sql, "is_preview": preview})
    return _truncate(data, cfg)


async def federated_query(
    client: DuckQueryClient, cfg: Config, *, sql: str, attach_databases: list, confirm: bool = False
) -> Any:
    """Run SQL across attached external DBs (MySQL/PostgreSQL/SQLite/DuckDB) + local tables.

    attach_databases: [{"alias": "m", "connection_id": "SORDER"}]. Connection ids from
    list_connections (e.g. "db_SORDER") are accepted — the "db_" prefix is normalized.
    Reference an attached table as alias.table, e.g. SELECT * FROM m.orders LIMIT 100.

    DDL/DML needs confirm=true outside read-only mode — see run_sql.
    """
    from duckquery_mcp.safety import confirm_required, is_write_sql
    blocked = confirm_required(cfg, is_write_sql(sql), confirm)
    if blocked:
        return blocked
    data = await client.call("POST", "/api/duckdb/federated-query",
                             json_body={"sql": sql, "attach_databases": attach_databases,
                                        "is_preview": True})
    return _truncate(data, cfg)


async def _agent_run(client: DuckQueryClient, *, mode: str, agent_input: dict,
                     context: dict, session_id: str | None = None) -> Any:
    """统一 Agent 入口:所有 AI 工具都走 POST /api/ai/agent/run(同一 Engine+Profile)。

    返回 {result, termination_reason, message, run_id, session_id};result 为对应
    mode 的 output_model(校验通过)或 null(校验失败/回退,见 termination_reason)。"""
    body: dict = {"mode": mode, "input": agent_input, "context": context}
    if session_id:
        body["session_id"] = session_id
    return await client.call("POST", "/api/ai/agent/run", json_body=body)


async def ask_agent(
    client: DuckQueryClient,
    cfg: Config,
    *,
    question: str,
    tables: list | None = None,
    attach_databases: list | None = None,
    locale: str = "zh",
    history: list | None = None,
    session_id: str | None = None,
) -> Any:
    """Ask the DuckQuery data agent about your data (mode=data_qa). Before
    answering it runs BOUNDED READ-ONLY probe queries — inspects schemas, verifies
    real column values, and dry-runs row-capped SELECTs — over local DuckDB tables
    and, when you pass attach_databases (same shape as federated_query), the
    attached MySQL/PostgreSQL/SQLite/DuckDB tables referenced as alias.table.

    Returns {result:{content, sql, evidence}, termination_reason, run_id}. `sql`
    (if any) is a draft for you to run; the agent never executes writes and its own
    probe queries are read-only and bounded. Pass `history` as prior turns
    [{role, content}, ...] (questions and answers only, no tool traces)."""
    messages = list(history or []) + [{"role": "user", "content": question}]
    context = {"tables": tables or [], "attach_databases": attach_databases or [], "locale": locale}
    return await _agent_run(client, mode="data_qa", agent_input={"messages": messages},
                            context=context, session_id=session_id)


async def generate_sql(
    client: DuckQueryClient,
    cfg: Config,
    *,
    question: str,
    tables: list | None = None,
    attach_databases: list | None = None,
    locale: str = "zh",
) -> Any:
    """Natural-language question -> a validated DuckDB SQL DRAFT (mode=generate_sql).

    The SQL is EXPLAIN-checked against the real schema but NOT executed — returns
    {result:{sql, used_tables, safe}, termination_reason}. `safe` is derived by the
    backend (true only when `sql` is a single read-only SELECT) — the model does not
    decide it. Review then run it yourself with run_sql / federated_query. Pass
    attach_databases (same shape as federated_query) to target attached external DBs
    as alias.table."""
    context = {"tables": tables or [], "attach_databases": attach_databases or [], "locale": locale}
    return await _agent_run(client, mode="generate_sql", agent_input={"question": question},
                            context=context)


async def repair_sql(
    client: DuckQueryClient,
    cfg: Config,
    *,
    sql: str,
    error_message: str,
    tables: list | None = None,
    attach_databases: list | None = None,
    locale: str = "zh",
) -> Any:
    """Error doctor (mode=repair_sql): given a failing SQL and its error message,
    suggest a fix. Returns {result:{explanation, fixed_sql, safe}, termination_reason}.
    `safe` is derived by the backend, not the model: when the proposed fix is not a
    single read-only SELECT, `fixed_sql` is nulled and `safe` is false.

    Pass the same tables / attach_databases the failing query used so it sees the
    real schemas instead of guessing column names."""
    context = {"tables": tables or [], "attach_databases": attach_databases or [], "locale": locale}
    return await _agent_run(client, mode="repair_sql",
                            agent_input={"sql": sql, "error": error_message}, context=context)


async def explain_sql(client: DuckQueryClient, cfg: Config, *, sql: str, locale: str = "zh") -> Any:
    """Plain-language explanation of a SQL statement (mode=explain_sql).

    Returns {result:{explanation}, termination_reason}."""
    return await _agent_run(client, mode="explain_sql", agent_input={"sql": sql},
                            context={"locale": locale})


async def suggest_chart(
    client: DuckQueryClient,
    cfg: Config,
    *,
    columns: list,
    sample: list | None = None,
    locale: str = "zh",
) -> Any:
    """Suggest a chart spec for a query result (mode=suggest_chart). Pass columns
    (list of {name, type}) and optional sample rows.

    Returns {result: ChartSpec {type, x, y, agg, xBin, reason} | null,
    termination_reason}. result is null when no valid chart applies (caller falls
    back to its own default)."""
    return await _agent_run(client, mode="suggest_chart",
                            agent_input={"columns": columns, "sample": sample or []},
                            context={"locale": locale})
