"""2026-11-03: real cross-service isolation with identical catalog/table names.

Uses only synthetic localhost servers and pytest-owned files; no installations,
business databases, model calls or external messages.
"""
from concurrent.futures import ThreadPoolExecutor
import csv
from decimal import Decimal
import importlib
import io
import socket
import time
from uuid import uuid4

import duckdb
from fastapi.testclient import TestClient
import pytest

from core.common.config_manager import config_manager
from core.data.file_datasource_manager import file_datasource_manager
from core.database.connection_registry import connection_registry
from core.database.duckdb_engine import with_duckdb_connection
from core.services.quack_results import persist_quack_query
from main import app
from models.quack_models import QuackServiceConfig
from test_quack_service import quack_server, service  # noqa: F401


@pytest.fixture
def twins(service, quack_server, monkeypatch):
    """Independent native instances share names, never data or credentials."""
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    uri, token = f'quack:127.0.0.1:{port}', "synthetic-second-'token"
    with duckdb.connect(':memory:', config={
        'extension_directory': str(quack_server['extension_directory']),
        'autoinstall_known_extensions': 'false', 'threads': '2',
    }) as second:
        second.execute('LOAD httpfs')
        second.execute('LOAD quack')
        second.execute('CREATE TABLE records AS SELECT i::INTEGER AS id, (i%3)::INTEGER AS status FROM range(13) r(i)')
        second.execute("CREATE TABLE exact_values AS SELECT '-42.1234567890123456789'::DECIMAL(38,19) AS amount, "
                       "'-170141183460469231731687303715884105728'::HUGEINT AS big, [2,NULL] AS items, "
                       "{'code':'second','n':4} AS obj, DATE '2026-11-04' AS day")
        second.execute('CALL quack_serve(?,token=?)', [uri, token])
        service._extension_directory = quack_server['extension_directory']
        a = service.save_service(QuackServiceConfig(name='Same name', uri=quack_server['uri'], token=quack_server['token']))
        b = service.save_service(QuackServiceConfig(name='Same name', uri=uri, token=token))
        monkeypatch.setattr(importlib.import_module('core.services.quack_service'), 'quack_service', service)
        monkeypatch.setattr('routers.quack.quack_service', service)
        try:
            yield dict(service=service, a=a, b=b, server_a=quack_server['server'], server_b=second,
                       uri_b=uri, token_b=token, client=TestClient(app))
        finally:
            second.execute('CALL quack_stop(?)', [uri])


def _post(state, key, sql, request_id=None):
    return state['client'].post(f'/api/quack/services/{state[key]["id"]}/execute',
        json={'sql': sql, 'is_preview': False}, headers={'X-Request-ID': request_id} if request_id else {})


def _running(server):
    return [row for row in server.execute('SELECT connection_id,query,state FROM quack_active_connections()').fetchall()
            if row[1] and '10000000000' in row[1]]


def _wait_running(server):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if _running(server):
            return
        time.sleep(.02)
    raise AssertionError('Synthetic remote query never became active')


SLOW = 'SELECT SUM(sin(i)) FROM range(10000000000) r(i)'
EXPECTED = {'a': ('1234567890123456789.1234567890123456789', str(2**127-1)),
            'b': ('-42.1234567890123456789', str(-(2**127)))}


def test_two_same_named_services_keep_concurrent_results_separate(twins):
    """2026-11-03: service ID owns sessions even with identical names/SQL."""
    for key in ('a', 'b'):
        response = twins['client'].get(f'/api/quack/services/{twins[key]["id"]}/catalogs')
        assert response.status_code == 200
        assert response.json()['data']['items'] == [{'name': 'memory', 'type': 'duckdb'}]
    jobs = ['a', 'b'] * 8
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(lambda key: _post(twins, key, 'SELECT amount,big FROM memory.main.exact_values'), jobs))
    for key, response in zip(jobs, responses):
        assert response.status_code == 200, response.text
        data = response.json()['data']
        assert (data['data'][0]['amount'], data['data'][0]['big']) == EXPECTED[key]
        assert data['quack_service_id'] == twins[key]['id']


@pytest.mark.parametrize('format', ['csv', 'parquet'])
def test_same_sql_exports_keep_source_and_precision(twins, format):
    """2026-11-03: full export cannot collapse source identity on SQL text."""
    client = twins['client']
    for key in ('a', 'b'):
        amount, big = EXPECTED[key]
        response = client.post('/api/query-results/export', json={
            'sql': 'SELECT amount,big FROM memory.main.exact_values', 'format': format,
            'quack_service_id': twins[key]['id'], 'apply_row_limit': True})
        assert response.status_code == 200, response.text
        result = response.json()['data']
        path = config_manager.get_exports_dir() / f'{result["file_id"]}.{format}'
        try:
            if format == 'csv':
                assert list(csv.DictReader(io.StringIO(client.get(result['download_url']).text))) == [{'amount': amount, 'big': big}]
            else:
                with duckdb.connect(':memory:') as reader:
                    assert reader.execute('SELECT amount,big FROM read_parquet(?)', [str(path)]).fetchone() == (Decimal(amount), big)
        finally:
            path.unlink(missing_ok=True)


