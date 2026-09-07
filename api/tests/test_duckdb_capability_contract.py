"""DuckDB 2.0 capability contract and safety classification regressions."""

import asyncio

from fastapi.testclient import TestClient

from core.common.duckdb_capabilities import (
    build_capability_contract,
    current_capability_contract,
    render_agent_capabilities,
)
from main import app
from core.services.ai_agent import build_system_prompt
from core.services.ai_profiles import _explain_validate_sql, get_profile
from core.services.ai_sql_guard import check_sql
from core.services.ai_agent_tools import AgentRunCtx, RunQueryArgs, run_query_async


def _features(contract):
    return {feature["id"]: feature for feature in contract["features"]}


def test_contract_is_explicit_per_surface_and_matches_runtime():
    contract = current_capability_contract()
    features = _features(contract)
    assert contract["contract_version"] == 2
    assert contract["product_version"] == "2.0.0"
    assert contract["engine"]["version"].startswith("v2.0.0-alpha")
    assert contract["engine"]["release_stage"] == "preview"
    assert contract["engine"]["platform"]
    assert "core_functions" in contract["engine"]["extensions"]
    assert contract["optimizer_policy"]["remote_pushdown"] == {
        "status": "blocked",
        "reason_code": "SEMANTIC_MATRIX_NOT_VERIFIED",
        "reason": "Automatic remote pushdown is disabled to preserve result types and numeric precision",
    }
    assert contract["mcp"]["package_version"] == "0.4.0"
    assert features["approx_nearest"]["direct_sql"]["status"] == "supported"
    assert features["approx_nearest"]["agent"]["status"] == "blocked"
    assert features["variant_and_json_mutation"]["agent"]["status"] == "supported"
    assert features["dml_in_cte"]["mcp"]["status"] == "blocked"
    assert features["triggers"]["engine"]["status"] == "supported"
    assert features["storage_v2"]["engine"]["status"] == "supported"
    assert features["automatic_remote_pushdown"]["direct_sql"]["status"] == "blocked"
    for feature_id in ("connect_and_quack", "custom_extension_repository", "stable_c_api"):
        assert features[feature_id]["engine"]["status"] == "blocked"


def test_contract_does_not_claim_v2_engine_features_on_an_old_runtime():
    contract = build_capability_contract(
        python_version="1.5.3", engine_version="v1.5.3", storage_version="v1.5.0"
    )
    assert all(feature["engine"]["status"] == "blocked" for feature in contract["features"])


def test_agent_prompt_guidance_is_derived_from_contract():
    guidance = render_agent_capabilities(current_capability_contract())
    assert "lambda x: expression" in guidance
    assert "approx_nearest: Agent blocked" in guidance
    assert "variant_and_json_mutation: Agent supported" in guidance
    prompt = build_system_prompt(get_profile("generate_sql"), "schema", "zh")
    assert "# DuckDB runtime capabilities" in prompt
    assert "approx_nearest: Agent blocked" in prompt


def test_agent_contract_matches_the_actual_scope_guard():
    for sql in (
        "SELECT variant_type('{\"x\":1}'::JSON::VARIANT)",
        "SELECT json_set('{\"a\":1}', '$.b', '2')",
        "SELECT list_transform([1,2], lambda x: x + 1)",
    ):
        assert check_sql(sql, []) == (True, "ok")
    for sql in (
        "SELECT q.id FROM q INNER JOIN p APPROX NEAREST 2 "
        "BY SIMILARITY array_cosine_similarity(q.e,p.e)",
        "WITH RECURSIVE t(a,b) USING KEY (a,avg(b)) AS "
        "(SELECT 1,5 UNION ALL SELECT a,b-1 FROM t WHERE b>0) TABLE t",
        "SELECT 1 FETCH FIRST 1 ROW ONLY",
    ):
        allowed, reason = check_sql(sql, [])
        assert not allowed
        assert "not enabled for Agent execution" in reason


def test_agent_blocked_capabilities_are_enforced_beyond_the_prompt():
    """A model that ignores its prompt cannot use contract-blocked SQL."""
    queries = (
        "SELECT q.id FROM q INNER JOIN p APPROX NEAREST 2 "
        "BY SIMILARITY array_cosine_similarity(q.e,p.e)",
        "WITH RECURSIVE t(a,b) USING KEY (a,avg(b)) AS "
        "(SELECT 1,5 UNION ALL SELECT a,b-1 FROM t WHERE b>0) TABLE t",
        "SELECT 1 FETCH FIRST 1 ROW ONLY",
    )
    for sql in queries:
        context = AgentRunCtx(run_id="contract", authorized_aliases=[], attach_configs=[])
        allowed, reason = _explain_validate_sql(sql, context)
        assert not allowed
        assert "not enabled for Agent execution" in reason
        result = asyncio.run(run_query_async(context, RunQueryArgs(sql=sql), 3))
        assert not result.ok
        assert "not enabled for Agent execution" in result.model_text


def test_agent_capability_patterns_ignore_data_and_quoted_identifiers():
    for sql in (
        "SELECT 'JOIN x APPROX NEAREST 2' AS note",
        'SELECT 1 AS "FETCH FIRST"',
        "SELECT 1 /* USING KEY (x) */",
        "SELECT $$FETCH FIRST$$ AS note",
        "SELECT $tag$USING KEY (x)$tag$ AS note",
        "SELECT $$JOIN x APPROX NEAREST 2$$ AS note",
    ):
        assert check_sql(sql, []) == (True, "ok")


def test_capability_endpoint_and_fail_closed_sql_classifier():
    client = TestClient(app)
    response = client.get("/api/capabilities")
    assert response.status_code == 200
    assert response.json()["data"]["contract_version"] == 2

    for sql in (
        "SELECT '; LIMIT' AS value",
        "SELECT * FROM q INNER JOIN p APPROX NEAREST 2 "
        "BY SIMILARITY array_cosine_similarity(q.e,p.e)",
        "WITH RECURSIVE t(a,b) USING KEY (a,avg(b)) AS "
        "(SELECT 1,5 UNION ALL SELECT a,b-1 FROM t WHERE b>0) TABLE t",
    ):
        classified = client.post("/api/sql/classify", json={"sql": sql}).json()["data"]
        assert classified == {
            "classification": "read-only",
            "read_only": True,
            "requires_confirmation": False,
        }

    for sql in ("SELECT 1; DROP TABLE t", "WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x", "nonsense"):
        classified = client.post("/api/sql/classify", json={"sql": sql}).json()["data"]
        assert classified["classification"] == "mutation-or-unknown"
        assert classified["requires_confirmation"] is True
