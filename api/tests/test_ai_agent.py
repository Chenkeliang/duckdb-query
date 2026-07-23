"""智能体循环状态机:脚本化 LLM + 真实 DuckDB 工具执行。

覆盖 2026-07-23 架构评审定稿的行为:一步 final、探查→final(最终 SQL 真实
执行断言值)、协议纠错恰一次、预算终止、闸拒绝作为 observation 回喂、
观测落账。协议失败不降级为普通 Chat。
"""

import asyncio
import json
import uuid

import pytest

from core.database.duckdb_engine import with_duckdb_connection
from core.database.duckdb_pool import with_system_connection
from core.services import ai_agent
from core.services.ai_agent import AgentLimits, run_agent
from core.services.ai_agent_tools import AgentRunCtx
from core.services.llm_client import LLMClientError


class FakeLLM:
    """按脚本吐回复;记录每次收到的 messages 供断言。"""

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    async def complete_async(self, feature, messages, *, timeout=None, num_retries=None):
        assert feature == "agent"
        self.calls.append([dict(m) for m in messages])
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def _ctx():
    return AgentRunCtx(
        run_id=f"agent_test_{uuid.uuid4().hex[:8]}",
        authorized_aliases=[],
        attach_configs=[],
        provider="p-test",
        model="m-test",
    )


def _collect(llm, ctx, question="问题", limits=None, messages=None):
    async def _run():
        events = []
        async for ev in run_agent(
            llm, ctx, messages or [{"role": "user", "content": question}],
            "ctx-block", limits=limits,
        ):
            events.append(ev)
        return events

    return asyncio.run(_run())


def _final(answer="答案", sql=None, evidence=None):
    return json.dumps(
        {"action": "final", "answer": answer, "sql": sql, "evidence": evidence or []},
        ensure_ascii=False,
    )


@pytest.fixture(name="table")
def _table():
    name = f"agent_loop_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f"CREATE TABLE {name}(id INTEGER, status VARCHAR)")
        con.execute(f"INSERT INTO {name} VALUES (1,'paid'),(2,'paid'),(3,'refunded')")
    yield name
    with with_duckdb_connection() as con:
        con.execute(f"DROP TABLE IF EXISTS {name}")


def test_simple_question_finishes_in_one_call(table):
    sql = f"SELECT count(*) FROM {table}"
    llm = FakeLLM([_final("共 3 行", sql=sql, evidence=[])])
    events = _collect(llm, _ctx())
    names = [e["event"] for e in events]
    assert names == ["run_started", "answer", "done"]
    answer = events[1]
    assert answer["termination_reason"] == "completed"
    # AGENTS §10:最终 SQL 必须能真实执行出正确值
    with with_duckdb_connection() as con:
        assert con.execute(answer["sql"]).fetchone()[0] == 3
    assert len(llm.calls) == 1


def test_explore_then_final_with_observation_flow(table):
    query = f"SELECT count(*) AS n FROM {table} WHERE status='paid'"
    llm = FakeLLM([
        json.dumps({"action": "run_query", "args": {"sql": query}}),
        _final("已支付 2 笔", sql=query, evidence=["t1"]),
    ])
    ctx = _ctx()
    events = _collect(llm, ctx)
    names = [e["event"] for e in events]
    assert names == ["run_started", "tool_started", "tool_completed", "answer", "done"]
    assert events[2]["ok"] is True
    assert ctx.sql_calls_used == 1
    # 第二次调用的最后一条 user 消息应是 observation(含结果与预算)
    obs = json.loads(llm.calls[1][-1]["content"])
    assert obs["observation"]["tool_call_id"] == "t1"
    assert "2" in obs["observation"]["result"]
    assert obs["budget"]["sql_left"] == 2
    assert events[3]["evidence"] == ["t1"]


def test_protocol_correction_once_then_success(table):
    llm = FakeLLM(["我不想输出 JSON", _final("好的")])
    events = _collect(llm, _ctx())
    assert [e["event"] for e in events] == ["run_started", "answer", "done"]
    hint = json.loads(llm.calls[1][-1]["content"])
    assert hint["observation"]["error"] == "invalid_action"


def test_protocol_violation_terminates_without_fallback():
    llm = FakeLLM(["垃圾1", "垃圾2"])
    events = _collect(llm, _ctx())
    error = events[1]
    assert error["event"] == "error"
    assert error["termination_reason"] == "protocol_violation"
    assert events[-1]["event"] == "done"
    assert len(llm.calls) == 2  # 不再有第三次(不降级为普通 Chat)


def test_llm_budget_exhausted(table):
    step = json.dumps({"action": "search_tables", "args": {"query": "x"}})
    llm = FakeLLM([step, step])
    events = _collect(llm, _ctx(), limits=AgentLimits(llm_calls=2))
    error = [e for e in events if e["event"] == "error"][0]
    assert error["termination_reason"] == "budget_llm"


def test_sql_budget_rejection_is_observation_not_termination(table):
    q = json.dumps({"action": "run_query", "args": {"sql": f"SELECT 1 FROM {table}"}})
    llm = FakeLLM([q, q, _final("只查到一次")])
    ctx = _ctx()
    events = _collect(llm, ctx, limits=AgentLimits(sql_calls=1))
    completed = [e for e in events if e["event"] == "tool_completed"]
    assert completed[0]["ok"] is True
    assert completed[1]["ok"] is False  # 预算耗尽 → observation,不终止
    assert ctx.sql_calls_used == 1
    assert events[-2]["event"] == "answer"


def test_guard_rejection_fed_back_and_recovered(table):
    good = f"SELECT count(*) AS n FROM {table}"
    llm = FakeLLM([
        json.dumps({"action": "run_query",
                    "args": {"sql": "SELECT * FROM read_csv('/etc/passwd')"}}),
        json.dumps({"action": "run_query", "args": {"sql": good}}),
        _final("3 行", sql=good),
    ])
    ctx = _ctx()
    events = _collect(llm, ctx)
    completed = [e for e in events if e["event"] == "tool_completed"]
    assert completed[0]["ok"] is False and completed[1]["ok"] is True
    assert ctx.sql_rejected == 1
    obs = json.loads(llm.calls[1][-1]["content"])
    assert "not allowed" in obs["observation"]["result"]


def test_unsafe_final_sql_is_stripped(table):
    llm = FakeLLM([_final("删好了", sql=f"DELETE FROM {table}")])
    events = _collect(llm, _ctx())
    assert events[1]["event"] == "answer"
    assert events[1]["sql"] is None
    with with_duckdb_connection() as con:  # 数据必须原样还在
        assert con.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 3


def test_provider_error_terminates_honestly():
    llm = FakeLLM([LLMClientError("upstream down")])
    events = _collect(llm, _ctx())
    error = events[1]
    assert error["event"] == "error"
    assert error["termination_reason"] == "provider_error"


def test_run_recorded_to_observability(table):
    ctx = _ctx()
    llm = FakeLLM([_final("done")])
    _collect(llm, ctx)
    with with_system_connection() as conn:
        row = conn.execute(
            "SELECT termination_reason, llm_calls, provider FROM system_agent_runs "
            "WHERE run_id = ?", [ctx.run_id],
        ).fetchone()
    assert row == ("completed", 1, "p-test")
