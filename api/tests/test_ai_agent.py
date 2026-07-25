"""统一 Agent Engine × 5 Profile 回归:脚本化 LLM + 真实 DuckDB。

覆盖(2026-07-24 统一 Agent 定稿):每 Profile 严格输入输出契约、工具隔离、
generate_sql 不执行最终查询而走 EXPLAIN observation、repair_sql 可校验 fixed_sql、
ChartSpec 非法回退、output_model 纠错一次、加 Profile/Tool 不改 Loop、
SQL 类 Profile 真实 DuckDB EXPLAIN 校验。
"""

import asyncio
import json
import uuid

import pytest

from core.database.duckdb_engine import with_duckdb_connection
from core.database.duckdb_pool import with_system_connection
from core.services import ai_agent, ai_profiles
from core.services.ai_agent_tools import AgentRunCtx


class FakeLLM:
    """按脚本吐回复;记录每次收到的 (feature, messages)。"""

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    async def complete_async(self, feature, messages, *, timeout=None, num_retries=None):
        self.calls.append((feature, [dict(m) for m in messages]))
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def _ctx():
    return AgentRunCtx(
        run_id=f"agent_test_{uuid.uuid4().hex[:8]}",
        authorized_aliases=[], attach_configs=[],
        provider="p-test", model="m-test",
    )


def _run(llm, mode, *, inp, context=None, messages=None):
    profile = ai_profiles.get_profile(mode)
    ctx = _ctx()

    async def _collect():
        events = []
        async for ev in ai_agent.run_agent(
            llm, profile, ctx, inp=inp, context=context or {}, messages=messages
        ):
            events.append(ev)
        return events, ctx

    return asyncio.run(_collect())


def _final(events):
    return next((e for e in events if e["event"] == "answer"), None)


def _err(events):
    return next((e for e in events if e["event"] == "error"), None)


@pytest.fixture(name="orders")
def _orders():
    name = f"agent_p_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f"CREATE TABLE {name}(order_id INTEGER, status VARCHAR)")
        con.execute(f"INSERT INTO {name} VALUES (1,'paid'),(2,'paid'),(3,'refunded')")
    yield name
    with with_duckdb_connection() as con:
        con.execute(f"DROP TABLE IF EXISTS {name}")


@pytest.fixture(name="events")
def _events():
    name = f"agent_ev_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f"CREATE TABLE {name}(event_type VARCHAR, properties JSON)")
        con.execute(
            "INSERT INTO " + name + " VALUES "
            "('purchase','{\"device\":\"iOS\"}'),('purchase','{\"device\":\"iOS\"}'),"
            "('purchase','{\"device\":\"Web\"}'),('view','{\"device\":\"iOS\"}')"
        )
    yield name
    with with_duckdb_connection() as con:
        con.execute(f"DROP TABLE IF EXISTS {name}")


# ---------- data_qa ----------

def test_data_qa_explore_then_final_executes(orders):
    q = f"SELECT count(*) AS n FROM {orders} WHERE status='paid'"
    llm = FakeLLM([
        json.dumps({"action": "run_query", "args": {"sql": q}}),
        json.dumps({"action": "final", "result": {
            "content": "已支付 2 笔", "sql": q, "evidence": ["t1"]}}),
    ])
    events, ctx = _run(llm, "data_qa", inp={"messages": [
        {"role": "user", "content": "已支付几笔"}]})
    ans = _final(events)
    assert ans["termination_reason"] == "completed"
    assert ans["result"]["content"] == "已支付 2 笔"
    assert ans["result"]["evidence"] == ["t1"]
    with with_duckdb_connection() as con:  # 最终 SQL 真实执行(AGENTS §10)
        assert con.execute(ans["result"]["sql"]).fetchone()[0] == 2
    assert ctx.sql_calls_used == 1
    assert llm.calls[0][0] == "data_qa"  # model_feature 正确


