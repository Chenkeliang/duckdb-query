"""智能体内建工具:真实 DuckDB 上的行为、截断、超时中断。"""

import asyncio
import uuid

import pytest

from core.database.duckdb_engine import with_duckdb_connection
from core.services import ai_agent_tools
from core.services.ai_agent_tools import (
    AgentRunCtx,
    InspectTableArgs,
    RunQueryArgs,
    SearchTablesArgs,
)


@pytest.fixture(name="ctx")
def _ctx():
    return AgentRunCtx(
        run_id=f"agent_test_{uuid.uuid4().hex[:8]}",
        authorized_aliases=[],
        attach_configs=[],
    )


@pytest.fixture(name="table")
def _table():
    name = f"agent_tool_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f"CREATE TABLE {name}(id INTEGER, status VARCHAR)")
        con.execute(
            f"INSERT INTO {name} SELECT range, CASE WHEN range % 2 = 0 THEN 'ok' "
            f"ELSE 'fail' END FROM range(250)"
        )
    yield name
    with with_duckdb_connection() as con:
        con.execute(f"DROP TABLE IF EXISTS {name}")


def test_search_tables_finds_and_orders(ctx, table):
    result = ai_agent_tools._search_tables(ctx, SearchTablesArgs(query=table[:14]))
    assert result.ok and table in result.model_text
    assert "rows" in result.model_text


def test_inspect_table_returns_schema_and_samples(ctx, table):
    result = ai_agent_tools._inspect_table(ctx, InspectTableArgs(table=table))
    assert result.ok
    assert "status VARCHAR" in result.model_text
    assert "sample rows:" in result.model_text
    assert "'ok'" in result.model_text  # 低基数取值


def test_inspect_unknown_table_is_observation_not_exception(ctx):
    result = ai_agent_tools._inspect_table(ctx, InspectTableArgs(table="no_such_tbl_xx"))
    assert result.ok is False
    assert "error" in result.model_text


def test_inspect_unauthorized_alias_rejected(ctx):
    result = ai_agent_tools._inspect_table(
        ctx, InspectTableArgs(table="rogue.some_table")
    )
    assert result.ok is False
    assert "not authorized" in result.model_text


def test_run_query_executes_and_caps_rows(ctx, table):
    result = asyncio.run(
        ai_agent_tools.run_query_async(
            ctx, RunQueryArgs(sql=f"SELECT * FROM {table} ORDER BY id"), 3
        )
    )
    assert result.ok and result.truncated  # 250 行 > 100 帽
    assert result.model_text.count("\n") <= 105
    assert ctx.sql_calls_used == 1


def test_run_query_correct_aggregate_value(ctx, table):
    result = asyncio.run(
        ai_agent_tools.run_query_async(
            ctx,
            RunQueryArgs(sql=f"SELECT count(*) AS n FROM {table} WHERE status='ok'"),
            3,
        )
    )
    assert result.ok
    assert "125" in result.model_text  # 0..249 偶数 125 个


def test_run_query_budget_exhausted(ctx, table):
    ctx.sql_calls_used = 3
    result = asyncio.run(
        ai_agent_tools.run_query_async(ctx, RunQueryArgs(sql="SELECT 1"), 3)
    )
    assert result.ok is False and "budget" in result.model_text
    assert ctx.sql_calls_used == 3  # 不再消耗


def test_run_query_guard_rejection_counts(ctx):
    result = asyncio.run(
        ai_agent_tools.run_query_async(
            ctx, RunQueryArgs(sql="SELECT * FROM read_csv('/etc/passwd')"), 3
        )
    )
    assert result.ok is False
    assert ctx.sql_rejected == 1


def test_run_query_timeout_interrupts(ctx, monkeypatch):
    """超时后真实中断:长查询不应跑满,且返回超时观察。"""
    monkeypatch.setattr(ai_agent_tools, "QUERY_TIMEOUT_S", 1)
    result = asyncio.run(
        ai_agent_tools.run_query_async(
            ctx,
            RunQueryArgs(
                sql="SELECT count(*) FROM range(100000000) a, range(5000) b"
            ),
            3,
        )
    )
    assert result.ok is False
    assert "interrupted" in result.model_text or "exceeded" in result.model_text
