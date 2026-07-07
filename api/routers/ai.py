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


# [完整目录] 预算与展开上限：见 _build_catalog_text 说明
_CATALOG_CHAR_BUDGET = 9000
_CATALOG_LOCAL_TABLE_LIMIT = 20
_CATALOG_EXTERNAL_TABLE_LIMIT = 30
_CATALOG_COLUMN_LIMIT = 30


def _format_catalog_table(name: str, columns: list[tuple]) -> str:
    """单表的目录行：`表名(col TYPE, ...)`，超过 30 列截断并标注剩余数量。"""
    shown = columns[:_CATALOG_COLUMN_LIMIT]
    col_str = ", ".join(f"{c[0]} {c[1]}" for c in shown)
    extra = len(columns) - len(shown)
    if extra > 0:
        col_str += f", ... +{extra} more"
    return f"{name}({col_str})"


def _catalog_lines_for_tables(
    con: Any,
    database_name: str,
    table_names: list[str],
    selected: set,
    detail_limit: int,
    name_prefix: str = "",
) -> list[str]:
    """给一批表名生成目录行：前 detail_limit 张带列，其余仅列名。

    已出现在 selected（详细段）里的表，这里跳过列只列名，避免重复。
    """
    lines: list[str] = []
    detailed, rest = table_names[:detail_limit], table_names[detail_limit:]
    for name in detailed:
        qualified = f"{name_prefix}{name}" if name_prefix else name
        if name in selected or qualified in selected:
            lines.append(f"  {name}")
            continue
        try:
            cols = con.execute(
                """
                SELECT column_name, data_type FROM duckdb_columns()
                WHERE database_name = ? AND table_name = ?
                ORDER BY column_index
                """,
                [database_name, name],
            ).fetchall()
            lines.append(f"  {_format_catalog_table(name, cols)}")
        except Exception as exc:  # noqa: BLE001  单表枚举失败不影响其它表
            logger.warning("catalog: describe %s.%s failed: %s", database_name, name, exc)
            lines.append(f"  {name}")
    if rest:
        lines.append(f"  (仅名字: {', '.join(rest)})")
    return lines


def _build_catalog_text(selected: set, attach_databases: list[Any] | None = None) -> str:
    """构造聊天上下文里的"完整目录"，与 _build_schema_text 互补。

    _build_schema_text 只详细展开前端选中的（<=10 张）表；用户在对话里提到未选中
    但同一连接下存在的表（如 JOIN 页只勾了 alerts，问「把 rules 也加入」）时，AI 单看
    详细段会误判"表不存在"。本函数额外枚举本地库 + 已挂载外部库的全部表名（前 N 张
    带列），让 AI 能在目录里确认表是否存在、以及外部表该用哪个 alias.table 引用。

    任何一个来源枚举失败都 try/except 跳过并 logger.warning，不让 chat 整体失败。
    """
    sections: list[str] = []
    try:
        attach_configs = resolve_attach_configs(attach_databases)
    except Exception as exc:  # noqa: BLE001  连接已被删除等场景不应影响本地目录
        logger.warning("catalog: resolve attach_databases failed: %s", exc)
        attach_configs = []
    # alias → 引擎类型标注:让模型知道表来自哪种库(可解释类型差异),
    # 同时目录头明示"仍需 DuckDB 语法",抑制向源库方言漂移
    _TYPE_LABELS = {
        "mysql": "MySQL",
        "postgresql": "PostgreSQL",
        "sqlite": "SQLite",
        "duckdb": "DuckDB",
    }
    alias_types = {
        alias: _TYPE_LABELS.get(str(cfg.get("type") or "").lower(), "external")
        for alias, cfg in attach_configs
    }
    with with_duckdb_connection() as con:
        attached: list[str] = []
        try:
            # 本地 DuckDB 表：目录名用 current_database()，不假设固定叫 main
            try:
                local_db = con.execute("SELECT current_database()").fetchone()[0]
                local_names = [
                    r[0]
                    for r in con.execute(
                        """
                        SELECT table_name FROM duckdb_tables()
                        WHERE NOT internal AND database_name = ?
                        ORDER BY table_name
                        """,
                        [local_db],
                    ).fetchall()
                ]
                if local_names:
                    lines = ["Local DuckDB tables:"]
                    lines.extend(
                        _catalog_lines_for_tables(
                            con, local_db, local_names, selected, _CATALOG_LOCAL_TABLE_LIMIT
                        )
                    )
                    sections.append("\n".join(lines))
            except Exception as exc:  # noqa: BLE001
                logger.warning("catalog: enumerate local tables failed: %s", exc)

            # 外部（联邦）库：逐个 alias 枚举，单个失败不影响其它 alias / 本地段
            if attach_configs:
                try:
                    attached = attach_databases_on_connection(con, attach_configs)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("catalog: attach external databases failed: %s", exc)
                for alias in attached:
                    try:
                        ext_names = [
                            r[0]
                            for r in con.execute(
                                "SELECT table_name FROM duckdb_tables() "
                                "WHERE database_name = ? ORDER BY table_name",
                                [alias],
                            ).fetchall()
                        ]
                        if not ext_names:
                            continue
                        db_type = alias_types.get(alias, "external")
                        lines = [
                            f"External database {alias} ({db_type} source, "
                            f"reference as {alias}.table, query with DuckDB syntax):"
                        ]
                        lines.extend(
                            _catalog_lines_for_tables(
                                con,
                                alias,
                                ext_names,
                                selected,
                                _CATALOG_EXTERNAL_TABLE_LIMIT,
                                name_prefix=f"{alias}.",
                            )
                        )
                        sections.append("\n".join(lines))
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("catalog: enumerate external db %s failed: %s", alias, exc)
        finally:
            if attached:
                detach_databases_on_connection(con, attached)

    text = "\n\n".join(sections)
    if len(text) > _CATALOG_CHAR_BUDGET:
        text = text[:_CATALOG_CHAR_BUDGET] + "\n  (catalog truncated)"
    return text


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
    current_sql: str = ""


@router.post("/api/ai/chat", tags=["AI"])
def chat_route(payload: ChatPayload):
    cfg = ai_config.load_ai_settings()
    detailed_text = _build_schema_text(payload.tables, payload.attach_databases)
    try:
        catalog_text = _build_catalog_text(set(payload.tables), payload.attach_databases)
    except Exception as exc:  # noqa: BLE001  目录构建失败不应影响 chat 本身
        logger.warning("catalog build failed, falling back to detailed schema only: %s", exc)
        catalog_text = ""
    schema_text = f"[Selected tables (detailed)]\n{detailed_text}"
    if catalog_text:
        schema_text += f"\n\n[Full catalog]\n{catalog_text}"
    # 用户工作台当前 SQL(如 JOIN 预览):放在 schema 段之后，让助手能回答
    # "在当前 SQL 里加上……" 这类追问；截断避免超长 SQL 占满上下文
    current_sql = (payload.current_sql or "").strip()[:4000]
    if current_sql:
        schema_text += (
            "\n\nCurrent SQL in the user's workbench:\n"
            f"```sql\n{current_sql}\n```"
        )
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