def test_data_qa_runtime_error_observation_then_self_repair(events):
    """回归 scenario 21:模型首用复合谓词 JSON `->>` 触发执行期 ConversionException,
    Engine 把它作为失败 observation 回喂(而非 internal_error 终止),模型据错改用
    json_extract_string 自修复,最终返回正确数字 2 且最终 SQL 独立执行 = 真值。"""
    bad = (f"SELECT count(*) AS n FROM {events} "
           f"WHERE event_type='purchase' AND properties->>'device'='iOS'")
    good = (f"SELECT count(*) AS n FROM {events} "
            f"WHERE event_type='purchase' AND json_extract_string(properties,'$.device')='iOS'")
    llm = FakeLLM([
        json.dumps({"action": "run_query", "args": {"sql": bad}}),   # 执行期报错 → observation
        json.dumps({"action": "run_query", "args": {"sql": good}}),  # 据错自修复
        json.dumps({"action": "final", "result": {
            "content": "iOS 设备产生了 2 个 purchase 事件", "sql": good, "evidence": ["t2"]}}),
    ])
    events_out, ctx = _run(llm, "data_qa", inp={"messages": [
        {"role": "user", "content": "iOS 设备产生了多少个 purchase 事件"}]})
    ans = _final(events_out)
    assert _err(events_out) is None  # 绝不再是 internal_error
    assert ans is not None and ans["termination_reason"] == "completed"
    assert "2" in ans["result"]["content"]
    tool_done = [e for e in events_out if e["event"] == "tool_completed"]
    assert tool_done[0]["ok"] is False  # 首个 ->> 查询作失败 observation 回喂
    assert tool_done[1]["ok"] is True   # 自修复后成功
    assert ctx.sql_calls_used == 2      # 两次探查都消耗预算
    with with_duckdb_connection() as con:
        assert con.execute(ans["result"]["sql"]).fetchone()[0] == 2


def test_classify_protocol_miss_categories():
    """protocol_violation 诊断分类:无 JSON / 有 JSON 缺 action / action 未知(诊断日志据此归类)。"""
    from core.services.ai_agent import _classify_protocol_miss
    assert _classify_protocol_miss({}, None) == "no_json_object"
    assert _classify_protocol_miss("散文回复没有 JSON", None) == "no_json_object"
    assert _classify_protocol_miss({"foo": 1}, None) == "json_without_action_key"
    assert _classify_protocol_miss({"action": "bogus"}, "bogus") == "unknown_action:'bogus'"


def test_data_qa_protocol_violation_after_one_reformat(orders):
    """连续两次非法 action → 一次 reformat 后仍失败 → 诚实终止 protocol_violation,
    不编造答案、不变 internal_error。"""
    llm = FakeLLM(["not json at all", json.dumps({"action": "nope"})])
    events, _ = _run(llm, "data_qa", inp={"messages": [{"role": "user", "content": "hi"}]})
    err = _err(events)
    assert err is not None and err["termination_reason"] == "protocol_violation"
    assert _final(events) is None


def test_data_qa_final_trailing_brace_recovered_and_validated(orders):
    """实测 protocol_violation 主因:final 动作 JSON 末尾多一个 } → extract_json 配平恢复,
    恢复出的 FinalAction 仍走 output_model(Pydantic)校验、grounding 门控与 finalize。
    (先 run_query 真跑,再用尾多一个 } 的 final,验证配平恢复 + grounding 同时生效。)"""
    good = f"SELECT count(*) AS n FROM {orders} WHERE status='paid'"
    raw_final = ('{"action":"final","result":{"content":"已支付 2 笔","sql":"' + good
                 + '","evidence":["t1"]}}}')  # 末尾多一个 }(旧解析会 protocol_violation)
    llm = FakeLLM([
        json.dumps({"action": "run_query", "args": {"sql": good}}),  # 先跑,满足 grounding
        raw_final,
    ])
    events, _ = _run(llm, "data_qa", inp={"messages": [{"role": "user", "content": "几笔"}]})
    ans = _final(events)
    assert _err(events) is None
    assert ans is not None and ans["termination_reason"] == "completed"
    assert ans["result"]["content"] == "已支付 2 笔"
    assert ans["result"]["evidence"] == ["t1"]
    assert len(llm.calls) == 2  # run_query → final(配平恢复),无 reformat


