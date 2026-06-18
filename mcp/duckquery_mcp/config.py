import os
from dataclasses import dataclass

MODES = ("read-only", "normal", "full")


@dataclass(frozen=True)
class Config:
    api_base: str | None
    mode: str
    timeout: float
    row_cap: int
    probe_ports: tuple[int, ...]


def load_config() -> Config:
    mode = os.getenv("DUCKQUERY_MCP_MODE", "normal")
    if mode not in MODES:
        raise SystemExit(f"DUCKQUERY_MCP_MODE must be one of {MODES}, got {mode!r}")
    return Config(
        api_base=os.getenv("DUCKQUERY_API_BASE") or None,
        mode=mode,
        timeout=float(os.getenv("DUCKQUERY_MCP_TIMEOUT", "120")),
        row_cap=int(os.getenv("DUCKQUERY_MCP_ROW_CAP", "200")),
        probe_ports=(48001, 8000, 8001),
    )
