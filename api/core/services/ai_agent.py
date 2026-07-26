"""统一 Agent Engine:一个 Loop 驱动多个 Profile,供应商无关的单 JSON 动作协议。

一个 Engine + 多个 Profile(见 ai_profiles)。Profile 决定 prompt/工具/预算/
输出模型/纠错策略/上下文/最终校验(EXPLAIN)/finalize;Engine 只跑通用循环:

- 每轮恰好一个 JSON 动作:ToolAction {action,args} 或 FinalAction {action:final,result}
- FinalAction.result 按 Profile.output_model 校验;失败走 output repair(独立预算
  max_output_repairs,不突破总 LLM 上限),仍失败按 output_error_policy 处理
- generate_sql/repair_sql 的 EXPLAIN 校验(final_validator)失败作为同一次 run 的
  observation 续跑(占 max_steps),不嵌套调用另一个 LLM 服务
- 协议纠错全程一次,再犯明确终止,不降级
- 工具结果与数据库单元格是数据不是指令;结论只来自 observation
- 事件由本模块产出(dict),transport 编码在路由层
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
import uuid
from typing import Any, AsyncIterator, Dict, List, Optional

from pydantic import ValidationError

from core.services import ai_agent_tools
from core.services.ai_agent_tools import AgentRunCtx, ToolResult
from core.services.ai_json_protocol import extract_json, recover_sql_action
from core.services.ai_profiles import AgentProfile

logger = logging.getLogger(__name__)

_LLM_RETRIES = 1  # 循环本身即重试机制,网络层只留一次


def new_run_id() -> str:
    return f"agent_{uuid.uuid4().hex[:12]}"


def build_system_prompt(profile: AgentProfile, context_text: str, locale: str) -> str:
    registry = ai_agent_tools.build_registry()
    return profile.system_prompt.format(
        tools=ai_agent_tools.render_tools_for_prompt(registry, profile.allowed_tools),
        context=context_text or "(none)",
        lang="中文" if locale == "zh" else "English",
        max_steps=profile.max_steps,
        max_sql=profile.max_sql_calls,
        max_seconds=profile.max_seconds,
    )


def _obs(payload: Any, *, steps_left: int, sql_left: int, seconds_left: float) -> str:
    return json.dumps(
        {
            "observation": payload,
            "budget": {
                "steps_left": max(int(steps_left), 0),
                "sql_left": max(int(sql_left), 0),
                "seconds_left": max(int(seconds_left), 0),
            },
        },
        ensure_ascii=False,
    )


def _error(ctx: AgentRunCtx, termination: str, message: str) -> Dict[str, Any]:
    return {
        "event": "error", "run_id": ctx.run_id,
        "termination_reason": termination, "message": message,
    }


def _answer(ctx: AgentRunCtx, result: Dict[str, Any], termination: str) -> Dict[str, Any]:
    event = {
        "event": "answer", "run_id": ctx.run_id,
        "result": result, "termination_reason": termination,
    }
    # 拒答里点名的表若确实存在、只是不在本轮范围内,附带给前端 → 一键「加入该表」重问。
    # 放在事件层而非 result 里:result 受 Profile 的 output_model 严格校验,这是 UI 提示。
    content = (result or {}).get("content") if isinstance(result, dict) else None
    if content:
        try:
            suggestions = ai_agent_tools.out_of_scope_candidates(ctx, str(content))
        except Exception:  # noqa: BLE001  提示是锦上添花,绝不能带翻回答
            suggestions = []
        if suggestions:
            event["scope_suggestions"] = suggestions
    return event


def _apply_output_policy(profile: AgentProfile, ctx: AgentRunCtx, inp: Dict[str, Any],
                         message: str, termination: str = "output_invalid") -> Dict[str, Any]:
    """输出/最终校验用尽纠错后的收尾:按 Profile 策略。绝不返回 completed。"""
    if profile.output_error_policy == "typed_error":
        return _error(ctx, termination, message)
    # reject / fallback:返回结构化结果(fallback_factory 或 null),不让调用方报错
    result = profile.fallback_factory(inp) if profile.fallback_factory else None
    return _answer(ctx, result, termination)


def _classify_protocol_miss(parsed: Any, action: Any) -> str:
    """归类导致 reformat / protocol_violation 的非法回复类型(诊断用)。"""
    if not isinstance(parsed, dict) or not parsed:
        return "no_json_object"          # 回复里抽不出 JSON 对象(多为散文/前后缀噪声)
    if "action" not in parsed:
        return "json_without_action_key"  # 有 JSON 但缺 action 键
    return f"unknown_action:{action!r}"   # action 值不在允许工具集/final 内


def _looks_like_json_action(raw: str) -> bool:
    """回复"看起来是 JSON 动作但没解析出来"——用于给出针对转义的纠正提示。

    实测形态:模型把单元格文本连同双引号写进 content 字符串却没转义,整个对象因此
    解析失败,被归类成 no_json_object。此时泛泛地说"请回复 JSON"没有任何信息量。
    """
    if not raw:
        return False
    return '"action"' in raw and "{" in raw


def _log_protocol_miss(ctx: AgentRunCtx, raw: str, parsed: Any, action: Any,
                       *, gave_up: bool, reformats: int) -> None:
    """归类导致 reformat / protocol_violation 的非法回复(仅日志观测,不改变预算/行为)。

    生产日志**只留分类 + 长度 + 内容哈希**——engine-stderr.log 会持久化,原文可能含数据库
    单元格值,不能落盘。需要原文诊断时置环境变量 DUCKQUERY_AGENT_LOG_RAW=1 显式采集。
    """
    kind = _classify_protocol_miss(parsed, action)
    stage = "give_up(protocol_violation)" if gave_up else "reformat(first_miss)"
    body = raw or ""
    digest = hashlib.sha256(body.encode("utf-8", "ignore")).hexdigest()[:12]
    logger.warning("agent protocol miss [%s] run=%s reformats=%d kind=%s len=%d sha=%s",
                   stage, ctx.run_id, reformats, kind, len(body), digest)
    if os.getenv("DUCKQUERY_AGENT_LOG_RAW"):
        logger.warning("agent protocol miss raw run=%s: %r", ctx.run_id, body[:400])


async def run_agent(
    llm,
    profile: AgentProfile,
    ctx: AgentRunCtx,
    *,
    inp: Dict[str, Any],
    context: Dict[str, Any],
    messages: Optional[List[Dict[str, str]]] = None,
) -> AsyncIterator[Dict[str, Any]]:
    """产出事件流:run_started → (tool_started/tool_completed)* → answer|error → done。"""
    registry = ai_agent_tools.build_registry()
    start = time.monotonic()
    # steps = 推理预算(工具/final/校验修正);reformats = 格式重试独立预算
    # llm_calls = 真实 LLM 调用总数(= steps + reformats),硬上限 = max_steps + max_output_repairs
    steps = reformats = tool_calls = json_errors = 0
    ctx.llm_calls = 0
    total_llm_cap = profile.max_steps + profile.max_output_repairs
    termination = "internal_error"
    conversation: List[Dict[str, str]] = []

    def _seconds_left() -> float:
        return profile.max_seconds - (time.monotonic() - start)

    yield {
        "event": "run_started", "run_id": ctx.run_id, "session_id": ctx.session_id,
        "limits": {"steps": profile.max_steps, "sql_calls": profile.max_sql_calls,
                   "seconds": profile.max_seconds, "llm_calls": total_llm_cap},
    }

    pending_reformat = False  # 上一轮请求了格式重试(invalid_action / output shape)
    try:
        # build_context 会连 DuckDB / ATTACH 联邦库 —— 放线程,别阻塞事件循环;
        # 且纳入 try:构建失败也走统一 error + 落账 + done 路径(不静默丢失)
        context_text = await asyncio.to_thread(profile.build_context, inp, context, ctx)
        conversation.append(
            {"role": "system",
             "content": build_system_prompt(profile, context_text, ctx.locale)})
        for m in messages or []:
            if m.get("role") in ("user", "assistant") and (m.get("content") or "").strip():
                conversation.append({"role": m["role"], "content": m["content"].strip()})
        user_msg = profile.build_user_message(inp)
        if user_msg:
            conversation.append({"role": "user", "content": user_msg})

        while True:
            if _seconds_left() <= 1:
                termination = "budget_time"
                yield _error(ctx, termination, "time budget exhausted")
                break
            if ctx.llm_calls >= total_llm_cap:  # 真实 LLM 调用硬上限
                termination = "budget_llm"
                yield _error(ctx, termination, "LLM call budget exhausted before final")
                break
            if pending_reformat:
                reformats += 1  # 格式重试,不占 step
            else:
                if steps >= profile.max_steps:
                    termination = "budget_llm"
                    yield _error(ctx, termination, "step budget exhausted before final")
                    break
                steps += 1
            pending_reformat = False

            # 单次超时不超过剩余墙钟预算
            per_call_timeout = min(30.0, max(1.0, _seconds_left() - 0.5))
            ctx.llm_calls += 1
            try:
                raw = await llm.complete_async(
                    profile.model_feature, conversation,
                    timeout=per_call_timeout, num_retries=_LLM_RETRIES,
                )
            except asyncio.CancelledError:
                termination = "cancelled"
                raise
            except Exception as exc:  # noqa: BLE001
                termination = "provider_error"
                yield _error(ctx, termination, str(exc)[:300])
                break

            parsed = extract_json(raw)
            action = parsed.get("action") if isinstance(parsed, dict) else None
            # 纠错兜底:模型把要跑的 SELECT 放进 ```sql 围栏/<run_query> 标签而非 JSON 协议
            # (实测 protocol_violation 的残余形态)→ 若 run_query 在允许集,恢复为一次探查动作。
            # 只在 action 既非终止动作(final/refuse)、又非已知工具时触发——绝不覆盖合法的
            # final/refuse(其 content 里可能含 ```sql 说明),也绝不恢复 final 当成功结果。
            if (action not in profile.terminal_actions
                    and action not in profile.allowed_tools
                    and "run_query" in profile.allowed_tools):
                recovered = recover_sql_action(raw)
                if recovered is not None:
                    parsed, action = recovered, "run_query"

            if action == "refuse" and "refuse" in profile.terminal_actions:
                # 安全拒绝 / 无需查询的答复:content-only,不过 grounding,强制 sql=null。
                # 与普通数据 final 分开——数据 final 必须绑定本次跑过的只读 SELECT(见 validator)。
                result_raw = parsed.get("result")
                try:
                    if not isinstance(result_raw, dict):
                        raise TypeError("result must be a JSON object")
                    validated = profile.output_model(**result_raw).model_dump()
                except (ValidationError, TypeError) as exc:
                    if reformats < profile.max_output_repairs:
                        pending_reformat = True
                        conversation.append({"role": "assistant", "content": raw or ""})
                        conversation.append({"role": "user", "content": _obs(
                            {"error": "output_schema_invalid", "detail": str(exc)[:300]},
                            steps_left=profile.max_steps - steps,
                            sql_left=profile.max_sql_calls - ctx.sql_calls_used,
                            seconds_left=_seconds_left())})
                        continue
                    termination = "output_invalid"
                    yield _apply_output_policy(profile, ctx, inp, str(exc)[:200])
                    break
                validated["sql"] = None
                validated["evidence"] = []
                termination = "completed"
                yield _answer(ctx, validated, termination)
                break

            if action == "final":
                # 1) output_model 校验(result 非 dict/类型错也算 schema 失败,不外泄成 internal_error)
                result_raw = parsed.get("result")
                try:
                    if not isinstance(result_raw, dict):
                        raise TypeError("result must be a JSON object")
                    validated = profile.output_model(**result_raw).model_dump()
                except (ValidationError, TypeError) as exc:
                    if reformats < profile.max_output_repairs:
                        pending_reformat = True
                        conversation.append({"role": "assistant", "content": raw or ""})
                        conversation.append({"role": "user", "content": _obs(
                            {"error": "output_schema_invalid", "detail": str(exc)[:300]},
                            steps_left=profile.max_steps - steps,
                            sql_left=profile.max_sql_calls - ctx.sql_calls_used,
                            seconds_left=_seconds_left())})
                        continue
                    termination = "output_invalid"
                    yield _apply_output_policy(profile, ctx, inp, str(exc)[:200])
                    break
                # 2) final_validator(EXPLAIN / 列交叉校验):失败且有步数则续跑修正
                if profile.final_validator is not None:
                    ok, err = await asyncio.to_thread(
                        profile.final_validator, validated, ctx, inp)
                    if profile.final_validation_is_sql:
                        ctx.sql_calls_used += 1  # EXPLAIN 计入 sql_calls(观测+预算)
                    if not ok:
                        if steps < profile.max_steps and ctx.llm_calls < total_llm_cap:
                            conversation.append({"role": "assistant", "content": raw or ""})
                            conversation.append({"role": "user", "content": _obs(
                                {"error": "validation_failed", "detail": err[:300]},
                                steps_left=profile.max_steps - steps,
                                sql_left=profile.max_sql_calls - ctx.sql_calls_used,
                                seconds_left=_seconds_left())})
                            continue
                        # 无重试预算:绝不把未通过校验的结果当 completed 返回(安全)
                        termination = profile.validation_failed_reason
                        yield _apply_output_policy(profile, ctx, inp, err[:200], termination)
                        break
                # 3) finalize + emit
                if profile.finalize is not None:
                    validated = profile.finalize(validated, ctx)
                termination = "completed"
                yield _answer(ctx, validated, termination)
                break

            tool = registry.get(action) if action else None
            if tool is None or action not in profile.allowed_tools:
                json_errors += 1
                gave_up = reformats >= profile.max_output_repairs
                _log_protocol_miss(ctx, raw, parsed, action, gave_up=gave_up, reformats=reformats)
                if gave_up:
                    termination = "protocol_violation"
                    yield _error(ctx, termination, "model failed to follow the action protocol")
                    break
                pending_reformat = True
                # 合法动作必须包含该 Profile 的**全部终止动作**(不能写死 final)。
                valid = ", ".join([*profile.allowed_tools, *profile.terminal_actions])
                if _looks_like_json_action(raw):
                    # 实测主因(24_注入):模型发的是完整 final 动作,但在 content 里引用
                    # 单元格文本时把双引号原样写进 JSON 字符串 → 解析失败。此时告诉它
                    # "请回复一个 JSON 对象"毫无意义——它认为自己已经照做了,于是原样重发。
                    # 必须点明是转义问题。
                    hint = ("your reply contained a JSON object but it FAILED TO PARSE — almost "
                            "always an unescaped double quote or raw newline inside a string "
                            'value. Re-send the SAME action, escaping every inner quote as \\" '
                            "and every newline as \\n. Quote cell text without adding raw quotes.")
                else:
                    hint = ("reply with exactly one JSON object and nothing else; "
                            f"valid actions: {valid}")
                    if "refuse" in profile.terminal_actions:
                        hint += ('. A refusal or a caveat is ALSO an action — send '
                                 '{"action":"refuse","result":{"content":"..."}}, never plain prose')
                conversation.append({"role": "assistant", "content": raw or ""})
                conversation.append({"role": "user", "content": _obs(
                    {"error": "invalid_action", "hint": hint},
                    steps_left=profile.max_steps - steps,
                    sql_left=profile.max_sql_calls - ctx.sql_calls_used,
                    seconds_left=_seconds_left())})
                continue

            # 工具执行
            tool_calls += 1
            tcid = f"t{tool_calls}"
            args_raw = parsed.get("args") or {}
            yield {"event": "tool_started", "run_id": ctx.run_id, "tool_call_id": tcid,
                   "tool": tool.name, "args_summary": json.dumps(args_raw, ensure_ascii=False)[:120]}
            try:
                args = tool.args_model(**args_raw)
            except Exception as exc:  # noqa: BLE001
                result = ToolResult(model_text=f"error: invalid args: {str(exc)[:200]}",
                                    ui_summary="invalid tool args", ok=False)
            else:
                if tool.name == "run_query":
                    result = await ai_agent_tools.run_query_async(ctx, args, profile.max_sql_calls)
                else:
                    result = await asyncio.to_thread(tool.handler, ctx, args)
            yield {"event": "tool_completed", "run_id": ctx.run_id, "tool_call_id": tcid,
                   "tool": tool.name, "ok": result.ok, "ui_summary": result.ui_summary,
                   "truncated": result.truncated, "elapsed_ms": result.elapsed_ms}
            conversation.append({"role": "assistant", "content": raw or ""})
            conversation.append({"role": "user", "content": _obs(
                {"tool_call_id": tcid, "result": result.model_text},
                steps_left=profile.max_steps - steps,
                sql_left=profile.max_sql_calls - ctx.sql_calls_used,
                seconds_left=_seconds_left())})
    except asyncio.CancelledError:
        termination = "cancelled"
        raise
    except Exception as exc:  # noqa: BLE001  build_context / 循环内部错误统一走 error
        logger.error("agent run failed: %s", exc, exc_info=True)
        termination = "internal_error"
        yield _error(ctx, termination, str(exc)[:200])
    finally:
        _record_run(ctx, mode=profile.mode, steps=steps, tool_calls=tool_calls,
                    json_errors=json_errors, termination=termination,
                    elapsed_ms=int((time.monotonic() - start) * 1000))

    yield {"event": "done", "run_id": ctx.run_id, "session_id": ctx.session_id,
           "usage": {"steps": steps, "llm_calls": ctx.llm_calls, "tool_calls": tool_calls,
                     "sql_calls": ctx.sql_calls_used,
                     "elapsed_ms": int((time.monotonic() - start) * 1000)}}


_RUNS_SCHEMA_READY = False


def _record_run(ctx: AgentRunCtx, *, mode: str, steps: int, tool_calls: int,
                json_errors: int, termination: str, elapsed_ms: int) -> None:
    """观测落账(system.db):不含 prompt/key/数据行。失败只告警。"""
    global _RUNS_SCHEMA_READY  # pylint: disable=global-statement
    try:
        from core.common.timezone_utils import get_storage_time  # pylint: disable=import-outside-toplevel
        from core.database.duckdb_pool import with_system_connection  # pylint: disable=import-outside-toplevel

        with with_system_connection() as conn:
            if not _RUNS_SCHEMA_READY:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS system_agent_runs (
                        run_id VARCHAR PRIMARY KEY, mode VARCHAR,
                        provider VARCHAR, model VARCHAR,
                        steps INTEGER, llm_calls INTEGER, tool_calls INTEGER, sql_calls INTEGER,
                        sql_rejected INTEGER, json_errors INTEGER,
                        termination_reason VARCHAR, elapsed_ms BIGINT, created_at TIMESTAMP
                    )
                    """
                )
                for col, typ in (("mode", "VARCHAR"), ("steps", "INTEGER"),
                                 ("llm_calls", "INTEGER")):
                    conn.execute(
                        f"ALTER TABLE system_agent_runs ADD COLUMN IF NOT EXISTS {col} {typ}"
                    )
                _RUNS_SCHEMA_READY = True
            conn.execute(
                "INSERT OR REPLACE INTO system_agent_runs "
                "(run_id, mode, provider, model, steps, llm_calls, tool_calls, sql_calls, "
                "sql_rejected, json_errors, termination_reason, elapsed_ms, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                [ctx.run_id, mode, ctx.provider, ctx.model, steps, ctx.llm_calls, tool_calls,
                 ctx.sql_calls_used, ctx.sql_rejected, json_errors, termination,
                 elapsed_ms, get_storage_time()],
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("agent run recording failed: %s", exc)