def test_data_qa_recovers_run_query_from_sql_fence(orders):
    """实测残余 protocol_violation 形态:模型首轮用 ```sql 围栏(非 JSON 协议)表达探查意图
    → 引擎 recover_sql_action 恢复为一次 run_query 探查(真实执行、过 SQL 安全校验),模型据
    观察给出最终答案。全程无 reformat、无 protocol_violation。"""
    good = f"SELECT count(*) AS n FROM {orders} WHERE status='paid'"
    llm = FakeLLM([
        f"我先跑一下查询确认。\n\n```sql\n{good}\n```",  # 非 JSON,靠 recover_sql_action 纠错
        json.dumps({"action": "final", "result": {
            "content": "已支付 2 笔", "sql": good, "evidence": ["t1"]}}),
    ])
    events, ctx = _run(llm, "data_qa", inp={"messages": [{"role": "user", "content": "几笔"}]})
    ans = _final(events)
    assert _err(events) is None
    assert ans is not None and ans["termination_reason"] == "completed"
    assert ans["result"]["content"] == "已支付 2 笔"
    tool_done = [e for e in events if e["event"] == "tool_completed"]
    assert len(tool_done) == 1 and tool_done[0]["ok"] is True  # 恢复的探查真实执行
    assert ctx.sql_calls_used == 1
    assert len(llm.calls) == 2  # 无 reformat 额外调用
    # 安全边界:恢复调用正常计入 steps/sql_calls/tool_calls(审计口径),不被隐藏
    done = next(e for e in events if e["event"] == "done")
    assert done["usage"]["sql_calls"] == 1
    assert done["usage"]["tool_calls"] == 1
    assert done["usage"]["steps"] >= 1


def test_non_tool_profile_does_not_recover_sql_fence():
    """安全边界:run_query 未在 profile.allowed_tools(explain_sql 无任何工具)时,```sql
    围栏不得被恢复执行——不产生任何工具调用,也不消耗 sql_calls。"""
    llm = FakeLLM([
        "```sql\nSELECT 1\n```",  # 非 JSON;explain_sql 不允许 run_query → 不得恢复
        json.dumps({"action": "final", "result": {"explanation": "这条 SQL 返回常量 1"}}),
    ])
    events, ctx = _run(llm, "explain_sql", inp={"sql": "SELECT 1"}, context={"locale": "zh"})
    assert not [e for e in events if e["event"] == "tool_completed"]  # 未恢复执行任何查询
    assert ctx.sql_calls_used == 0


def test_data_qa_ungrounded_final_rejected_then_grounded(orders):
    """静默错误防线:首个 FinalAction 带**没跑过**的 SQL(相当于拿 schema 样例直接算)→
    被 grounding 门控拒为 observation,不 completed;模型先 run_query 真跑、再用同一条 SQL
    final 才通过,且最终 SQL 独立执行与真值一致。"""
    q = f"SELECT status, count(*) AS n FROM {orders} GROUP BY status ORDER BY status"
    llm = FakeLLM([
        json.dumps({"action": "final", "result": {  # ungrounded:没跑过就答
            "content": "（未查直接答）", "sql": q, "evidence": []}}),
        json.dumps({"action": "run_query", "args": {"sql": q}}),  # 真跑
        json.dumps({"action": "final", "result": {  # grounded:同一条 SQL
            "content": "按状态汇总完成", "sql": q, "evidence": ["t1"]}}),
    ])
    events, ctx = _run(llm, "data_qa", inp={"messages": [{"role": "user", "content": "按状态汇总"}]})
    ans = _final(events)
    assert _err(events) is None
    assert ans is not None and ans["termination_reason"] == "completed"
    assert ans["result"]["sql"] == q
    assert ctx.sql_calls_used == 1
    assert len([e for e in events if e["event"] == "tool_completed"]) == 1
    assert len(llm.calls) == 3  # final(拒)→ run_query → final(过)
    with with_duckdb_connection() as con:  # 最终 SQL 独立执行 = 真值(paid 2 / refunded 1)
        got = dict(con.execute(ans["result"]["sql"]).fetchall())
    assert got == {"paid": 2, "refunded": 1}


def test_data_qa_execute_a_answer_b_rejected(orders):
    """执行 A、回答 B:跑了查询 A,却 final 一条**没跑过**的 B → grounding 拒绝;
    只有改回跑过的 A 才通过(按规范化内容匹配,非仅 sql_calls>0)。"""
    a = f"SELECT count(*) AS n FROM {orders} WHERE status='paid'"
    b = f"SELECT count(*) AS n FROM {orders} WHERE status='refunded'"
    llm = FakeLLM([
        json.dumps({"action": "run_query", "args": {"sql": a}}),
        json.dumps({"action": "final", "result": {"content": "x", "sql": b, "evidence": ["t1"]}}),
        json.dumps({"action": "final", "result": {"content": "y", "sql": a, "evidence": ["t1"]}}),
    ])
    events, _ = _run(llm, "data_qa", inp={"messages": [{"role": "user", "content": "几笔"}]})
    ans = _final(events)
    assert ans is not None and ans["termination_reason"] == "completed"
    assert ans["result"]["sql"] == a  # 只有真跑过的 A 能通过
    assert len(llm.calls) == 3


