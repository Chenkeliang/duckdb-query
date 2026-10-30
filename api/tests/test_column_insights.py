"""Regression 2026-10-30: dynamic metrics and JSON projection execute on DuckDB."""

from contextlib import contextmanager

import duckdb
import pytest
from fastapi.testclient import TestClient

from main import app
from routers import column_analysis
from core.services.column_insights import discover_json_paths


@pytest.fixture
def insights(monkeypatch):
    with duckdb.connect(":memory:") as connection:
        connection.execute('CREATE TABLE sample (id VARCHAR, amount DECIMAL(20,4), day DATE, flag BOOLEAN, payload VARCHAR)')
        connection.executemany('INSERT INTO sample VALUES (?, ?, ?, ?, ?)', [
            ('A', '10.1200', '2026-01-01', True, '{"user":{"id":9007199254740993},"a/b":{"~x":"first"},"items":[{"name":"one"}]}'),
            ('A', '20.2300', '2026-01-02', False, '{"user":{"id":"other"},"later":true}'),
            ('B', None, None, None, 'not json'),
            (None, '30.4500', '2026-01-03', True, None),
        ])

        @contextmanager
        def lease():
            yield connection

        monkeypatch.setattr(column_analysis, 'with_duckdb_connection', lease)
        yield TestClient(app), connection


def generate(client, **config):
    response = client.post('/api/columns/insight-query', json={'table_name': 'sample', **config})
    assert response.status_code == 200, response.text
    return response.json()['data']['sql']


def test_recommendations_follow_actual_types_not_column_names(insights):
    """Regression 2026-10-30: SUM is unavailable for text; dates get ranges."""
    client, connection = insights
    columns = client.post('/api/columns/insights', json={'table_name': 'sample'}).json()['data']['columns']
    by_name = {column['name']: column for column in columns}
    assert by_name['id']['aggregations'] == ['COUNT', 'COUNT_DISTINCT']
    assert 'SUM' in by_name['amount']['aggregations']
    assert by_name['day']['aggregations'] == ['COUNT', 'COUNT_DISTINCT', 'MIN', 'MAX']
    assert 'SUM' not in by_name['flag']['aggregations']
    connection.execute('CREATE TABLE other (renamed INTEGER, nested VARIANT)')
    other = client.post('/api/columns/insights', json={'table_name': 'other'}).json()['data']['columns']
    assert 'AVG' in other[0]['aggregations']
    assert other[1]['aggregations'] == ['COUNT']
    assert other[1]['json_candidate']


def test_all_aggregates_execute_with_nulls_filters_and_no_input_limit(insights):
    """Regression 2026-10-30: cards represent whole filtered inputs, not samples."""
    client, connection = insights
    sql = generate(client, metrics=[
        {'aggregation': 'COUNT_ROWS', 'alias': 'rows'},
        {'aggregation': 'COUNT_DISTINCT', 'column': 'id', 'alias': 'devices'},
        *[{'aggregation': op, 'column': 'amount', 'alias': op.lower()} for op in ('COUNT', 'SUM', 'AVG', 'MIN', 'MAX')],
        {'aggregation': 'MIN', 'column': 'day', 'alias': 'earliest'},
    ], filters=[{'column': 'id', 'operator': '=', 'value': 'A'}])
    row = connection.execute(sql).fetchone()
    assert row[:3] == (2, 1, 2)
    assert [str(value) for value in row[3:7]] == ['30.3500', '15.175', '10.1200', '20.2300']
    assert str(row[7]) == '2026-01-01'
    connection.execute('CREATE TABLE many AS SELECT * FROM range(15001)')
    many_sql = generate(client, table_name='many', metrics=[{'aggregation': 'COUNT_ROWS', 'alias': 'all_rows'}])
    assert connection.execute(many_sql + ' LIMIT 1').fetchone() == (15001,)


def test_json_paths_merge_rows_and_escape_keys_without_returning_values(insights):
    """Regression 2026-10-30: heterogeneous rows and JSON Pointer escaping."""
    client, _ = insights
    response = client.post('/api/columns/json-paths', json={'table_name': 'sample', 'column': 'payload'})
    assert response.status_code == 200
    data = response.json()['data']
    paths = {item['pointer']: item for item in data['paths']}
    assert paths['/user/id']['types'] == ['number', 'string']
    assert paths['/user/id']['occurrences'] == 2
    assert '/later' in paths and '/a~1b/~0x' in paths and '/items/0/name' in paths
    assert (data['sampled_rows'], data['valid_rows'], data['skipped_rows']) == (4, 2, 2)
    assert '9007199254740993' not in str(data)


def test_json_projection_executes_losslessly_and_nulls_failed_casts(insights):
    """Regression 2026-10-30: large numbers survive the default text path."""
    client, connection = insights
    sql = generate(client, keep_original=False, extractions=[
        {'column': 'payload', 'pointer': '/user/id', 'alias': 'user_id'},
        {'column': 'payload', 'pointer': '/user/id', 'alias': 'integer_id', 'target_type': 'BIGINT'},
        {'column': 'payload', 'pointer': '/a~1b/~0x', 'alias': 'escaped'},
        {'column': 'payload', 'pointer': '/items/0/name', 'alias': 'first_item'},
        {'column': 'payload', 'pointer': '/user', 'alias': 'object', 'target_type': 'JSON'},
    ])
    rows = connection.execute(sql).fetchall()
    assert rows[0][:4] == ('9007199254740993', 9007199254740993, 'first', 'one')
    assert rows[1][:2] == ('other', None)
    assert rows[2] == (None,) * 5 and rows[3] == (None,) * 5
    assert rows[0][4] == '{"id":9007199254740993}'


