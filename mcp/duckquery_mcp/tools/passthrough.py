from typing import Any


async def duckquery_request(client, cfg, *, method: str, path: str,
                            json: dict | None = None, confirm: bool = False) -> Any:
    """Call any DuckQuery API endpoint directly (escape hatch for features without a dedicated tool).
    Non-GET methods require confirm=True unless mode is 'full'."""
    method = method.upper()
    if method != "GET" and cfg.mode != "full" and not confirm:
        return {"error": "This is a mutating request; pass confirm=true to proceed."}
    return await client.call(method, path, json_body=json)