def test_data_qa_refuse_completes_directly(orders):
    """安全拒绝走独立 refuse 动作:content-only、不过 grounding、直接完成,sql 强制 null。
    (取代旧的"sql=null 的 final 直接完成"——那条路已被 grounding 严格封死,见下一 test。)"""
    llm = FakeLLM([json.dumps({"action": "refuse", "result": {
        "content": "我是只读数据代理,无法删除数据。"}})])
    events, _ = _run(llm, "data_qa", inp={"messages": [{"role": "user", "content": "删除订单"}]})
    ans = _final(events)
    assert _err(events) is None
    assert ans is not None and ans["termination_reason"] == "completed"
    assert ans["result"]["sql"] is None and ans["result"]["content"]
    assert len(llm.calls) == 1  # 无需查询,直接完成


def test_data_qa_refuse_forces_sql_null(orders):
    """refuse 不承载数据答复:即便模型在 result 里塞了 sql/evidence,也强制清空。"""
    llm = FakeLLM([json.dumps({"action": "refuse", "result": {
        "content": "拒绝写库", "sql": f"DELETE FROM {orders}", "evidence": ["x"]}})])
    events, _ = _run(llm, "data_qa", inp={"messages": [{"role": "user", "content": "删"}]})
    ans = _final(events)
    assert ans is not None and ans["termination_reason"] == "completed"
    assert ans["result"]["sql"] is None and ans["result"]["evidence"] == []


def test_data_qa_null_sql_final_rejected(orders):
    """data answer 的 final 必须绑定跑过的 SELECT:sql=null 不再放行(旧漏洞),
    始终 null 且步数耗尽 → ungrounded_final,绝不 completed。"""
    llm = FakeLLM([json.dumps({"action": "final", "result": {
        "content": "共 3 笔", "sql": None, "evidence": []}})] * 12)
    events, _ = _run(llm, "data_qa", inp={"messages": [{"role": "user", "content": "多少笔"}]})
    assert _final(events) is None  # 不再借空 sql 溜过
    err = _err(events)
    assert err is not None and err["termination_reason"] == "ungrounded_final"


def test_data_qa_refuse_rejected_for_non_data_qa_profile():
    """refuse 是 data_qa 专属终止动作:未声明 refuse 的 profile(generate_sql)收到它按协议违规处理。"""
    llm = FakeLLM([json.dumps({"action": "refuse", "result": {"content": "no"}}),
                   json.dumps({"action": "refuse", "result": {"content": "no"}}),
                   json.dumps({"action": "refuse", "result": {"content": "no"}})])
    events, _ = _run(llm, "generate_sql", inp={"question": "x"})
    assert _final(events) is None
    err = _err(events)
    assert err is not None and err["termination_reason"] == "protocol_violation"


def test_data_qa_ungrounded_final_terminates_ungrounded_when_no_budget(orders):
    """预算耗尽仍 ungrounded(始终答没跑过的 SQL)→ 诚实终止 ungrounded_final,绝不 completed。"""
    q = f"SELECT count(*) AS n FROM {orders}"
    llm = FakeLLM([json.dumps({"action": "final", "result": {
        "content": "x", "sql": q, "evidence": []}})] * 12)
    events, _ = _run(llm, "data_qa", inp={"messages": [{"role": "user", "content": "多少"}]})
    err = _err(events)
    assert _final(events) is None  # 绝不返回 completed
    assert err is not None and err["termination_reason"] == "ungrounded_final"


def test_data_qa_unsafe_final_sql_rejected_not_stripped(orders):
    """写库 SQL 的 final 不再被 finalize 抹成 null 报假成功(旧漏洞:completed + "已删除" +
    sql=null):严格拒绝 → ungrounded_final,数据不变;声明拒绝应改用 refuse。"""
    llm = FakeLLM([json.dumps({"action": "final", "result": {
        "content": "已删除 3 行", "sql": f"DELETE FROM {orders}", "evidence": []}})] * 12)
    events, _ = _run(llm, "data_qa", inp={"messages": [{"role": "user", "content": "删"}]})
    assert _final(events) is None  # 不再假成功
    err = _err(events)
    assert err is not None and err["termination_reason"] == "ungrounded_final"
    with with_duckdb_connection() as con:
        assert con.execute(f"SELECT count(*) FROM {orders}").fetchone()[0] == 3