@pytest.mark.parametrize('config', [
    {'metrics': [{'column': 'id', 'aggregation': 'SUM', 'alias': 'bad'}]},
    {'metrics': [{'column': 'missing', 'aggregation': 'COUNT', 'alias': 'bad'}]},
    {'metrics': [{'aggregation': 'COUNT_ROWS', 'alias': 'same'}, {'aggregation': 'COUNT_ROWS', 'alias': 'SAME'}]},
    {'extractions': [{'column': 'payload', 'pointer': '$.user', 'alias': 'bad'}]},
    {'extractions': [{'column': 'payload', 'pointer': '/user', 'alias': 'id'}]},
])
def test_generation_rejects_invalid_types_paths_and_colliding_aliases(insights, config):
    """Regression 2026-10-30: invalid configurations never yield executable SQL."""
    client, _ = insights
    assert client.post('/api/columns/insight-query', json={'table_name': 'sample', **config}).status_code == 400


def test_identifiers_and_path_literals_cannot_inject_sql(insights):
    """Regression 2026-10-30: quoted output aliases remain single identifiers."""
    client, connection = insights
    sql = generate(client, metrics=[{'aggregation': 'COUNT_ROWS', 'alias': 'x"; DROP TABLE sample; --'}])
    assert connection.execute(sql).fetchone() == (4,)
    sql = generate(client, keep_original=False, extractions=[{'column': 'payload', 'pointer': "/a'; DROP TABLE sample; --", 'alias': 'quoted'}])
    assert connection.execute(sql).fetchall() == [(None,)] * 4
    assert connection.execute('SELECT count(*) FROM sample').fetchone() == (4,)


def test_sampling_limits_rows_depth_paths_and_bytes(insights):
    """Regression 2026-10-30: discovery stays bounded on large data."""
    client, connection = insights
    connection.execute("CREATE TABLE large_json AS SELECT '{\"a\":1}'::JSON AS payload FROM range(1001)")
    data = client.post('/api/columns/json-paths', json={'table_name': 'large_json', 'column': 'payload'}).json()['data']
    assert data['sampled_rows'] == 100
    assert discover_json_paths(['x' * 100001])['skipped_rows'] == 1
    import json
    result = discover_json_paths([json.dumps({str(i): i for i in range(500)})])
    assert len(result['paths']) <= 200 and result['truncated']


def test_empty_aggregation_and_native_variant_paths_execute(insights):
    """Regression 2026-10-30: empty inputs retain one count/NULL result row."""
    client, connection = insights
    sql = generate(client, metrics=[
        {'aggregation': 'COUNT_ROWS', 'alias': 'rows'},
        {'aggregation': 'SUM', 'column': 'amount', 'alias': 'sum'},
    ], filters=[{'column': 'id', 'operator': '=', 'value': 'missing'}])
    assert connection.execute(sql).fetchone() == (0, None)
    connection.execute("CREATE TABLE variants AS SELECT '{\"nested\":{\"x\":1}}'::JSON::VARIANT AS payload")
    data = client.post('/api/columns/json-paths', json={'table_name': 'variants', 'column': 'payload'}).json()['data']
    assert '/nested/x' in {path['pointer'] for path in data['paths']}


def test_attached_duckdb_schema_query_and_failure_always_detach(insights, monkeypatch, tmp_path):
    """Regression 2026-10-30: same-name local/attached tables do not mix or leak."""
    client, connection = insights
    path = tmp_path / 'remote.db'
    with duckdb.connect(str(path)) as remote:
        remote.execute('CREATE TABLE sample (different INTEGER)')
        remote.execute('INSERT INTO sample VALUES (42)')
    monkeypatch.setattr(column_analysis, 'resolve_attach_configs', lambda _items: [('remote', {'type': 'duckdb', 'path': str(path)})])
    table = {'table_name': 'remote.main.sample', 'attach_databases': [{'alias': 'remote', 'connection_id': 'saved'}]}
    response = client.post('/api/columns/insights', json=table)
    assert response.status_code == 200, response.text
    assert response.json()['data']['columns'][0]['name'] == 'different'
    assert not connection.execute("SELECT 1 FROM duckdb_databases() WHERE database_name='remote'").fetchall()
    invalid = client.post('/api/columns/insight-query', json={**table, 'metrics': [{'column': 'id', 'aggregation': 'COUNT', 'alias': 'bad'}]})
    assert invalid.status_code == 400
    assert not connection.execute("SELECT 1 FROM duckdb_databases() WHERE database_name='remote'").fetchall()


def test_json_discovery_applies_filters_before_sample_limit(insights):
    """Regression 2026-10-30: old unfiltered rows hid recent JSON fields."""
    client, connection = insights
    connection.execute('CREATE TABLE events (payload VARCHAR, update_time TIMESTAMP)')
    connection.execute("INSERT INTO events SELECT 'invalid', TIMESTAMP '2020-01-01' FROM range(200)")
    connection.execute("INSERT INTO events VALUES ('{\"recent\":1}', TIMESTAMP '2026-10-21')")
    body = {'table_name': 'events', 'column': 'payload', 'filters': [
        {'column': 'update_time', 'operator': '>=', 'value': '2026-10-20 00:00:00'}
    ]}
    result = client.post('/api/columns/json-paths', json=body)
    assert result.status_code == 200, result.text
    data = result.json()['data']
    assert (data['sampled_rows'], data['valid_rows']) == (1, 1)
    assert '/recent' in {path['pointer'] for path in data['paths']}
    body['filters'][0]['column'] = 'missing'
    assert client.post('/api/columns/json-paths', json=body).status_code == 400
