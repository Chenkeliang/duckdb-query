from typing import Any


async def duckquery_request(client, cfg, *, method: str, path: str,
                            json: dict | None = None, confirm: bool = False) -> Any:
    """Call any DuckQuery API endpoint directly (escape hatch for features without a dedicated tool).
    Non-GET methods require confirm=True unless mode is 'full'."""
    from duckquery_mcp.safety import confirm_required

    method = method.upper()
    blocked = confirm_required(cfg, method != "GET", confirm)
    if blocked:
        return blocked
    return await client.call(method, path, json_body=json)
