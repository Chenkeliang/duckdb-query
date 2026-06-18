import json
import os
import sys
from pathlib import Path

import httpx


class BackendNotFound(Exception):
    pass


class BackendError(Exception):
    pass


def runtime_file() -> Path:
    """Mirror api/core/common/paths.get_user_data_dir() / 'runtime.json'."""
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
