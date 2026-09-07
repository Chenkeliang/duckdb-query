"""Versioned DuckDB capability contract shared by API, Agent, UI and MCP."""

from __future__ import annotations

from functools import lru_cache
import re
from typing import Any

import sqlglot


CONTRACT_VERSION = 2
AGENT_PROFILE_REVISION = "duckdb-2-preview-v1"
VERIFIED_ENGINE_VERSION = "v2.0.0-alpha39998"
VERIFIED_REMOTE_PUSHDOWN_BUILDS: frozenset[tuple[str, str, str]] = frozenset()

_AGENT_BLOCKED_SQL = (
    ("approx_nearest", re.compile(r"\bJOIN\b[\s\S]*?\bAPPROX\s+NEAREST\b", re.I)),
    ("recursive_cte_using_key", re.compile(r"\bUSING\s+KEY\s*\(", re.I)),
    ("fetch_first_next", re.compile(r"\bFETCH\s+(?:FIRST|NEXT)\b", re.I)),
)


def _surface(status: str, reason: str | None = None) -> dict[str, Any]:
    value: dict[str, Any] = {"status": status}
    if reason:
        value["reason"] = reason
    return value


def blocked_agent_sql_feature(sql: str) -> str | None:
    """Return the deterministic contract gate for syntax Agent cannot scope-audit."""
    try:
        tokens = sqlglot.tokenize(sql or "", read="duckdb")
    except Exception:  # pylint: disable=broad-except
        return None  # the downstream AST guard rejects tokenizer failures
    data_types = {
        sqlglot.TokenType.STRING,
        sqlglot.TokenType.HEREDOC_STRING,
        sqlglot.TokenType.IDENTIFIER,
    }
    code = " ".join(str(token.text) for token in tokens if token.token_type not in data_types)
    for feature_id, pattern in _AGENT_BLOCKED_SQL:
        if pattern.search(code):
            return feature_id
    return None


def remote_pushdown_verified(
    engine_version: str,
    platform: str,
    extensions: dict[str, dict[str, Any]] | None = None,
) -> bool:
    """Return whether this exact runtime passed the remote semantic matrix."""
    extension_version = str(
        (extensions or {}).get("mysql_scanner", {}).get("version") or ""
    )
    return (
        str(engine_version),
        extension_version,
        str(platform),
    ) in VERIFIED_REMOTE_PUSHDOWN_BUILDS


def extension_manifest_from_connection(connection) -> dict[str, dict[str, Any]]:
    """Return installed/loaded extension identities without connection data."""
    rows = connection.execute(
        "SELECT extension_name, installed, loaded, extension_version "
        "FROM duckdb_extensions() WHERE installed OR loaded"
    ).fetchall()
    return {
        str(name): {
            "installed": bool(installed),
            "loaded": bool(loaded),
            "version": str(version) if version is not None else None,
        }
        for name, installed, loaded, version in rows
    }


