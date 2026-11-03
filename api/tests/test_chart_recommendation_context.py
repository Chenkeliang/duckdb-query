"""2026-11-02: recommendations need result grain/context and remain non-executing."""

import pytest
from pydantic import ValidationError

from core.services.ai_profiles import ChartSpec, _ctx_suggest, get_profile


def test_chart_context_includes_goal_sql_and_partial_result_summary():
    """Five rows alone cannot describe result cardinality or existing aggregation."""
    context = _ctx_suggest(
        {"columns": [{"name": "avg_amount", "type": "DECIMAL(20,4)"}], "sample": []},
        {"current_sql": "SELECT day, AVG(amount) AS avg_amount FROM t GROUP BY day",
         "chart_goal": "trend", "chart_summary": {"row_count": 10, "truncated": True}},
        None,
    )
    assert "AVG(amount)" in context and "trend" in context
    assert '"truncated": true' in context
    assert "not a full distribution" in context


def test_chart_mode_is_additive_for_old_clients_and_does_not_execute_queries():
    """Legacy MCP callers retain their schema and read-only permission contract."""
    assert ChartSpec(type="bar", x="category", y=["n"]).dataMode == "rows"
    assert ChartSpec(type="bar", dataMode="aggregate").dataMode == "aggregate"
    with pytest.raises(ValidationError):
        ChartSpec(type="bar", dataMode="execute")
    profile = get_profile("suggest_chart")
    assert profile.allowed_tools == () and profile.max_sql_calls == 0