def test_data_qa_final_with_sql_fence_in_content_not_recovered(orders):
    """Bug5:合法 final 的 content 里含 ```sql 代码块,不得被 SQL recovery 改写成 run_query;
    照常走 grounding 完成,且不额外多跑一次。"""
    q = f"SELECT count(*) AS n FROM {orders}"
    llm = FakeLLM([
        json.dumps({"action": "run_query", "args": {"sql": q}}),
        json.dumps({"action": "final", "result": {
            "content": "结果:\n```sql\nSELECT ...\n```", "sql": q, "evidence": ["t1"]}}),
    ])
    events, _ = _run(llm, "data_qa", inp={"messages": [{"role": "user", "content": "多少"}]})
    ans = _final(events)
    assert ans is not None and ans["termination_reason"] == "completed"
    assert ans["result"]["sql"] == q
    assert len(llm.calls) == 2  # 未被 recovery 改写、未额外多跑


# ---------- generate_sql (EXPLAIN loop, no data execution) ----------

def test_generate_sql_explain_repair_loop(orders):
    bad = f"SELECT count(*) FROM {orders} WHERE statuss='paid'"  # 列名错
    good = f"SELECT count(*) AS n FROM {orders} WHERE status='paid'"
    llm = FakeLLM([
        json.dumps({"action": "final", "result": {"sql": bad, "used_tables": [orders]}}),
        json.dumps({"action": "final", "result": {"sql": good, "used_tables": [orders]}}),
    ])
    events, ctx = _run(llm, "generate_sql", inp={"question": "已支付几笔"},
                       context={"tables": [orders]})
    ans = _final(events)
    assert ans["termination_reason"] == "completed"
    assert ans["result"]["sql"] == good
    assert ans["result"]["safe"] is True
    assert len(llm.calls) == 2  # EXPLAIN 失败 → observation → 修正
    # 无工具调用事件(generate_sql 不执行数据查询)
    assert not [e for e in events if e["event"] == "tool_completed"]


def test_generate_sql_output_reject_on_bad_shape(orders):
    # final 但 result 缺必填 sql → output_schema_invalid → 纠错一次仍缺 → reject
    llm = FakeLLM([
        json.dumps({"action": "final", "result": {"used_tables": [orders]}}),
        json.dumps({"action": "final", "result": {"nope": 1}}),
    ])
    events, _ = _run(llm, "generate_sql", inp={"question": "?"}, context={"tables": [orders]})
    ans = _final(events)
    assert ans["termination_reason"] == "output_invalid"  # reject → answer(result=None)
    assert ans["result"] is None


def test_generate_sql_safe_is_server_derived_not_model(orders):
    """safe 由后端 is_select_only 重算,不采信模型:模型对有效只读 SQL 谎报
    safe:false,最终必须被后端改为 true。output_model 不含 safe(model_dump 丢弃模型
    传入的 safe),由 finalize 追加。"""
    good = f"SELECT count(*) AS n FROM {orders} WHERE status='paid'"
    llm = FakeLLM([json.dumps({"action": "final", "result": {
        "sql": good, "used_tables": [orders], "safe": False}})])  # 模型谎报 false
    events, _ = _run(llm, "generate_sql", inp={"question": "?"}, context={"tables": [orders]})
    ans = _final(events)
    assert ans["termination_reason"] == "completed"
    assert ans["result"]["sql"] == good
    assert ans["result"]["safe"] is True  # 后端重算覆盖模型的 false


# ---------- repair_sql ----------

def test_repair_sql_returns_validatable_fix(orders):
    good = f"SELECT count(*) AS n FROM {orders} WHERE status='paid'"
    llm = FakeLLM([json.dumps({"action": "final", "result": {
        "explanation": "列名写错", "fixed_sql": good}})])
    events, _ = _run(llm, "repair_sql",
                     inp={"sql": f"SELECT x FROM {orders}", "error": "Binder Error"},
                     context={"tables": [orders]})
    ans = _final(events)
    assert ans["result"]["safe"] is True
    assert ans["result"]["fixed_sql"] == good
    with with_duckdb_connection() as con:
        assert con.execute(ans["result"]["fixed_sql"]).fetchone()[0] == 2


def test_repair_sql_null_when_impossible(orders):
    llm = FakeLLM([json.dumps({"action": "final", "result": {
        "explanation": "无法修复", "fixed_sql": None}})])
    events, _ = _run(llm, "repair_sql", inp={"sql": "???", "error": "e"},
                     context={"tables": [orders]})
    ans = _final(events)
    assert ans["result"]["fixed_sql"] is None
    assert ans["result"]["safe"] is False