def build_capability_contract(
    *,
    python_version: str,
    engine_version: str,
    storage_version: str,
    platform: str = "unknown",
    extensions: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Describe actual product support without inferring it from engine version alone."""
    preview = "alpha" in engine_version.lower() or "dev" in python_version.lower()
    verified_build = engine_version == VERIFIED_ENGINE_VERSION
    extension_manifest = extensions or {}
    pushdown_verified = remote_pushdown_verified(
        engine_version, platform, extension_manifest
    )

    def engine_surface(feature_id: str) -> dict[str, Any]:
        if not verified_build:
            return _surface("blocked", "Engine build has not passed this contract's verification matrix")
        if feature_id == "connect_and_quack":
            return _surface("blocked", "The quack extension is not bundled or enabled")
        if feature_id == "custom_extension_repository":
            return _surface("blocked", "Extension repositories are disabled by engine configuration")
        if feature_id == "stable_c_api":
            return _surface("blocked", "The native C ABI is not consumed or runtime-tested by DuckQuery")
        return _surface("supported")

    def v2_surface(status: str = "supported", reason: str | None = None) -> dict[str, Any]:
        if not verified_build:
            return _surface("blocked", "Engine build has not passed this contract's verification matrix")
        return _surface(status, reason)
    ast_reason = "Agent table-scope auditing cannot yet parse this DuckDB 2.0 syntax"
    blocked_write = "Blocked by DuckQuery's SQL safety policy"
    automatic_features = (
        "storage_v2",
        "parser_error_locations",
        "aggregation_spill",
        "storage_optimizations",
        "query_optimizer_optimizations",
        "async_io",
    )
    features = [
        {
            "id": feature_id,
            "kind": "automatic",
            "engine": engine_surface(feature_id),
            "direct_sql": _surface("not-applicable"),
            "agent": _surface("not-applicable"),
            "mcp": _surface("not-applicable"),
            "extension": None,
        }
        for feature_id in automatic_features
    ] + [
        {
            "id": "automatic_remote_pushdown",
            "kind": "optimization",
            "engine": engine_surface("automatic_remote_pushdown"),
            "direct_sql": _surface(
                "supported" if pushdown_verified else "blocked",
                None
                if pushdown_verified
                else "Disabled until this engine, extension and platform pass the semantic matrix",
            ),
            "agent": _surface(
                "supported" if pushdown_verified else "blocked",
                None
                if pushdown_verified
                else "Disabled by the verified optimizer safety policy",
            ),
            "mcp": _surface(
                "supported" if pushdown_verified else "blocked",
                None
                if pushdown_verified
                else "Disabled by the verified optimizer safety policy",
            ),
            "extension": "mysql_scanner",
        },
        {
            "id": "approx_nearest",
            "kind": "sql",
            "engine": engine_surface("approx_nearest"),
            "direct_sql": v2_surface(),
            "agent": v2_surface("blocked", ast_reason),
            "mcp": v2_surface(),
            "extension": None,
        },
        {
            "id": "recursive_cte_using_key",
            "kind": "sql",
            "engine": engine_surface("recursive_cte_using_key"),
            "direct_sql": v2_surface(),
            "agent": v2_surface("blocked", ast_reason),
            "mcp": v2_surface(),
            "extension": None,
        },
        {
            "id": "fetch_first_next",
            "kind": "sql",
            "engine": engine_surface("fetch_first_next"),
            "direct_sql": v2_surface(),
            "agent": v2_surface("blocked", ast_reason),
            "mcp": v2_surface(),
            "extension": None,
        },
        {
            "id": "variant_and_json_mutation",
            "kind": "sql",
            "engine": engine_surface("variant_and_json_mutation"),
            "direct_sql": v2_surface(),
            "agent": v2_surface(),
            "mcp": v2_surface(),
            "extension": None,
        },
        {
            "id": "lambda_colon_syntax",
            "kind": "compatibility",
            "engine": engine_surface("lambda_colon_syntax"),
            "direct_sql": v2_surface(),
            "agent": v2_surface(),
            "mcp": v2_surface(),
            "extension": None,
        },
        {
            "id": "dml_in_cte",
            "kind": "write",
            "engine": engine_surface("dml_in_cte"),
            "direct_sql": _surface("blocked", blocked_write),
            "agent": _surface("blocked", blocked_write),
            "mcp": _surface("blocked", blocked_write),
            "extension": None,
        },
        {
            "id": "connect_and_quack",
            "kind": "session",
            "engine": engine_surface("connect_and_quack"),
            "direct_sql": _surface("blocked", blocked_write),
            "agent": _surface("blocked", blocked_write),
            "mcp": _surface("blocked", blocked_write),
            "extension": "quack",
        },
        {
            "id": "triggers",
            "kind": "write",
            "engine": engine_surface("triggers"),
            "direct_sql": _surface("blocked", blocked_write),
            "agent": _surface("blocked", blocked_write),
            "mcp": _surface("blocked", blocked_write),
            "extension": None,
        },
        {
            "id": "custom_extension_repository",
            "kind": "extension",
            "engine": engine_surface("custom_extension_repository"),
            "direct_sql": _surface("blocked", blocked_write),
            "agent": _surface("blocked", blocked_write),
            "mcp": _surface("blocked", blocked_write),
            "extension": None,
        },
        {
            "id": "stable_c_api",
            "kind": "native-api",
            "engine": engine_surface("stable_c_api"),
            "direct_sql": _surface("not-applicable"),
            "agent": _surface("not-applicable"),
            "mcp": _surface("not-applicable"),
            "extension": None,
        },
    ]
    return {
        "contract_version": CONTRACT_VERSION,
        "product_version": "2.0.0",
        "engine": {
            "python_version": python_version,
            "version": engine_version,
            "release_stage": "preview" if preview else "stable",
            "default_storage_version": storage_version,
            "platform": platform,
            "extensions": extension_manifest,
        },
        "optimizer_policy": {
            "remote_pushdown": {
                "status": "supported" if pushdown_verified else "blocked",
                "reason_code": (
                    None
                    if pushdown_verified
                    else "SEMANTIC_MATRIX_NOT_VERIFIED"
                ),
                "reason": (
                    None
                    if pushdown_verified
                    else "Automatic remote pushdown is disabled to preserve result types and numeric precision"
                ),
            }
        },
        "agent": {"profile_revision": AGENT_PROFILE_REVISION, "execution": "read-only"},
        "mcp": {"package_version": "0.4.0", "execution_modes": ["read-only", "normal", "full"]},
        "features": features,
    }


@lru_cache(maxsize=1)
def current_capability_contract() -> dict[str, Any]:
    """Build the contract from the engine actually loaded by this process."""
    import duckdb
    from core.database.duckdb_storage import DUCKDB_STORAGE_COMPATIBILITY_VERSION
    connection = duckdb.connect(":memory:")
    try:
        engine_version = str(connection.execute("SELECT version()").fetchone()[0])
        platform = str(connection.execute("PRAGMA platform").fetchone()[0])
        extensions = extension_manifest_from_connection(connection)
    finally:
        connection.close()
    return build_capability_contract(
        python_version=str(duckdb.__version__),
        engine_version=engine_version,
        storage_version=DUCKDB_STORAGE_COMPATIBILITY_VERSION,
        platform=platform,
        extensions=extensions,
    )


def render_agent_capabilities(contract: dict[str, Any]) -> str:
    """Render the contract into concise, deterministic prompt guidance."""
    lines = [
        f"Engine: {contract['engine']['version']} ({contract['engine']['release_stage']}).",
        "Use lambda x: expression; never use the removed x -> expression lambda syntax.",
    ]
    for feature in contract["features"]:
        status = feature["agent"]["status"]
        if feature["kind"] == "sql" or feature["id"] == "lambda_colon_syntax":
            lines.append(f"- {feature['id']}: Agent {status}.")
    lines.append("Blocked features may be explained, but must not be generated or executed by Agent tools.")
    return "\n".join(lines)
