"""AI 设置与供应商管理路由。"""

from __future__ import annotations

from typing import Any, Dict

from core.common.exceptions import ResourceNotFoundError
from core.services import ai_config
from core.services.llm_service import LLMService
from fastapi import APIRouter
from pydantic import BaseModel
from utils.response_helpers import (
    MessageCode,
    create_success_response,
    error_json_response,
)

router = APIRouter()


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
        "features": {"_probe": {"enabled": True, "provider": provider_id,
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
