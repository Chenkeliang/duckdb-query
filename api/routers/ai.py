"""AI 设置与供应商管理路由。"""

from __future__ import annotations

import logging
from typing import Any, Dict

from core.common.exceptions import ResourceNotFoundError
from core.database.duckdb_engine import with_duckdb_connection
from core.database.federated_attach import (
    attach_databases_on_connection,
    detach_databases_on_connection,
    format_qualified_table_reference,
    resolve_attach_configs,
)
from models.query_models import AttachDatabase
from core.services import (
    ai_chat,
    ai_config,
    ai_error_doctor,
    ai_explain,
    ai_nl_to_sql,
    ai_suggest_chart,
    llm_context,
)
from core.services.llm_service import AIConfigError, AIDisabledError, LLMService
from core.services.retriever import KeywordRetriever
from fastapi import APIRouter
from pydantic import BaseModel
from utils.response_helpers import (
    MessageCode,
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


class ErrorFixPayload(BaseModel):
    sql: str
    error: str
    tables: list[str] = []
    attach_databases: list[AttachDatabase] = []
    locale: str = "zh"


def _ai_error_response(exc: Exception):
    """把 LLM 服务异常映射成 spec §4.3 的稳定错误码。"""
    code = "ai_disabled" if isinstance(exc, AIDisabledError) else "ai_not_configured"
    return error_json_response(400, code, str(exc))


def _build_schema_text(
    tables: list[str], attach_databases: list[Any] | None = None
) -> str:
    if not tables:
        return ""
    if len(tables) > 10:
        logger.info(
            "schema text truncated to first 10 of %d tables for AI context", len(tables)
        )
    # 联邦表(如 mysql_sorder.iget_order)需要先 ATTACH 远端库，否则 DESCRIBE 取不到结构
    attach_configs = resolve_attach_configs(attach_databases)
    lines: list[str] = []
    with with_duckdb_connection() as con:
        attached: list[str] = []
        try:
            if attach_configs:
                attached = attach_databases_on_connection(con, attach_configs)
            for name in tables[:10]:
                # 客户端常传裸表名(如 sservice),但 ATTACH 后联邦表在 alias 目录下,
                # 需回退尝试 alias.table；已是限定名则直接用。逐段转义引号防注入。
                candidates = [name]
                if "." not in name and attached:
                    candidates += [f"{alias}.{name}" for alias in attached]
                for cand in candidates:
                    try:
                        ref = format_qualified_table_reference(cand)
                        rows = con.execute(f"DESCRIBE {ref}").fetchall()
                        cols = ", ".join(f"{r[0]} {r[1]}" for r in rows)
                        lines.append(f"{name}({cols})")
                        break
                    except Exception:  # noqa: BLE001
                        continue
        finally:
            if attached:
                detach_databases_on_connection(con, attached)
    return "\n".join(lines)


@router.post("/api/ai/error-fix", tags=["AI"])
def error_fix(payload: ErrorFixPayload):
    cfg = ai_config.load_ai_settings()
    schema_text = _build_schema_text(payload.tables, payload.attach_databases)
    try:
        result = ai_error_doctor.explain_and_fix(
            LLMService(cfg), payload.sql, payload.error, schema_text, payload.locale
        )
    except (AIDisabledError, AIConfigError) as exc:
        return _ai_error_response(exc)
    return create_success_response(
        data=result, message_code=MessageCode.OPERATION_SUCCESS
    )


class ExplainSqlPayload(BaseModel):
    sql: str
    locale: str = "zh"


@router.post("/api/ai/explain-sql", tags=["AI"])
def explain_sql_route(payload: ExplainSqlPayload):
    cfg = ai_config.load_ai_settings()
    try:
        result = ai_explain.explain_sql(LLMService(cfg), payload.sql, "", payload.locale)
    except (AIDisabledError, AIConfigError) as exc:
        return _ai_error_response(exc)
    except Exception as exc:  # noqa: BLE001  供应商真实调用失败(网络/Key/超时)
        return error_json_response(
            502, MessageCode.OPERATION_FAILED, f"AI explain failed: {exc}"
        )
    return create_success_response(data=result, message_code=MessageCode.OPERATION_SUCCESS)


def _list_candidate_tables() -> list[str]:
    """main schema 下的表名,作为 KeywordRetriever 的候选池(失败则空)。"""
    try:
        with with_duckdb_connection() as con:
            rows = con.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'main'"
            ).fetchall()
        return [r[0] for r in rows]
    except Exception:  # noqa: BLE001
        return []


class NlToSqlPayload(BaseModel):
    question: str
    tables: list[str] = []
    locale: str = "zh"


@router.post("/api/ai/nl-to-sql", tags=["AI"])
def nl_to_sql_route(payload: NlToSqlPayload):
    cfg = ai_config.load_ai_settings()
    candidates = _list_candidate_tables()
    relevant = KeywordRetriever().retrieve(payload.question, payload.tables, candidates)
    schema_text = _build_schema_text(relevant)
    context = llm_context.build_nl2sql_context(schema_text, locale=payload.locale)
    try:
        result = ai_nl_to_sql.nl_to_sql(
            LLMService(cfg), payload.question, context, payload.locale
        )
    except (AIDisabledError, AIConfigError) as exc:
        return _ai_error_response(exc)
    except Exception as exc:  # noqa: BLE001
        return error_json_response(
            502, MessageCode.OPERATION_FAILED, f"AI nl-to-sql failed: {exc}"
        )
    return create_success_response(data=result, message_code=MessageCode.OPERATION_SUCCESS)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatPayload(BaseModel):
    messages: list[ChatMessage] = []
    tables: list[str] = []
    attach_databases: list[AttachDatabase] = []
    locale: str = "zh"


@router.post("/api/ai/chat", tags=["AI"])
def chat_route(payload: ChatPayload):
    cfg = ai_config.load_ai_settings()
    schema_text = _build_schema_text(payload.tables, payload.attach_databases)
    try:
        result = ai_chat.chat(
            LLMService(cfg),
            [m.model_dump() for m in payload.messages],
            schema_text,
            payload.locale,
        )
    except (AIDisabledError, AIConfigError) as exc:
        return _ai_error_response(exc)
    except Exception as exc:  # noqa: BLE001  供应商真实调用失败(网络/Key/超时)
        return error_json_response(
            502, MessageCode.OPERATION_FAILED, f"AI chat failed: {exc}"
        )
    return create_success_response(data=result, message_code=MessageCode.OPERATION_SUCCESS)


class SuggestChartPayload(BaseModel):
    columns: list[Dict[str, Any]] = []
    sample: list[Dict[str, Any]] = []
    locale: str = "zh"


@router.post("/api/ai/suggest-chart", tags=["AI"])
def suggest_chart_route(payload: SuggestChartPayload):
    cfg = ai_config.load_ai_settings()
    try:
        result = ai_suggest_chart.suggest_chart(
            LLMService(cfg), payload.columns, payload.sample, payload.locale
        )
    except (AIDisabledError, AIConfigError) as exc:
        return _ai_error_response(exc)
    except Exception as exc:  # noqa: BLE001
        return error_json_response(
            502, MessageCode.OPERATION_FAILED, f"AI suggest-chart failed: {exc}"
        )
    return create_success_response(data=result, message_code=MessageCode.OPERATION_SUCCESS)
