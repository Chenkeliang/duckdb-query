import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx


class BackendNotFound(Exception):
    pass


class BackendError(Exception):
    pass


def runtime_file() -> Path:
    """Mirror api/core/common/paths.get_user_data_dir() / 'runtime.json'."""
    override = os.getenv("APP_ROOT")
    if override:
        return Path(override) / "runtime.json"
    home = Path(os.path.expanduser("~"))
    if sys.platform == "darwin":
        base = home / "Library" / "Application Support" / "DuckQuery"
    elif sys.platform.startswith("win"):
        base = Path(os.getenv("APPDATA") or home) / "DuckQuery"
    else:
        base = home / ".local" / "share" / "DuckQuery"
    return base / "runtime.json"


class DuckQueryClient:
    def __init__(self, cfg) -> None:
        self.cfg = cfg
        self._base: str | None = None
        self._http = httpx.AsyncClient(timeout=cfg.timeout)

    async def _healthy(self, base: str) -> bool:
        try:
            r = await self._http.get(f"{base}/health")
            return r.status_code == 200 and r.json().get("status") == "healthy"
        except Exception:
            return False

    async def base(self) -> str:
        if self._base and await self._healthy(self._base):
            return self._base
        # 1. explicit env
        if self.cfg.api_base and await self._healthy(self.cfg.api_base):
            self._base = self.cfg.api_base
            return self._base
        # 2. runtime.json
        rf = runtime_file()
        if rf.exists():
            try:
                b = json.loads(rf.read_text()).get("base")
                if b and await self._healthy(b):
                    self._base = b
                    return self._base
            except Exception:
                pass
        # 3. probe known ports
        for port in self.cfg.probe_ports:
            b = f"http://127.0.0.1:{port}"
            if await self._healthy(b):
                self._base = b
                return self._base
        raise BackendNotFound(
            "DuckQuery backend not found — start the DuckQuery app "
            "or set DUCKQUERY_API_BASE."
        )

    async def call(self, method: str, path: str, *, json_body: Any = None,
                   params: dict | None = None) -> Any:
        base = await self.base()
        r = await self._http.request(method, f"{base}{path}", json=json_body, params=params)
        try:
            payload = r.json()
        except Exception:
            r.raise_for_status()
            return {"raw": r.text}
        if r.status_code >= 400:
            msg = None
            if isinstance(payload, dict):
                # FastAPI uses "detail"; DuckQuery's envelope uses "message"/"messageCode"
                msg = payload.get("detail") or payload.get("message") or payload.get("messageCode")
                # 422 的字段级校验详情在 error.details.errors 里,不透传的话调用方只能
                # 看到一句 "Request validation failed",完全无从定位是哪个字段错了
                err = payload.get("error")
                if isinstance(err, dict):
                    details = err.get("details")
                    field_errors = details.get("errors") if isinstance(details, dict) else None
                    if field_errors:
                        parts = []
                        for fe in field_errors[:5]:
                            if isinstance(fe, dict):
                                parts.append(f"{fe.get('field', '?')}: {fe.get('message', '?')}")
                            else:
                                parts.append(str(fe))
                        msg = f"{msg or 'validation failed'} ({'; '.join(parts)})"
            raise BackendError(str(msg) if msg else f"HTTP {r.status_code}")
        if isinstance(payload, dict):
            if payload.get("success") is False:
                raise BackendError(payload.get("message") or payload.get("messageCode") or "request failed")
            if "data" in payload:
                return payload["data"]
        return payload