def test_repair_sql_safe_false_despite_model_claim(orders):
    """safe 不采信模型:模型谎报 fixed_sql:null 却 safe:true,后端必须判定 safe:false
    (fixed_sql 为空 → 无可应用的修复,前端据此禁用"应用修复")。"""
    llm = FakeLLM([json.dumps({"action": "final", "result": {
        "explanation": "无法修复", "fixed_sql": None, "safe": True}})])  # 模型谎报 true
    events, _ = _run(llm, "repair_sql", inp={"sql": "???", "error": "e"},
                     context={"tables": [orders]})
    ans = _final(events)
    assert ans["result"]["fixed_sql"] is None
    assert ans["result"]["safe"] is False  # 后端重算覆盖模型的 true


# ---------- explain_sql (no tools, max_steps=1) ----------

def test_explain_sql_returns_explanation(orders):
    llm = FakeLLM([json.dumps({"action": "final", "result": {
        "explanation": "这条 SQL 数已支付订单。"}})])
    events, _ = _run(llm, "explain_sql", inp={"sql": f"SELECT count(*) FROM {orders}"})
    assert _final(events)["result"]["explanation"].startswith("这条 SQL")


def test_explain_sql_tool_isolation(orders):
    """explain_sql 无工具:模型若调 run_query → invalid_action(纠错一次后诚实终止)。"""
    llm = FakeLLM([
        json.dumps({"action": "run_query", "args": {"sql": "SELECT 1"}}),
        json.dumps({"action": "run_query", "args": {"sql": "SELECT 1"}}),
    ])
    events, ctx = _run(llm, "explain_sql", inp={"sql": "SELECT 1"})
    assert _err(events)["termination_reason"] == "protocol_violation"
    assert ctx.sql_calls_used == 0  # 从未执行查询


# ---------- suggest_chart (ChartSpec, fallback) ----------

def test_suggest_chart_valid_spec():
    llm = FakeLLM([json.dumps({"action": "final", "result": {
        "type": "line", "x": "day", "y": ["amount"], "agg": "sum", "reason": "趋势"}})])
    events, _ = _run(llm, "suggest_chart", inp={
        "columns": [{"name": "day", "type": "DATE"}, {"name": "amount", "type": "DOUBLE"}],
        "sample": [{"day": "2026-07-01", "amount": 10}]})
    ans = _final(events)
    assert ans["result"]["type"] == "line"


def test_suggest_chart_invalid_falls_back():
    """ChartSpec 非法(bogus type)纠错一次仍失败 → fallback(result=None,前端用 defaultSpec)。"""
    llm = FakeLLM([
        json.dumps({"action": "final", "result": {"type": "bogus"}}),
        json.dumps({"action": "final", "result": {"type": "still_bad"}}),
    ])
    events, _ = _run(llm, "suggest_chart", inp={"columns": [{"name": "a", "type": "INT"}], "sample": []})
    ans = _final(events)
    assert ans["termination_reason"] == "output_invalid"
    assert ans["result"] is None  # fallback → 前端 defaultSpec


def test_output_repair_recovers_once():
    """output 纠错一次成功:第一次 shape 错、第二次对。"""
    llm = FakeLLM([
        json.dumps({"action": "final", "result": {"type": "notachart"}}),
        json.dumps({"action": "final", "result": {"type": "bar", "x": "a", "y": ["b"]}}),
    ])
    events, _ = _run(llm, "suggest_chart", inp={
        "columns": [{"name": "a", "type": "X"}, {"name": "b", "type": "Y"}], "sample": []})
    assert _final(events)["result"]["type"] == "bar"


# ---------- 扩展性:加 Profile / Tool 不改 Loop ----------

def test_register_new_profile_without_touching_engine(orders, monkeypatch):
    """注册一个测试 Profile,Engine run_agent 一行不改即可驱动它。"""
    probe = ai_profiles.AgentProfile(
        mode="test_probe", model_feature="test_probe",
        system_prompt='{{"action":"final","result":{{"explanation":"x"}}}}\n{context}',
        allowed_tools=(), input_model=ai_profiles.ExplainInput,
        output_model=ai_profiles.ExplainResult, output_error_policy="typed_error",
        build_context=lambda i, c, r: "(none)",
        build_user_message=lambda i: "go", max_steps=1, max_sql_calls=0,
    )
    monkeypatch.setitem(ai_profiles.PROFILES, "test_probe", probe)
    llm = FakeLLM([json.dumps({"action": "final", "result": {"explanation": "新 Profile 生效"}})])
    events, _ = _run(llm, "test_probe", inp={})
    assert _final(events)["result"]["explanation"] == "新 Profile 生效"


