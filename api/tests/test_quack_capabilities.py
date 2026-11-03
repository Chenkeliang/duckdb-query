"""Dedicated Quack support must not relax shared SQL policy (2026-11-03)."""

from core.common.duckdb_capabilities import build_capability_contract


def test_dedicated_quack_capability_preserves_raw_session_gate():
    """2026-11-03: dedicated remote APIs and pooled CONNECT are distinct."""
    contract = build_capability_contract(python_version="2.0.0", engine_version="v2.0.0", storage_version="v2.0.0")
    features = {item["id"]: item for item in contract["features"]}
    assert features["quack_services"]["service_api"]["status"] == "supported"
    for name in ("connect_and_quack", "quack_services"):
        for surface in ("direct_sql", "agent", "mcp"):
            assert features[name][surface]["status"] == "blocked"


def test_dedicated_quack_capability_not_claimed_on_old_build():
    """2026-11-03: runtime verification still gates dedicated Quack support."""
    contract = build_capability_contract(python_version="1.5.3", engine_version="v1.5.3", storage_version="v1.5.0")
    feature = next(item for item in contract["features"] if item["id"] == "quack_services")
    assert feature["engine"]["status"] == "blocked"
    assert feature["service_api"]["status"] == "blocked"
