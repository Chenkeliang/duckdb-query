"""2026-11-03: expanding a table must never sample rows or compute statistics."""
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock
from urllib.parse import quote

import duckdb
import pytest
from fastapi.testclient import TestClient
from core.common.sql_identifiers import quote_identifier
from main import app
from routers import database_tables, duckdb_query


class MetadataGuard:
    """Run real DuckDB metadata SQL, rejecting data scans before execution."""
    def __init__(self, connection):
        self.connection = connection
        self.statements = []
        self.closed = False

    def execute(self, sql, *params):
        upper = ' '.join(sql.upper().split())
        assert not any(word in upper for word in ('COUNT(', 'COUNT (', 'SUM(', 'SUMMARIZE', 'SELECT *')), sql
        self.statements.append(sql)
        return self.connection.execute(sql, *params)

    def close(self):
        self.closed = True
        self.connection.close()


@pytest.mark.parametrize('route', ['/api/duckdb/tables/', '/api/duckdb/tables/detail/'])
def test_local_structure_uses_native_describe_without_stats(monkeypatch, route):
    """2026-11-03: DESCRIBE a billion-row view without evaluating its rows."""
    name = 'view " with spaces'
    with duckdb.connect(':memory:') as native:
        native.execute(f'CREATE VIEW {quote_identifier(name)} AS SELECT i AS id, i::DECIMAL(38,19) AS amount FROM range(1000000000) t(i)')
        guard = MetadataGuard(native)
        @contextmanager
        def context():
            yield guard
        monkeypatch.setattr(duckdb_query, 'with_duckdb_connection', context)
        monkeypatch.setattr(duckdb_query, 'get_table_metadata', lambda *_a, **_k: pytest.fail('Column expansion requested statistics'))
        response = TestClient(app).get(route + quote(name, safe='') + '?columns_only=true')
        assert response.status_code == 200, response.text
        assert response.json()['data'] == {'table_name': name, 'columns': [{'name': 'id', 'type': 'BIGINT'}, {'name': 'amount', 'type': 'DECIMAL(38,19)'}], 'column_count': 2}
        assert len(guard.statements) == 2


def test_default_local_detail_keeps_its_full_metadata_contract(monkeypatch):
    """2026-11-03: optional structure mode must not alter old callers."""
    @contextmanager
    def context():
        with duckdb.connect(':memory:') as con:
            con.execute('CREATE TABLE sample (id INTEGER)')
            yield con
    metadata = {'name': 'sample', 'row_count': 7, 'columns': [{'column_name': 'id', 'data_type': 'INTEGER', 'distinct_count': 7}]}
    called = MagicMock(return_value=SimpleNamespace(model_dump=lambda: metadata))
    monkeypatch.setattr(duckdb_query, 'with_duckdb_connection', context)
    monkeypatch.setattr(duckdb_query, 'get_table_metadata', called)
    response = TestClient(app).get('/api/duckdb/tables/sample')
    assert response.status_code == 200
    assert response.json()['data'] == {'table': metadata}
    called.assert_called_once()


@pytest.mark.parametrize('kind', ['mysql', 'postgresql'])
def test_remote_structure_only_reads_native_catalogs(monkeypatch, kind):
    """2026-11-03: no sample/index/count SQL; PG preserves native modifiers and privilege filtering."""
    params = {'host': 'synthetic.invalid', 'user': 'synthetic', 'database': 'fixture'}
    monkeypatch.setattr(database_tables, '_require_connection', lambda _: SimpleNamespace(type=kind, params=params))
    cursor, connection = MagicMock(), MagicMock()
    connection.cursor.return_value.__enter__.return_value = cursor
    if kind == 'mysql':
        cursor.fetchall.return_value = [('amount', 'decimal(38,19)', None, 'YES', '', None, '', '', '')]
        monkeypatch.setattr('pymysql.connect', lambda **_: connection)
    else:
        cursor.fetchall.return_value = [('amount', 'numeric(38,19)')]
        monkeypatch.setattr('psycopg2.connect', lambda **_: connection)
    response = TestClient(app).get('/api/datasources/databases/synthetic/tables/detail', params={'table_name': 'odd"table', 'schema': 'odd"schema', 'columns_only': 'true'})
    assert response.status_code == 200, response.text
    data = response.json()['data']
    assert data['columns'][0]['type'] == ('decimal(38,19)' if kind == 'mysql' else 'numeric(38,19)')
    assert 'row_count' not in data and 'sample_data' not in data
    cursor.execute.assert_called_once()
    sql = cursor.execute.call_args.args[0]
    assert 'COUNT(' not in sql.upper() and 'SELECT *' not in sql.upper()
    if kind == 'postgresql':
        assert 'information_schema.columns' in sql and 'format_type' in sql
        assert cursor.execute.call_args.args[1] == ('odd"table', 'odd"schema')
    else:
        assert sql.startswith('SHOW FULL COLUMNS')
    connection.close.assert_called_once()


def test_duckdb_file_structure_uses_real_catalog_without_count_or_sample(monkeypatch, tmp_path):
    """2026-11-03: file-backed expansion must stop before the old COUNT/sample path."""
    path = tmp_path / 'synthetic.duckdb'
    with duckdb.connect(str(path)) as disk:
        disk.execute('CREATE TABLE items (amount DECIMAL(38,19), detail STRUCT(code VARCHAR, ids BIGINT[]))')
    original = database_tables._open_attached_file_database
    guards = []
    def open_file(*args):
        con, db_path = original(*args)
        guard = MetadataGuard(con)
        guards.append(guard)
        return guard, db_path
    monkeypatch.setattr(database_tables, '_open_attached_file_database', open_file)
    monkeypatch.setattr(database_tables, '_require_connection', lambda _: SimpleNamespace(type='duckdb', params={'path': str(path)}))
    response = TestClient(app).get('/api/datasources/databases/synthetic/tables/detail?table_name=items&columns_only=true')
    assert response.status_code == 200, response.text
    assert response.json()['data']['columns'][0]['type'] == 'DECIMAL(38,19)'
    assert response.json()['data']['columns'][1]['type'] == 'STRUCT(code VARCHAR, ids BIGINT[])'
    assert len(guards[0].statements) == 1 and guards[0].closed
