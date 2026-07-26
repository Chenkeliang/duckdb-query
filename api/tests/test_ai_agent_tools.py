"""智能体内建工具:真实 DuckDB 上的行为、截断、超时中断。"""

import asyncio
import uuid

import pytest

from core.database.duckdb_engine import with_duckdb_connection
from core.services import ai_agent_tools
from core.services.ai_agent_tools import (
    AgentRunCtx,
    DescribeTablesArgs,
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


def test_run_query_rejects_recovered_with_cte_write(ctx):
    """安全边界(纵深防御):即便 recover_sql_action 把 WITH...DELETE 当查询恢复(以 WITH
    开头),run_query 工具的 is_select_only 仍拒绝为失败 observation 并计入 sql_rejected,
    绝不执行写操作。"""
    res = asyncio.run(ai_agent_tools.run_query_async(
        ctx, RunQueryArgs(sql="WITH c AS (SELECT 1) DELETE FROM some_table"), 3))
    assert res.ok is False
    assert "read-only SELECT" in res.model_text
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


# ---- describe_tables:广度工具(批量列定义、不采样、不计 sql_calls) ----

def test_describe_tables_batches_multiple_tables(ctx, table):
    """一次调用拿到多张表的列定义;不消耗 sql_calls 预算(广度探查不该和查询抢额度)。"""
    before = ctx.sql_calls_used
    result = ai_agent_tools._describe_tables(ctx, DescribeTablesArgs(tables=[table, table]))
    assert result.ok
    assert result.model_text.count(f"{table}(") == 2
    assert "id INTEGER" in result.model_text and "status VARCHAR" in result.model_text
    assert ctx.sql_calls_used == before  # 关键:不占查询预算


def test_describe_tables_does_not_sample_values(ctx, table):
    """只给结构:不得出现表里的真实取值(远端库尤其不能把数据行带出来)。"""
    result = ai_agent_tools._describe_tables(ctx, DescribeTablesArgs(tables=[table]))
    assert "'ok'" not in result.model_text and "fail" not in result.model_text
    assert "verify literals with a bounded run_query" in result.model_text


def test_describe_tables_unauthorized_alias_rejected_per_table(ctx, table):
    """未授权别名只影响该行,其余表照常返回(单表失败不拖垮整批)。"""
    result = ai_agent_tools._describe_tables(
        ctx, DescribeTablesArgs(tables=[table, "rogue.public.orders"])
    )
    assert result.ok  # 仍有成功项
    assert f"{table}(" in result.model_text
    assert "is not authorized" in result.model_text


def test_describe_tables_missing_table_reported_not_raised(ctx, table):
    result = ai_agent_tools._describe_tables(
        ctx, DescribeTablesArgs(tables=[table, "no_such_table_xyz"])
    )
    assert result.ok
    assert "no_such_table_xyz: error:" in result.model_text


def test_describe_tables_caps_batch_size(ctx, table):
    result = ai_agent_tools._describe_tables(ctx, DescribeTablesArgs(tables=[table] * 12))
    assert "only the first 8 tables" in result.model_text


def test_describe_tables_empty_input_is_error(ctx):
    result = ai_agent_tools._describe_tables(ctx, DescribeTablesArgs(tables=[]))
    assert result.ok is False


def test_three_part_qualified_name_end_to_end(ctx, table, tmp_path):
    """三段名 alias.schema.table 全链路(guard → describe_tables → run_query)。

    用真实 DuckDB 文件挂载:它带 main schema,限定名天然是三段(与 PostgreSQL 的
    alias.public.table 同形),从而在没有 PG 环境时也能守住"PG 多 schema 可查"这条线。
    """
    import duckdb as _duckdb

    dbfile = tmp_path / "remote.duckdb"
    rc = _duckdb.connect(str(dbfile))
    rc.execute("CREATE TABLE targets(status VARCHAR, target INTEGER)")
    rc.execute("INSERT INTO targets VALUES ('ok', 100), ('fail', 50)")
    rc.close()
    ctx.attach_configs = [("agent_pgish", {"type": "duckdb", "path": str(dbfile)})]
    ctx.authorized_aliases = ["agent_pgish"]

    # 1) describe_tables 接受三段名并返回列定义(不采样数据行)
    desc = ai_agent_tools._describe_tables(
        ctx, DescribeTablesArgs(tables=[table, "agent_pgish.main.targets"])
    )
    assert desc.ok, desc.model_text
    assert "agent_pgish.main.targets(status VARCHAR, target INTEGER)" in desc.model_text
    assert "100" not in desc.model_text

    # 2) 三段名参与跨源 JOIN 能通过 guard 并执行出正确值
    sql = (
        f"SELECT t.status, count(*) AS n FROM {table} t "
        "JOIN agent_pgish.main.targets r ON t.status = r.status "
        "GROUP BY t.status ORDER BY t.status"
    )
    res = asyncio.run(ai_agent_tools.run_query_async(ctx, RunQueryArgs(sql=sql), 3))
    assert res.ok, res.model_text
    assert "125" in res.model_text


# ---- 结构缓存:进程内短 TTL、不落盘、可强制失效 ----

def test_attached_tables_cache_avoids_rescan_and_can_be_invalidated(ctx, tmp_path):
    """同一连接在 TTL 内复用缓存(不再连远端);invalidate 后重新读取并看到新表。"""
    import duckdb as _duckdb

    dbfile = tmp_path / "cache.duckdb"
    rc = _duckdb.connect(str(dbfile))
    rc.execute("CREATE TABLE t_one(a INTEGER)")
    rc.close()
    cfg = {"type": "duckdb", "path": str(dbfile)}
    ai_agent_tools.invalidate_attached_tables("cache_alias")

    names1, age1 = ai_agent_tools.attached_tables_cached("cache_alias", cfg)
    assert "cache_alias.t_one" in names1 and age1 == 0.0

    # 远端新增一张表,但 TTL 未到 → 仍返回缓存(证明没有重复扫描)
    rc = _duckdb.connect(str(dbfile))
    rc.execute("CREATE TABLE t_two(b INTEGER)")
    rc.close()
    names2, age2 = ai_agent_tools.attached_tables_cached("cache_alias", cfg)
    assert names2 == names1 and age2 >= 0.0

    # 用户点"刷新结构"/自愈失效 → 立刻看到新表
    ai_agent_tools.invalidate_attached_tables("cache_alias")
    names3, _ = ai_agent_tools.attached_tables_cached("cache_alias", cfg)
    assert "cache_alias.t_two" in names3


def test_attached_tables_cache_is_process_local_only():
    """缓存必须只在进程内存里(不落盘):清空后无任何持久化残留可用。"""
    ai_agent_tools.invalidate_attached_tables()
    assert ai_agent_tools._ATTACHED_CACHE == {}


# ---- 范围外表名建议(拒答后的「加入该表」按钮数据源) ----

def _ctx_with_scope(local_tables):
    from core.services.ai_sql_guard import ScopeLimits
    ctx = AgentRunCtx(run_id="r", authorized_aliases=[], attach_configs=[])
    ctx.scope_limits = ScopeLimits(local_tables=local_tables)
    return ctx


def test_out_of_scope_candidates_picks_real_but_unauthorized_table(tmp_path):
    """答复里点名的表:库里真有、又不在范围内 → 才给建议。"""
    from core.database.duckdb_engine import with_duckdb_connection
    from core.services.ai_agent_tools import out_of_scope_candidates

    with with_duckdb_connection() as con:
        con.execute("CREATE TABLE IF NOT EXISTS scope_hint_orders(id INTEGER)")
        con.execute("CREATE TABLE IF NOT EXISTS scope_hint_refunds(id INTEGER)")
    try:
        ctx = _ctx_with_scope(["scope_hint_refunds"])  # 只授权 refunds
        got = out_of_scope_candidates(ctx, "scope_hint_orders 不在当前范围内，请先加入。")
        assert got == ["scope_hint_orders"]
        # 已在范围内的不会被当成"缺失"
        assert out_of_scope_candidates(ctx, "scope_hint_refunds 有 4 条") == []
        # 编造的表名不进建议(只认真实存在的)
        assert out_of_scope_candidates(ctx, "nonexistent_table_xyz 不在范围内") == []
    finally:
        with with_duckdb_connection() as con:
            con.execute("DROP TABLE IF EXISTS scope_hint_orders")
            con.execute("DROP TABLE IF EXISTS scope_hint_refunds")


def test_out_of_scope_candidates_silent_without_limits():
    """未收窄范围时无所谓越界,不给建议。"""
    from core.services.ai_agent_tools import out_of_scope_candidates

    ctx = AgentRunCtx(run_id="r", authorized_aliases=[], attach_configs=[])
    assert out_of_scope_candidates(ctx, "任何表名") == []
