"""Smoke tests for pivot-only /api/pivot-query endpoints."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from core.services.pivot_query_generator import GeneratedPivotQuery, ValidationResult
from main import app
from models.pivot_query_models import PivotQueryMode

client = TestClient(app)

PIVOT_BODY = {
    "config": {
        "table_name": "sales",
        "filters": [],
        "limit": 100,
    },
    "pivot_config": {
        "rows": ["region"],
        "columns": [],
        "values": [{"column": "amount", "aggregation": "SUM"}],
    },
}


def test_pivot_generate_success_envelope():
    generation = GeneratedPivotQuery(
        mode=PivotQueryMode.PIVOT,
        base_sql='SELECT "region", "amount" FROM "sales"',
        final_sql='WITH base AS (SELECT "region", "amount" FROM "sales") SELECT * FROM pivot_result;',
        pivot_sql='SELECT * FROM base PIVOT(SUM("amount") FOR "year")',
        warnings=[],
        metadata={"strategy": "native"},
    )
    with patch(
        "routers.pivot_query.validate_query_config",
        return_value=ValidationResult(is_valid=True, errors=[], warnings=[]),
    ), patch(
        "routers.pivot_query.generate_pivot_query_sql",
        return_value=generation,
    ):
        response = client.post("/api/pivot-query/generate", json=PIVOT_BODY)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["mode"] == "pivot"
    assert "PIVOT" in body["data"]["sql"] or "pivot_result" in body["data"]["sql"]