def test_run_recorded_with_mode(orders):
    llm = FakeLLM([json.dumps({"action": "final", "result": {"explanation": "e"}})])
    _, ctx = _run(llm, "explain_sql", inp={"sql": "SELECT 1"})
    with with_system_connection() as conn:
        row = conn.execute(
            "SELECT mode, llm_calls, termination_reason FROM system_agent_runs WHERE run_id=?",
            [ctx.run_id]).fetchone()
    assert row == ("explain_sql", 1, "completed")


# ---------- 回归:2026-07-24 评审 7 项 ----------

def test_generate_sql_never_returns_unvalidated_as_completed(orders):
    """#1 安全:连续三次无效 SQL(EXPLAIN 恒失败)必须 reject(result=null),
    绝不把 'SELECT missing FROM nowhere' 当 safe:true/completed 返回。"""
    bad = "SELECT missing FROM nowhere"
    llm = FakeLLM([json.dumps({"action": "final", "result": {
        "sql": bad, "used_tables": []}})] * 3)
    events, _ = _run(llm, "generate_sql", inp={"question": "?"}, context={"tables": [orders]})
    ans = _final(events)
    assert ans["termination_reason"] == "sql_validation_failed"
    assert ans["result"] is None


def test_repair_sql_never_returns_unvalidated_as_completed(orders):
    """#1:repair 连续三次 fixed_sql 都过不了 EXPLAIN → sql_validation_failed / null。"""
    bad = "SELECT nope FROM ghost_table"
    llm = FakeLLM([json.dumps({"action": "final", "result": {
        "explanation": "试", "fixed_sql": bad}})] * 3)
    events, _ = _run(llm, "repair_sql", inp={"sql": "x", "error": "e"},
                     context={"tables": [orders]})
    ans = _final(events)
    assert ans["termination_reason"] == "sql_validation_failed"
    assert ans["result"] is None


def test_non_dict_result_treated_as_schema_invalid(orders):
    """#2:result 是字符串/数组不能变 internal_error,应作 output_schema_invalid 修复一次。"""
    llm = FakeLLM([
        json.dumps({"action": "final", "result": "just a string"}),  # 非 dict
        json.dumps({"action": "final", "result": {"explanation": "对了"}}),
    ])
    events, _ = _run(llm, "explain_sql", inp={"sql": "SELECT 1"})
    assert _final(events)["result"]["explanation"] == "对了"


def test_llm_call_hard_cap_counts_reformats(orders):
    """#5:格式重试计入真实 LLM 调用;总上限 = max_steps + max_output_repairs。
    explain_sql(max_steps=1, repairs=1)= 上限 2:两次都非 final → budget_llm,llm_calls=2。"""
    llm = FakeLLM(["garbage1", "garbage2", "garbage3"])
    events, ctx = _run(llm, "explain_sql", inp={"sql": "SELECT 1"})
    assert ctx.llm_calls == 2  # 不超过 1+1
    assert len(llm.calls) == 2


def test_suggest_chart_cross_validates_columns():
    """#6:x/y 必须是真实列名;非法一次修复,仍失败 → fallback(null)。"""
    llm = FakeLLM([
        json.dumps({"action": "final", "result": {"type": "bar", "x": "ghost", "y": []}}),
        json.dumps({"action": "final", "result": {"type": "bar", "x": "also_ghost", "y": []}}),
    ])
    events, _ = _run(llm, "suggest_chart", inp={
        "columns": [{"name": "real_col", "type": "INT"}], "sample": []})
    ans = _final(events)
    assert ans["result"] is None  # 交叉校验失败 → fallback


def test_suggest_chart_invalid_xbin_repaired():
    """#6:xBin 只接受 day/month;非法值触发修复。"""
    llm = FakeLLM([
        json.dumps({"action": "final", "result": {"type": "line", "x": "d", "y": ["v"], "xBin": "week"}}),
        json.dumps({"action": "final", "result": {"type": "line", "x": "d", "y": ["v"], "xBin": "day"}}),
    ])
    events, _ = _run(llm, "suggest_chart", inp={
        "columns": [{"name": "d", "type": "DATE"}, {"name": "v", "type": "INT"}], "sample": []})
    assert _final(events)["result"]["xBin"] == "day"


