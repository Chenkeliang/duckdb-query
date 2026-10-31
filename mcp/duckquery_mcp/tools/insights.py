"""Explicit read-only wrappers for schema-driven exploration endpoints."""

from typing import Any


async def get_column_insights(client, cfg, *, table_name: str,
                              attach_databases: list | None = None) -> Any:
    """Suggest supported metrics from actual column types without scanning rows.

    Requires DuckQuery >=2.1.2. Suggestions do not infer business meaning.
    attach_databases has the same shape as federated_query.
    """
    return await client.call('POST', '/api/columns/insights', json_body={
        'table_name': table_name, 'attach_databases': attach_databases or [],
    })


async def discover_json_paths(client, cfg, *, table_name: str, column: str,
                              filters: list | None = None,
                              attach_databases: list | None = None) -> Any:
    """Discover JSON Pointer paths AFTER filters, sampling at most 100 input rows.

    Requires DuckQuery >=2.1.2. The sample is not a complete schema. NULL,
    invalid JSON and oversized values are skipped. Filters are objects such as
    {"column":"updated_at","operator":">=","value":"2026-10-01"}.
    This reads data only; it does not extract, update or create columns.
    """
    return await client.call('POST', '/api/columns/json-paths', json_body={
        'table_name': table_name, 'column': column, 'filters': filters or [],
        'attach_databases': attach_databases or [],
    })


async def generate_insight_query(client, cfg, *, table_name: str,
                                 metrics: list | None = None,
                                 extractions: list | None = None,
                                 filters: list | None = None,
                                 keep_original: bool = True,
                                 attach_databases: list | None = None) -> Any:
    """Generate validated read-only exploration SQL; NEVER execute it automatically.

    Requires DuckQuery >=2.1.2. Supply metrics OR extractions, not both.
    Metrics: [{"aggregation":"COUNT_ROWS","alias":"rows"},
              {"column":"amount","aggregation":"SUM","alias":"total"}].
    Aggregations: COUNT_ROWS | COUNT | COUNT_DISTINCT | SUM | AVG | MIN | MAX.
    Extractions: [{"column":"payload","pointer":"/id","alias":"payload_id",
                   "target_type":"VARCHAR"}]. Types: VARCHAR | BIGINT | DOUBLE |
    BOOLEAN | DATE | TIMESTAMP | JSON. VARCHAR preserves large-number precision;
    missing paths/failed conversions yield NULL; DOUBLE remains approximate.
    Metrics use all filtered input, not the JSON sampling limit. Any returned
    pushdown report is a metadata-only PLAN, not evidence of executed work.
    Review then use run_sql/federated_query to execute under their existing gates.
    """
    return await client.call('POST', '/api/columns/insight-query', json_body={
        'table_name': table_name, 'metrics': metrics or [],
        'extractions': extractions or [], 'filters': filters or [],
        'keep_original': keep_original,
        'attach_databases': attach_databases or [],
    })
