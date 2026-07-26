"""AI 设置与供应商管理路由。"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Dict

from core.common.exceptions import ResourceNotFoundError
from core.common.timezone_utils import format_storage_time_for_response
from core.data.file_datasource_manager import file_datasource_manager
from core.database.federated_attach import resolve_attach_configs
from models.query_models import AttachDatabase
from core.database.duckdb_pool import with_system_connection
from core.services import (
    ai_agent,
    ai_agent_tools,
    ai_profiles,
    ai_config,
    ai_sql_guard,
    table_registry,
)
from core.services.ai_agent_tools import AgentRunCtx
from core.services.llm_service import AIConfigError, AIDisabledError, LLMService
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ValidationError
from utils.response_helpers import (
    MessageCode,
    create_list_response,
    create_success_response,
    error_json_response,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class AISettingsPayload(BaseModel):
    enabled: bool = False
    default_provider: str | None = None
    providers: list[Dict[str, Any]] = []
    features: Dict[str, Any] = {}
    timeout_seconds: int = 30
    num_retries: int = 2


@router.get("/api/settings/ai", tags=["AI"])
def get_ai_settings():
    stored = ai_config.load_ai_settings()
    public = ai_config.prepare_for_read(stored)
    return create_success_response(data=public, message_code=MessageCode.OPERATION_SUCCESS)


@router.put("/api/settings/ai", tags=["AI"])
def put_ai_settings(payload: AISettingsPayload):
    ai_config.save_ai_settings(payload.model_dump())
    return create_success_response(
        data={"saved": True}, message_code=MessageCode.OPERATION_SUCCESS
    )


@router.post("/api/ai/providers/{provider_id}/test", tags=["AI"])
def test_provider(provider_id: str):
    stored = ai_config.load_ai_settings()
    provider = ai_config.get_provider(stored, provider_id)
    if not provider:
        raise ResourceNotFoundError("Provider", provider_id)

    # 临时构造一个仅启用该 provider 的配置做最小 ping
    models = provider.get("models") or []
    probe_cfg = {
        **stored,
        "enabled": True,
        "default_provider": provider_id,
        "features": {"_probe": {"provider": provider_id,
                                "model": models[0] if models else None}},
    }
    try:
        out = LLMService(probe_cfg).complete(
            "_probe", [{"role": "user", "content": "ping"}]
        )
        return create_success_response(
            data={"ok": True, "sample": (out or "")[:40]},
            message_code=MessageCode.OPERATION_SUCCESS,
        )
    except Exception as exc:  # noqa: BLE001
        return error_json_response(
            502, MessageCode.OPERATION_FAILED, f"Provider test failed: {exc}"
        )


def _ai_error_response(exc: Exception):
    """把 LLM 服务异常映射成 spec §4.3 的稳定错误码。"""
    code = "ai_disabled" if isinstance(exc, AIDisabledError) else "ai_not_configured"
    return error_json_response(400, code, str(exc))


class AgentScope(BaseModel):
    """用户在对话里选定的问数范围(缺省 = 不限制,与旧客户端逐字兼容)。

    选了就是边界:目录注入与 run_query 闸同吃这一份,越界的表由闸拒绝并点名,
    模型据此走 refuse 请用户加表,而不是偷偷查别的表。
    """
    local_mode: str = "all"          # all=整个 DuckDB | tables=仅 local_tables | none=本地不在范围
    local_tables: list[str] = []
    alias_tables: Dict[str, list[str]] = {}  # 别名 → 选中表名;未列出的别名 = 该库整库


class AgentContext(BaseModel):
    tables: list[str] = []
    attach_databases: list[AttachDatabase] = []
    current_sql: str = ""
    locale: str = "zh"
    scope: AgentScope | None = None


class AgentRequest(BaseModel):
    """统一 Agent 请求(mode 判别)。input 各 mode 结构不同(见 §9.3),context 共用。

    - data_qa: input={messages:[{role,content}]}
    - generate_sql: input={question}
    - repair_sql: input={sql, error}
    - explain_sql: input={sql}
    - suggest_chart: input={columns, sample}
    """
    mode: str
    session_id: str | None = None  # 仅关联标识,不承载 mode/权限/模型;本轮不落库
    input: Dict[str, Any] = {}
    context: AgentContext = AgentContext()


def _sse(event: Dict[str, Any]) -> str:
    name = event["event"]
    data = {k: v for k, v in event.items() if k != "event"}
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _scope_limits(scope: AgentScope | None) -> ai_sql_guard.ScopeLimits | None:
    """把请求里的范围翻成闸的 ScopeLimits;None/全放开一律回 None(不逐表限制)。"""
    if scope is None:
        return None
    if scope.local_mode == "none":
        local: list[str] | None = []
    elif scope.local_mode == "tables":
        local = list(scope.local_tables)
    else:
        local = None
    aliases = {a: list(ts) for a, ts in (scope.alias_tables or {}).items()}
    if local is None and not aliases:
        return None
    return ai_sql_guard.ScopeLimits(local, aliases or None)


def _prepare_agent(req: AgentRequest):
    """两个 transport(stream / run)的共享准备:profile 解析 + 配置校验 + ctx + runner。

    绝不复制两套循环——stream 与 run 消费同一个 run_agent(同一 Engine+Profile)。
    未知 mode 抛 UnknownAgentModeError → 400 VALIDATION_ERROR(非法判别键,非配置问题);
    配置不可用抛 AIDisabledError/AIConfigError → 400。
    """
    profile = ai_profiles.get_profile(req.mode)
    if profile is None:
        raise ai_profiles.UnknownAgentModeError(f"unknown agent mode: {req.mode}")
    cfg = ai_config.load_ai_settings()
    if not cfg.get("enabled"):
        raise AIDisabledError("AI features are disabled")
    resolved = ai_config.resolve_feature(cfg, profile.model_feature)
    if not resolved["provider"] or not resolved["model"]:
        raise AIConfigError(f"No provider/model configured for agent mode '{req.mode}'")
    # 严格输入契约:按 Profile.input_model 校验(空 question / 缺 sql / 错 columns → 400)
    inp = profile.validate_input(req.input or {})  # 抛 pydantic ValidationError → 路由映射 400
    # 逐别名解析:单个连接失效只排除**该别名**,其余照常授权,并把失败作为 observation
    # 交给 Agent(见 _ctx_data_qa),绝不静默把整个联邦范围缩成本地(Bug 4)。
    attach_configs: list = []
    unavailable_aliases: list[tuple[str, str]] = []
    for att in (req.context.attach_databases or []):
        alias = getattr(att, "alias", None) or (
            att.get("alias") if isinstance(att, dict) else None)
        try:
            resolved_one = resolve_attach_configs([att])
        except ResourceNotFoundError as exc:
            logger.warning("agent: attach alias %s unavailable: %s", alias, exc)
            unavailable_aliases.append((str(alias or "?"), "connection not found"))
            continue
        except Exception as exc:  # noqa: BLE001  单连接解析异常不拦整个会话
            logger.warning("agent: attach alias %s failed: %s", alias, exc)
            unavailable_aliases.append((str(alias or "?"), "connection error"))
            continue
        if resolved_one:
            attach_configs.extend(resolved_one)
        elif alias:  # resolve 因缺 connection_id 等静默跳过 → 也算不可用,明示而非丢弃
            unavailable_aliases.append((str(alias), "unresolved"))
    ctx = AgentRunCtx(
        run_id=ai_agent.new_run_id(),
        authorized_aliases=[alias for alias, _ in attach_configs],
        attach_configs=attach_configs,
        unavailable_aliases=unavailable_aliases,
        locale=req.context.locale,
        provider=(resolved["provider"] or {}).get("id", ""),
        model=resolved["model"] or "",
        session_id=req.session_id,
        scope_limits=_scope_limits(req.context.scope),
    )
    context_dict = {
        "tables": req.context.tables,
        "attach_databases": req.context.attach_databases,
        "current_sql": req.context.current_sql,
        "locale": req.context.locale,
    }
    messages = inp.get("messages") if isinstance(inp, dict) else None
    agen = ai_agent.run_agent(
        LLMService(cfg), profile, ctx, inp=inp, context=context_dict, messages=messages,
    )
    return agen, ctx


@router.post("/api/ai/agent/stream", tags=["AI"])
async def agent_stream_route(req: AgentRequest, request: Request):
    """统一 Agent(SSE)。主要供 data_qa。契约见 docs/API_CONTRACT_FE_BE.md §9.3。"""
    try:
        agen, ctx = _prepare_agent(req)
    except ValidationError as exc:
        return error_json_response(400, MessageCode.VALIDATION_ERROR,
                                   f"invalid input for mode '{req.mode}': {exc.errors()[:3]}")
    except ai_profiles.UnknownAgentModeError as exc:
        return error_json_response(400, MessageCode.VALIDATION_ERROR, str(exc))
    except (AIDisabledError, AIConfigError) as exc:
        return _ai_error_response(exc)

    async def event_stream():
        queue: asyncio.Queue = asyncio.Queue()

        async def pump():
            # CancelledError 属 BaseException,不被下面 Exception 捕获,自然上抛
            try:
                async for ev in agen:
                    await queue.put(ev)
            except Exception as exc:  # noqa: BLE001  循环内部错误也走 error 事件
                logger.error("agent run failed: %s", exc, exc_info=True)
                await queue.put({"event": "error", "run_id": ctx.run_id,
                                 "termination_reason": "internal_error",
                                 "message": str(exc)[:200]})
            finally:
                await queue.put(None)

        task = asyncio.create_task(pump())
        try:
            while True:
                if await request.is_disconnected():
                    ai_agent_tools.interrupt_run(ctx.run_id)
                    task.cancel()
                    break
                try:
                    ev = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": ka\n\n"  # SSE 心跳,防代理静默断连
                    continue
                if ev is None:
                    break
                yield _sse(ev)
        finally:
            if not task.done():
                task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

    return StreamingResponse(
        event_stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/api/ai/agent/run", tags=["AI"])
async def agent_run_route(req: AgentRequest):
    """统一 Agent(非流式 JSON)。供 generate_sql/repair_sql/explain_sql/suggest_chart
    与 MCP。与 stream 复用同一个 run_agent。返回 {result, termination_reason, run_id}——
    成功与各类终止都返回同结构;result 为对应 Profile 的 output_model 或 null。
    """
    try:
        agen, ctx = _prepare_agent(req)
    except ValidationError as exc:
        return error_json_response(400, MessageCode.VALIDATION_ERROR,
                                   f"invalid input for mode '{req.mode}': {exc.errors()[:3]}")
    except ai_profiles.UnknownAgentModeError as exc:
        return error_json_response(400, MessageCode.VALIDATION_ERROR, str(exc))
    except (AIDisabledError, AIConfigError) as exc:
        return _ai_error_response(exc)

    result: Any = None
    termination = "internal_error"
    message = ""
    try:
        async for ev in agen:
            if ev["event"] == "answer":
                result = ev.get("result")
                termination = ev.get("termination_reason", "completed")
            elif ev["event"] == "error":
                termination = ev.get("termination_reason", "internal_error")
                message = ev.get("message", "")
    except Exception as exc:  # noqa: BLE001  循环内部错误也如实返回
        logger.error("agent run failed: %s", exc, exc_info=True)
        termination = "internal_error"
        message = str(exc)[:200]

    return create_success_response(
        data={"result": result, "termination_reason": termination,
              "message": message, "run_id": ctx.run_id, "session_id": ctx.session_id},
        message_code=MessageCode.OPERATION_SUCCESS,
    )


@router.get("/api/ai/agent-runs", tags=["AI"])
def list_agent_runs(limit: int = 20):
    """Agent 运行观测(调试用):不含 prompt/key/数据行。"""
    limit = max(1, min(int(limit), 100))
    columns = [
        "run_id", "mode", "provider", "model", "steps", "llm_calls", "tool_calls",
        "sql_calls", "sql_rejected", "json_errors", "termination_reason", "elapsed_ms",
        "created_at",
    ]
    try:
        with with_system_connection() as conn:
            rows = conn.execute(
                f"SELECT {', '.join(columns)} FROM system_agent_runs "
                "ORDER BY created_at DESC LIMIT ?",
                [limit],
            ).fetchall()
    except Exception:  # noqa: BLE001  表未建(尚无运行)= 空列表
        rows = []
    items = []
    for row in rows:
        item = dict(zip(columns, row))
        if isinstance(item.get("created_at"), datetime):
            item["created_at"] = format_storage_time_for_response(item["created_at"])
        items.append(item)
    return create_list_response(
        items=items, total=len(items), message_code=MessageCode.OPERATION_SUCCESS
    )
