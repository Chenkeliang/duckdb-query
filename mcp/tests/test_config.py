import pytest
from duckquery_mcp.config import load_config, MODES


def test_defaults(monkeypatch):
    for k in ("DUCKQUERY_API_BASE", "DUCKQUERY_MCP_MODE", "DUCKQUERY_MCP_ROW_CAP"):
        monkeypatch.delenv(k, raising=False)
    cfg = load_config()
    assert cfg.api_base is None
    assert cfg.mode == "normal"
    assert cfg.row_cap == 200
    assert cfg.probe_ports == (48001, 8000, 8001)


def test_env_override(monkeypatch):
    monkeypatch.setenv("DUCKQUERY_API_BASE", "http://127.0.0.1:9999")
    monkeypatch.setenv("DUCKQUERY_MCP_MODE", "read-only")
    cfg = load_config()
    assert cfg.api_base == "http://127.0.0.1:9999"
    assert cfg.mode == "read-only"


def test_bad_mode(monkeypatch):
    monkeypatch.setenv("DUCKQUERY_MCP_MODE", "bogus")
    with pytest.raises(SystemExit):
        load_config()
