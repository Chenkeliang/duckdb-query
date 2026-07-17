from typing import Any


async def get_ai_settings(client, cfg) -> Any:
    """Current AI/LLM settings (api keys are masked by the backend)."""
    return await client.call("GET", "/api/settings/ai")


async def configure_llm(client, cfg, *, settings: dict, confirm: bool = False) -> Any:
    """Update AI/LLM settings. `settings` matches AISettingsPayload fields:
    enabled (bool), default_provider (str|None), providers (list[dict]),
    features (dict), timeout_seconds (int), num_retries (int).

    Persists settings (incl. API keys), so it needs confirm=true outside
    read-only mode, like every other write tool."""
    from duckquery_mcp.safety import confirm_required
    blocked = confirm_required(cfg, True, confirm)
    if blocked:
        return blocked
    return await client.call("PUT", "/api/settings/ai", json_body=settings)


async def test_llm_provider(client, cfg, *, provider_id: str, confirm: bool = False) -> Any:
    """Test connectivity/credentials for one configured provider.

    Sends the stored credentials to the (possibly third-party) provider
    endpoint — an outbound side effect — so it needs confirm=true outside
    read-only mode, like every other write tool."""
    from duckquery_mcp.safety import confirm_required
    blocked = confirm_required(cfg, True, confirm)
    if blocked:
        return blocked
    return await client.call("POST", f"/api/ai/providers/{provider_id}/test")