def test_explain_counts_as_sql_call(orders):
    """残留#1:generate_sql 的 EXPLAIN 必须计入 sql_calls(此前有效 SELECT 完成仍是 0)。"""
    good = f"SELECT count(*) AS n FROM {orders}"
    llm = FakeLLM([json.dumps({"action": "final", "result": {"sql": good, "used_tables": [orders]}})])
    events, ctx = _run(llm, "generate_sql", inp={"question": "几行"}, context={"tables": [orders]})
    assert _final(events)["termination_reason"] == "completed"
    assert ctx.sql_calls_used == 1  # 一次 EXPLAIN


def test_context_builder_error_still_records_and_emits_done(orders, monkeypatch):
    """残留#2:ContextBuilder 抛错也要走统一 error + 落账 + done,不静默丢失。"""
    profile = ai_profiles.get_profile("explain_sql")
    monkeypatch.setattr(profile, "build_context",
                        lambda i, c, r: (_ for _ in ()).throw(RuntimeError("ctx boom")))
    llm = FakeLLM([json.dumps({"action": "final", "result": {"explanation": "x"}})])
    ctx = AgentRunCtx(run_id="r_ctxfail", authorized_aliases=[], attach_configs=[])

    async def _collect():
        return [ev async for ev in ai_agent.run_agent(
            llm, profile, ctx, inp={"sql": "SELECT 1"}, context={})]

    events = asyncio.run(_collect())
    names = [e["event"] for e in events]
    assert "error" in names and names[-1] == "done"  # 有 error 且以 done 收尾
    assert next(e for e in events if e["event"] == "error")["termination_reason"] == "internal_error"
    with with_system_connection() as conn:
        row = conn.execute(
            "SELECT termination_reason FROM system_agent_runs WHERE run_id=?", ["r_ctxfail"]).fetchone()
    assert row == ("internal_error",)  # 落账


def test_session_id_echoed_not_persisted():
    """#7:session_id 回显在 run_started/done,但不落库(不做会话历史)。"""
    llm = FakeLLM([json.dumps({"action": "final", "result": {"explanation": "e"}})])
    profile = ai_profiles.get_profile("explain_sql")
    ctx = AgentRunCtx(run_id="r_sess", authorized_aliases=[], attach_configs=[],
                      session_id="sess-123")

    async def _collect():
        return [ev async for ev in ai_agent.run_agent(
            llm, profile, ctx, inp={"sql": "SELECT 1"}, context={})]

    events = asyncio.run(_collect())
    started = next(e for e in events if e["event"] == "run_started")
    assert started["session_id"] == "sess-123"
    # 不落库:system_agent_runs 无 session 列(schema 不含)
    with with_system_connection() as conn:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(system_agent_runs)").fetchall()]
    assert "session_id" not in cols


# ---- 连接级作用域:库内表清单进入上下文(L1 渐进披露) ----

def test_attached_catalog_injected_into_context(orders, tmp_path):
    """整库授权时,上下文里应直接列出该连接的表(限定名)+ 结构读取时效,
    模型不必先花一个 step 去 search_tables。"""
    import duckdb as _duckdb
    from core.services import ai_agent_tools
    from core.services.ai_profiles import _ctx_data_qa

    dbfile = tmp_path / "scope.duckdb"
    rc = _duckdb.connect(str(dbfile))
    rc.execute("CREATE TABLE remote_orders(id INTEGER)")
    rc.execute("CREATE TABLE remote_refunds(id INTEGER)")
    rc.close()
    ai_agent_tools.invalidate_attached_tables("scoped")

    ctx = _ctx()
    ctx.attach_configs = [("scoped", {"type": "duckdb", "path": str(dbfile)})]
    ctx.authorized_aliases = ["scoped"]
    text = _ctx_data_qa({}, {"tables": []}, ctx)

    assert "scoped.remote_orders" in text and "scoped.remote_refunds" in text
    assert "2 tables" in text and "structure read" in text
    assert "describe_tables" in text  # 指引用批量工具取列定义


def test_attached_catalog_failure_is_stated_not_silent(orders):
    """连接枚举失败必须如实写进上下文(否则模型会以为这个库是空的/不存在)。"""
    from core.services import ai_agent_tools
    from core.services.ai_profiles import _ctx_data_qa

    ai_agent_tools.invalidate_attached_tables("deadconn")
    ctx = _ctx()
    ctx.attach_configs = [("deadconn", {"type": "sqlite", "path": "/nonexistent/x.sqlite"})]
    ctx.authorized_aliases = ["deadconn"]
    text = _ctx_data_qa({}, {"tables": []}, ctx)
    assert "deadconn" in text and "could not read its structure" in text
