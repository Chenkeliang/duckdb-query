from typing import Any


async def get_ai_settings(client, cfg) -> Any:
    """Current AI/LLM settings (api keys are masked by the backend)."""
    return await client.call("GET", "/api/settings/ai")


async def configure_llm(client, cfg, *, settings: dict) -> Any:
    """Update AI/LLM settings. `settings` matches AISettingsPayload fields:
    enabled (bool), default_provider (str|None), providers (list[dict]),
    features (dict), timeout_seconds (int), num_retries (int)."""
    return await client.call("PUT", "/api/settings/ai", json_body=settings)


async def test_llm_provider(client, cfg, *, provider_id: str) -> Any:
    """Test connectivity/credentials for one configured provider."""
    return await client.call("POST", f"/api/ai/providers/{provider_id}/test")
