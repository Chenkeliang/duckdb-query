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


def test_search_and_join_attached_alias_end_to_end(ctx, table, tmp_path):
    """真实 SQLite 联邦回归:不预先告知远端表名——search_tables 枚举出限定名
    agent_remote.targets;再用该限定名与本地表 JOIN,结果正确。验证发现→JOIN 闭环。"""
    import sqlite3

    dbfile = tmp_path / "remote.sqlite"
    rc = sqlite3.connect(str(dbfile))
    rc.execute("CREATE TABLE targets(status TEXT, target INTEGER)")
    rc.executemany("INSERT INTO targets VALUES (?,?)", [("ok", 100), ("fail", 50)])
    rc.commit()
    rc.close()
    ctx.attach_configs = [("agent_remote", {"type": "sqlite", "path": str(dbfile)})]
    ctx.authorized_aliases = ["agent_remote"]

    # 1) 发现阶段:限定名出现,且只暴露元数据(表名),不含数据行
    disc = ai_agent_tools._search_tables(ctx, SearchTablesArgs(query="target"))
    assert disc.ok and "agent_remote.targets" in disc.model_text
    assert "100" not in disc.model_text  # 只发现表名,不采样远端数据

    # 2) 用发现到的限定名做 JOIN(table 固定装置:250 行 ok/fail 各 125)
    join_sql = (
        f"SELECT t.status, count(*) AS n FROM {table} t "
        "JOIN agent_remote.targets r ON t.status = r.status "
        "GROUP BY t.status ORDER BY t.status"
    )
    res = asyncio.run(ai_agent_tools.run_query_async(ctx, RunQueryArgs(sql=join_sql), 3))
    assert res.ok and "125" in res.model_text


def test_search_discovery_alias_failure_does_not_block_local(ctx, table):
    """单个别名发现失败(不可达文件)不得阻断本地表发现。"""
    ctx.attach_configs = [("dead_remote", {"type": "sqlite", "path": "/nonexistent/x.sqlite"})]
    ctx.authorized_aliases = ["dead_remote"]
    result = ai_agent_tools._search_tables(ctx, SearchTablesArgs(query=table[:14]))
    assert result.ok and table in result.model_text  # 本地照常返回


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


def test_run_query_execution_error_is_observation_not_exception(ctx):
    """执行期 DuckDB 错误(EXPLAIN 通过、con.execute/fetchmany 才炸)必须作为失败
    observation 回喂,绝不逃逸成循环的 internal_error。回归 scenario 21:复合谓词下
    JSON `->>` 触发运行期 ConversionException,Engine 需据此让模型自修复。"""
    name = f"agent_ev_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f"CREATE TABLE {name}(event_type VARCHAR, properties JSON)")
        con.execute(
            "INSERT INTO " + name + " VALUES "
            "('purchase', '{\"device\":\"iOS\"}'), ('purchase', '{\"device\":\"Web\"}')"
        )
    try:
        bad = (
            "SELECT count(*) AS n FROM " + name
            + " WHERE event_type='purchase' AND properties->>'device'='iOS'"
        )
        result = asyncio.run(ai_agent_tools.run_query_async(ctx, RunQueryArgs(sql=bad), 3))
        assert result.ok is False  # 失败 observation,而非抛异常
        assert "query execution failed" in result.ui_summary
        assert "error" in result.model_text.lower()
        assert ctx.sql_calls_used == 1  # 已消耗一次查询预算
    finally:
        with with_duckdb_connection() as con:
            con.execute(f"DROP TABLE IF EXISTS {name}")


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
