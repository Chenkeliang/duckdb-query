from typing import Any


async def duckquery_request(client, cfg, *, method: str, path: str,
                            json: dict | None = None, confirm: bool = False) -> Any:
    """Call any DuckQuery API endpoint directly (escape hatch for features without a dedicated tool).
    Non-GET methods require confirm=True unless mode is 'full'."""
    method = method.upper()
    if method != "GET":
        # read-only 模式必须硬性拒绝写请求:confirm 参数由调用方(LLM)自己传,
        # 不能作为越过只读隔离的凭据,否则 read-only 的安全承诺形同虚设。
        if cfg.mode == "read-only":
            return {"error": "read-only mode: mutating requests are blocked."}
        if cfg.mode != "full" and not confirm:
            return {"error": "This is a mutating request; pass confirm=true to proceed."}
    return await client.call(method, path, json_body=json)