def test_same_sql_local_saves_keep_source_and_native_types(twins):
    """2026-11-03: local publication cannot mix two remote catalogs."""
    for key, server in [('a', twins['server_a']), ('b', twins['server_b'])]:
        name, query_id = 'quack_cross_' + uuid4().hex, 'quack-cross-save-' + uuid4().hex
        sql = 'SELECT * FROM memory.main.exact_values'
        expected = server.execute(sql).fetchall()
        try:
            assert persist_quack_query(sql, name, twins[key]['id'], query_id)['row_count'] == 1
            with with_duckdb_connection() as local:
                assert local.execute(f'SELECT * FROM "{name}"').fetchall() == expected
                types = {row[0]: row[1] for row in local.execute(f'DESCRIBE "{name}"').fetchall()}
                assert types['amount'] == 'DECIMAL(38,19)' and types['big'] == 'HUGEINT'
            assert name not in {row[0] for row in server.execute('SHOW TABLES').fetchall()}
        finally:
            connection_registry.forget_publication(query_id)
            with with_duckdb_connection() as local:
                local.execute(f'DROP TABLE IF EXISTS "{name}"')
            file_datasource_manager.delete_file_datasource(name)


def test_cancel_a_does_not_cancel_same_sql_on_b(twins):
    """2026-11-03: one cancel must not interrupt the other service's worker."""
    ra, rb = 'cross-a-' + uuid4().hex, 'cross-b-' + uuid4().hex
    client = twins['client']
    with ThreadPoolExecutor(max_workers=2) as pool:
        a, b = pool.submit(_post, twins, 'a', SLOW, ra), pool.submit(_post, twins, 'b', SLOW, rb)
        try:
            _wait_running(twins['server_a'])
            _wait_running(twins['server_b'])
            assert client.post(f'/api/query/cancel/{ra}').status_code == 200
            response = a.result(timeout=10)
            assert response.status_code == 499, response.text
            assert not b.done() and _running(twins['server_b'])
            assert not _running(twins['server_a'])
        finally:
            client.post(f'/api/query/cancel/{ra}')
            client.post(f'/api/query/cancel/{rb}')
            a.result(timeout=15)
            b.result(timeout=15)
    assert _post(twins, 'a', 'SELECT COUNT(*) AS n FROM records').json()['data']['data'] == [{'n': 100001}]
    assert _post(twins, 'b', 'SELECT COUNT(*) AS n FROM records').json()['data']['data'] == [{'n': 13}]


def test_endpoint_edit_does_not_retarget_running_cancel(twins):
    """2026-11-03: saved configuration edits cannot change active cancellation."""
    request_id, client = 'cross-edit-' + uuid4().hex, twins['client']
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(_post, twins, 'a', SLOW, request_id)
        try:
            _wait_running(twins['server_a'])
            response = client.put(f'/api/quack/services/{twins["a"]["id"]}', json={
                'name': 'Updated endpoint', 'uri': twins['uri_b'], 'token': twins['token_b']})
            assert response.status_code == 200
            assert client.post(f'/api/query/cancel/{request_id}').status_code == 200
            assert pending.result(timeout=10).status_code == 499
            assert not _running(twins['server_a'])
        finally:
            client.post(f'/api/query/cancel/{request_id}')
            pending.result(timeout=15)
    assert _post(twins, 'a', 'SELECT COUNT(*) AS n FROM records').json()['data']['data'] == [{'n': 13}]


def test_duplicate_request_id_cannot_replace_other_service(twins):
    """2026-11-03: reused IDs must fail before overwriting remote ownership."""
    request_id, client = 'cross-duplicate-' + uuid4().hex, twins['client']
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(_post, twins, 'a', SLOW, request_id)
        try:
            _wait_running(twins['server_a'])
            duplicate = _post(twins, 'b', 'SELECT COUNT(*) AS n FROM records', request_id)
            assert duplicate.status_code == 409, duplicate.text
            assert not pending.done() and _running(twins['server_a'])
            assert client.post(f'/api/query/cancel/{request_id}').status_code == 200
            assert pending.result(timeout=10).status_code == 499
        finally:
            client.post(f'/api/query/cancel/{request_id}')
            pending.result(timeout=15)
