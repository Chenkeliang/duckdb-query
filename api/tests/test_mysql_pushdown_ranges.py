"""Real isolated MySQL parity for range/count/join pushdown (2026-10-30)."""

import datetime
import os
import subprocess
import uuid

import duckdb
import pymysql
import pytest

from tests.test_mysql_execution_integration import mysql_fixture, environment  # noqa: F401
from core.database.duckdb_engine import fetch_query_records, build_attach_sql
from core.database.federated_execution import federated_execution_scope, inspect_federated_pushdown


@pytest.mark.parametrize('predicate', [
    "created >= '2026-09-08 01:02:03.123456'",
    "created > TIMESTAMP '2026-09-08 01:02:03.123456'",
    "created < '2026-09-08 01:02:03.123457'",
    "created BETWEEN '2026-09-08' AND '2026-09-09'",
    "TIMESTAMP '2026-09-08' <= created",
    "id >= 3 AND id <= 9",
    "id IN (1,3,18446744073709551615,NULL)",
    "amount >= 9007199254740993.1234",
    "amount = '9007199254740993.1234'",
    "id > '2.5'",
])
def test_ranges_keep_exact_values_and_types(environment, predicate):
    """New predicates narrow candidates; the original WHERE remains authoritative."""
    connection, configs, table = environment
    projection = 'id,code,amount,created'
    expected = fetch_query_records(connection, f'SELECT {projection} FROM reference WHERE {predicate} ORDER BY id')
    with federated_execution_scope(connection, f'SELECT {projection} FROM {table} WHERE {predicate} ORDER BY id', configs) as execution:
        assert execution.candidate_count == 1
        assert fetch_query_records(connection, execution.sql) == expected
        assert execution.pushdown['mode'] == 'candidate'


@pytest.mark.parametrize('kind', ['INNER', 'LEFT', 'RIGHT'])
def test_integer_join_keys_keep_duplicates_nulls_and_outer_rows(environment, kind):
    """A semijoin must never remove the preserved side or multiply duplicate keys."""
    connection, configs, table = environment
    connection.execute('CREATE TABLE keys(id BIGINT)')
    connection.execute('INSERT INTO keys VALUES (3),(3),(4),(NULL),(999),(-1)')
    query = f'SELECT l.id AS lid,r.id AS rid,r.amount FROM keys l {kind} JOIN {table} r ON l.id=r.id ORDER BY lid NULLS LAST,rid NULLS LAST'
    expected = connection.execute(query.replace(table, 'reference')).fetchall()
    with federated_execution_scope(connection, query, configs) as execution:
        assert connection.execute(execution.sql).fetchall() == expected
        if kind != 'RIGHT':
            assert execution.candidate_count == 1


def test_two_remote_tables_use_filtered_side_keys_but_keep_join_local(environment):
    """A range on one side can narrow a second remote table without CI JOIN semantics."""
    connection, configs, table = environment
    query = f"SELECT a.id,b.id,b.amount FROM {table} a JOIN {table} b ON a.id=b.id WHERE a.id BETWEEN 3 AND 4 ORDER BY a.id"
    expected = connection.execute(query.replace(table, 'reference')).fetchall()
    with federated_execution_scope(connection, query, configs) as execution:
        assert execution.candidate_count == 2
        assert connection.execute(execution.sql).fetchall() == expected


@pytest.mark.parametrize('kind', ['numeric', 'text'])
def test_keys_over_threshold_use_a_safe_range_and_keep_exact_left_join(environment, monkeypatch, kind):
    """Large key sets use bounded envelopes, not truncated key lists or changed joins."""
    from core.common.config_manager import config_manager
    connection, configs, table = environment
    monkeypatch.setattr(config_manager.get_app_config(), 'federated_semijoin_threshold', 2)
    dtype, name = ('BIGINT', 'id') if kind == 'numeric' else ('VARCHAR', 'code')
    connection.execute(f'CREATE TABLE large_keys(k {dtype})')
    keys = [(-1,), (3,), (4,), (999,), (None,)] if kind == 'numeric' else [('ORD',), ('missing',), ('中文',), (None,)]
    connection.executemany('INSERT INTO large_keys VALUES (?)', keys)
    query = f'SELECT l.k,r.id,r.amount FROM large_keys l LEFT JOIN {table} r ON l.k=r.{name} ORDER BY l.k,r.id'
    expected = connection.execute(query.replace(table, 'reference')).fetchall()
    with federated_execution_scope(connection, query, configs) as execution:
        assert execution.candidate_count == 1
        assert execution.pushdown.get('key_strategy') == 'range'
        assert connection.execute(execution.sql).fetchall() == expected


@pytest.mark.parametrize('predicate', [
    "created >= '2026-09-08 01:02:03.123456'", "id >= 3", "code='ORD'", "code IN ('ORD','é')", "id > 999",
])
def test_remote_counts_preserve_binary_text_nulls_types_and_aliases(environment, predicate):
    """COUNT DISTINCT must retain case, accents, padding and BIGINT result types."""
    connection, configs, table = environment
    projection = 'count(*) AS rows, count(code) AS nonnull, count(DISTINCT code) AS distinct_code, count(DISTINCT amount) AS distinct_amount'
    expected = fetch_query_records(connection, f'SELECT {projection} FROM reference WHERE {predicate}')
    sql = f'SELECT {projection} FROM {table} WHERE {predicate} LIMIT 10000'
    report = inspect_federated_pushdown(connection, sql, configs)
    assert report['mode'] == 'remote-count'
    with federated_execution_scope(connection, sql, configs) as execution:
        assert execution.pushdown['mode'] == 'remote-count'
        assert execution.candidate_count == 0
        assert fetch_query_records(connection, execution.sql) == expected


def test_sampling_streams_exact_filtered_limit_without_materializing_all_matches(environment):
    """Discovery applies predicates before its source LIMIT and avoids full CTAS."""
    connection, configs, table = environment
    sql = f"SELECT id,code FROM {table} WHERE code='ORD' LIMIT 1"
    expected = connection.execute("SELECT id,code FROM reference WHERE code='ORD' LIMIT 1").fetchall()
    with federated_execution_scope(connection, sql, configs, stream_candidates=True) as execution:
        assert execution.candidate_count == 1
        assert '__mysql_candidate_' not in execution.sql
        assert 'LIMIT 1' in execution.sql
        assert connection.execute(execution.sql).fetchall() == expected


def test_streaming_never_limits_aggregate_inputs_offsets_or_or_false_positives(environment):
    """A source LIMIT is legal only after every exact filter and before no aggregate."""
    connection, configs, table = environment
    queries = [
        "SELECT id,code FROM {table} WHERE (code='ORD' OR id=10) AND id>9 LIMIT 1",
        "SELECT sum(amount) FROM {table} WHERE id>=1 LIMIT 1",
        "SELECT id,code FROM {table} WHERE code='ORD' LIMIT 1 OFFSET 1",
        "SELECT code,count(*) FROM {table} WHERE id>=1 GROUP BY code ORDER BY code LIMIT 2",
    ]
    for template in queries:
        expected = connection.execute(template.format(table='reference')).fetchall()
        with federated_execution_scope(connection, template.format(table=table), configs, stream_candidates=True) as execution:
            assert connection.execute(execution.sql).fetchall() == expected


def test_remote_count_cancellation_never_publishes_a_staged_result(environment, monkeypatch):
    """Cancellation after source COUNT wins over publication and cleans its result."""
    from core.database import federated_execution
    from core.database.connection_registry import connection_registry
    connection, configs, table = environment
    query_id = 'count-cancel-' + uuid.uuid4().hex
    connection_registry.register(query_id, connection)
    materialize = federated_execution._temporary_table
    def cancel_after_count(*args):
        result = materialize(*args)
        connection_registry.interrupt_with_remote(query_id)
        return result
    monkeypatch.setattr(federated_execution, '_temporary_table', cancel_after_count)
    try:
        with pytest.raises(duckdb.InterruptException):
            with federated_execution_scope(connection, f'SELECT count(*) FROM {table}', configs, query_id):
                pytest.fail('A cancelled source COUNT must not publish')
        assert not connection.execute("SELECT table_name FROM duckdb_tables() WHERE table_name LIKE '__mysql_candidate_%'").fetchall()
    finally:
        connection_registry.unregister(query_id)


def test_decimal_sum_stays_exact_with_range_candidates(environment):
    """SUM/AVG stay in DuckDB, so range optimization never rounds DECIMAL input."""
    connection, configs, table = environment
    projection = 'sum(amount) AS total,avg(amount) AS average,count(*) AS rows'
    expected = fetch_query_records(connection, f"SELECT {projection} FROM reference WHERE created >= '2026-09-08'")
    with federated_execution_scope(connection, f"SELECT {projection} FROM {table} WHERE created >= '2026-09-08'", configs) as execution:
        assert execution.pushdown['mode'] == 'candidate'
        assert fetch_query_records(connection, execution.sql) == expected


def test_zero_dates_follow_native_null_conversion_policy(environment, mysql_fixture):
    """Offloaded counts must not treat zero dates as values when the reader uses NULL."""
    connection, configs, _ = environment
    config, _, _ = mysql_fixture
    server = pymysql.connect(**{k: v for k, v in config.items() if k != 'type'}, autocommit=True)
    table = 'dq_zero_' + uuid.uuid4().hex[:10]
    with server.cursor() as cursor:
        cursor.execute("SET SESSION sql_mode=''")
        cursor.execute(f'CREATE TABLE `{table}` (updated DATETIME NULL)')
        cursor.execute(f"INSERT INTO `{table}` VALUES ('0000-00-00 00:00:00'),('2026-10-21'),(NULL)")
    try:
        connection.execute('CALL mysql_clear_cache()')
        connection.execute('SET mysql_incomplete_dates_as_nulls=true')
        connection.execute(f'CREATE TABLE zero_reference AS SELECT * FROM m."{table}"')
        for condition in ("updated < '2026-10-21'", "updated != '2026-10-21'", "updated >= '2026-10-21'", 'updated IS NULL'):
            expected = connection.execute(f'SELECT count(*) FROM zero_reference WHERE {condition}').fetchall()
            with federated_execution_scope(connection, f'SELECT count(*) FROM m."{table}" WHERE {condition}', configs) as execution:
                assert connection.execute(execution.sql).fetchall() == expected
        connection.execute('SET mysql_incomplete_dates_as_nulls=false')
        with pytest.raises(duckdb.Error):
            with federated_execution_scope(connection, f"SELECT count(*) FROM m.\"{table}\" WHERE updated < '2026-10-21'", configs) as execution:
                connection.execute(execution.sql).fetchall()
    finally:
        with server.cursor() as cursor:
            cursor.execute(f'DROP TABLE `{table}`')
        server.close()


def test_pushdown_reduces_remote_rows_sent_for_count_and_remote_join(environment, mysql_fixture):
    """Measure protocol bytes on 100k isolated rows, not wall-clock timing."""
    container = os.getenv('DUCKQUERY_TEST_MYSQL_CONTAINER')
    if not container:
        pytest.skip('The isolated MySQL container is required for NIC transfer counters')
    connection, configs, _ = environment
    config, _, _ = mysql_fixture
    server = pymysql.connect(**{k: v for k, v in config.items() if k != 'type'}, autocommit=True)
    table = 'dq_perf_' + uuid.uuid4().hex[:10]
    with server.cursor() as cursor:
        cursor.execute(f'CREATE TABLE `{table}` (id BIGINT PRIMARY KEY, amount DECIMAL(20,4), updated DATETIME(6), KEY idx_updated(updated))')
        cursor.executemany(f'INSERT INTO `{table}` VALUES (%s,%s,%s)', [
            (i, '9007199254740993.1234', datetime.datetime(2026, 10, 21) if i % 1000 == 0 else
             datetime.datetime(2019, 1, 1) + datetime.timedelta(seconds=(i * 104729) % 180000000, microseconds=(i * 13007) % 1000000))
            for i in range(100000)
        ])
    def sent():
        return int(subprocess.check_output(['docker', 'exec', container, 'cat', '/sys/class/net/eth0/statistics/tx_bytes'], text=True))
    try:
        connection.execute('CALL mysql_clear_cache()')
        connection.execute("SET disabled_optimizers='remote_pushdown,filter_pushdown,join_filter_pushdown,in_clause,cte_filter_pusher'")
        reference = f'm."{table}"'
        count_sql = f"SELECT count(*) FROM {reference} WHERE updated >= '2026-10-20'"
        before = sent()
        expected = connection.execute(count_sql).fetchall()
        baseline_sent = sent() - before
        before = sent()
        with federated_execution_scope(connection, count_sql, configs) as execution:
            assert execution.pushdown['mode'] == 'remote-count'
            assert connection.execute(execution.sql).fetchall() == expected == [(100,)]
        optimized_sent = sent() - before
        assert baseline_sent >= 100000
        assert optimized_sent < baseline_sent / 5
        print(f'COUNT MySQL NIC bytes: {baseline_sent} -> {optimized_sent}')

        join_sql = f"SELECT a.id,b.amount FROM {reference} a JOIN {reference} b ON a.id=b.id WHERE a.updated >= '2026-10-20' ORDER BY a.id"
        before = sent()
        expected = connection.execute(join_sql).fetchall()
        baseline_sent = sent() - before
        before = sent()
        with federated_execution_scope(connection, join_sql, configs) as execution:
            assert execution.candidate_count == 2
            assert connection.execute(execution.sql).fetchall() == expected
        optimized_sent = sent() - before
        assert baseline_sent >= 100000
        assert optimized_sent < baseline_sent / 5
        print(f'JOIN MySQL NIC bytes: {baseline_sent} -> {optimized_sent}')
    finally:
        with server.cursor() as cursor:
            cursor.execute(f'DROP TABLE `{table}`')
        server.close()


@pytest.mark.parametrize('zone', ['+00:00', '+08:00', '-05:00', 'America/New_York'])
def test_mysql_timestamp_counts_match_native_wall_clock_across_session_zones(mysql_fixture, zone):
    """TIMESTAMP range predicates must match the values DuckDB actually reads."""
    config, _, _ = mysql_fixture
    server = pymysql.connect(**{k: v for k, v in config.items() if k != 'type'}, autocommit=True)
    table = 'dq_timestamp_' + zone.replace(':', '').replace('+', 'p').replace('-', 'm').replace('/', '_')
    with server.cursor() as cursor:
        cursor.execute('SELECT @@global.time_zone')
        previous_zone = cursor.fetchone()[0]
        cursor.execute("SET SESSION time_zone='+00:00'")
        cursor.execute(f'CREATE TABLE `{table}` (id INTEGER, updated TIMESTAMP(6) NULL, KEY idx_updated(updated))')
        cursor.executemany(f'INSERT INTO `{table}` VALUES (%s,%s)', [
            (1, datetime.datetime(2026, 10, 19, 23, 59, 59, 999999)),
            (2, datetime.datetime(2026, 10, 20)),
            (3, datetime.datetime(2026, 10, 20, 0, 0, 0, 1)),
            (4, None),
            (5, datetime.datetime(2026, 11, 1, 5, 30)),
            (6, datetime.datetime(2026, 11, 1, 6, 30)),
        ])
        cursor.execute('SET GLOBAL time_zone=%s', [zone])
    try:
        with duckdb.connect(':memory:') as connection:
            if os.getenv('DUCKDB_EXTENSION_DIRECTORY'):
                connection.execute('SET extension_directory=?', [os.environ['DUCKDB_EXTENSION_DIRECTORY']])
            connection.execute('LOAD mysql')
            connection.execute("SET mysql_pool_acquire_mode='force'")
            connection.execute('SET mysql_pool_size=0')
            connection.execute("SET disabled_optimizers='remote_pushdown,filter_pushdown'")
            connection.execute(build_attach_sql('m', config))
            connection.execute(f'CREATE TABLE snapshot AS SELECT * FROM m.`{table}`'.replace('`', '"'))
            for condition in ("updated >= '2026-10-20 00:00:00'", "updated > '2026-10-20 00:00:00'",
                              "updated >= '2026-11-01 01:30:00'", "updated > '2026-11-01 01:30:00'",
                              "updated BETWEEN '2026-11-01 01:00:00' AND '2026-11-01 02:00:00'"):
                expected = connection.execute(f'SELECT count(*) FROM snapshot WHERE {condition}').fetchall()
                sql = f'SELECT count(*) FROM m."{table}" WHERE {condition}'
                with federated_execution_scope(connection, sql, [('m', config)]) as execution:
                    assert execution.pushdown['mode'] == 'remote-count'
                    assert connection.execute(execution.sql).fetchall() == expected
    finally:
        with server.cursor() as cursor:
            cursor.execute('SET GLOBAL time_zone=%s', [previous_zone])
            cursor.execute(f'DROP TABLE `{table}`')
        server.close()


def test_date_compared_with_timestamp_never_truncates_the_time(mysql_fixture):
    """2026-10-30: a DATE compared to a timestamp must retain its time boundary."""
    config, _, _ = mysql_fixture
    server = pymysql.connect(**{k: v for k, v in config.items() if k != 'type'}, autocommit=True)
    table = 'dq_date_' + uuid.uuid4().hex[:12]
    with server.cursor() as cursor:
        cursor.execute(f'CREATE TABLE `{table}` (id INTEGER, day DATE)')
        cursor.executemany(f'INSERT INTO `{table}` VALUES (%s,%s)', [(1, '2026-10-20'), (2, '2026-10-21'), (3, None)])
    try:
        with duckdb.connect(':memory:') as connection:
            if os.getenv('DUCKDB_EXTENSION_DIRECTORY'):
                connection.execute('SET extension_directory=?', [os.environ['DUCKDB_EXTENSION_DIRECTORY']])
            connection.execute('LOAD mysql')
            connection.execute("SET disabled_optimizers='remote_pushdown'")
            connection.execute(build_attach_sql('m', config))
            connection.execute(f'CREATE TABLE date_snapshot AS SELECT * FROM m."{table}"')
            for predicate in ("day < TIMESTAMP '2026-10-20 12:00:00'", "day = TIMESTAMP '2026-10-20 12:00:00'", "day >= TIMESTAMP '2026-10-20 12:00:00'"):
                for projection in ('count(*)', 'id,day'):
                    expected = connection.execute(f'SELECT {projection} FROM date_snapshot WHERE {predicate}').fetchall()
                    sql = f'SELECT {projection} FROM m."{table}" WHERE {predicate}'
                    with federated_execution_scope(connection, sql, [('m', config)], stream_candidates=True) as execution:
                        assert connection.execute(execution.sql).fetchall() == expected
    finally:
        with server.cursor() as cursor:
            cursor.execute(f'DROP TABLE `{table}`')
        server.close()


@pytest.mark.parametrize('kind', ['INNER', 'LEFT', 'RIGHT'])
def test_designer_projection_wrappers_keep_numeric_key_pushdown(environment, kind):
    """2026-10-30: designer SELECT-column wrappers must not hide JOIN key sources."""
    connection, configs, table = environment
    connection.execute('CREATE TABLE designer_keys(id BIGINT)')
    connection.execute('INSERT INTO designer_keys VALUES (3),(3),(4),(NULL),(999),(-1)')
    sql = (f'SELECT l.id,r.id,r.amount FROM (SELECT id FROM designer_keys) l {kind} JOIN '
           f'(SELECT id,amount FROM {table}) r ON l.id=r.id ORDER BY l.id,r.id')
    expected = connection.execute(sql.replace(table, 'reference')).fetchall()
    with federated_execution_scope(connection, sql, configs) as execution:
        assert connection.execute(execution.sql).fetchall() == expected
        if kind != 'RIGHT':
            assert execution.candidate_count == 1


def test_designer_two_remote_projection_sources_use_filtered_keys(environment):
    """2026-10-30: a filtered remote wrapper can supply keys to the second wrapper."""
    connection, configs, table = environment
    sql = (f'SELECT a.id,b.amount FROM (SELECT id FROM {table} WHERE id BETWEEN 3 AND 4) a '
           f'JOIN (SELECT id,amount FROM {table}) b ON a.id=b.id ORDER BY a.id')
    expected = connection.execute(sql.replace(table, 'reference')).fetchall()
    with federated_execution_scope(connection, sql, configs) as execution:
        assert execution.candidate_count == 2
        assert connection.execute(execution.sql).fetchall() == expected


def test_designer_computed_or_limited_wrappers_are_not_reinterpreted(environment):
    """2026-10-30: limiting/computing before JOIN must keep its original boundary."""
    connection, configs, table = environment
    connection.execute('CREATE TABLE guarded_keys(id BIGINT)')
    connection.execute('INSERT INTO guarded_keys VALUES (3),(4)')
    for inner in (f'SELECT id,amount FROM {table} ORDER BY id LIMIT 2',
                  f'SELECT id+1 AS id,amount FROM {table}',
                  f'SELECT DISTINCT id,amount FROM {table}'):
        sql = f'SELECT l.id,r.id FROM guarded_keys l LEFT JOIN ({inner}) r ON l.id=r.id ORDER BY l.id,r.id'
        expected = connection.execute(sql.replace(table, 'reference')).fetchall()
        with federated_execution_scope(connection, sql, configs) as execution:
            assert execution.candidate_count == 0
            assert connection.execute(execution.sql).fetchall() == expected


def test_projection_alias_column_lists_do_not_swap_key_meanings(environment):
    """2026-10-30: derived-table column lists can rename keys by position."""
    connection, configs, table = environment
    connection.execute('CREATE TABLE renamed_keys(code VARCHAR)')
    connection.execute("INSERT INTO renamed_keys VALUES ('中文')")
    sql = (f'SELECT l.code,r.id FROM renamed_keys l LEFT JOIN '
           f'(SELECT id,code,note FROM {table}) r(id,note,code) ON l.code=r.code ORDER BY r.id')
    expected = connection.execute(sql.replace(table, 'reference')).fetchall()
    with federated_execution_scope(connection, sql, configs) as execution:
        assert execution.candidate_count == 0
        assert connection.execute(execution.sql).fetchall() == expected


@pytest.mark.parametrize('predicate', ["code NOT LIKE '%R%'", "NOT (code LIKE '%R%')", "NOT (code NOT LIKE '%R%')"])
@pytest.mark.parametrize('projection', ['count(*) AS n', 'id,code', 'id'])
def test_negated_like_preserves_filter_polarity(environment, predicate, projection):
    """2026-10-30 crosscheck: SQLGlot stores NOT LIKE in the Like.negate flag."""
    connection, configs, table = environment
    suffix = '' if projection.startswith('count') else ' ORDER BY id'
    sql = f'SELECT {projection} FROM {table} WHERE {predicate}{suffix}'
    expected = connection.execute(sql.replace(table, 'reference')).fetchall()
    with federated_execution_scope(connection, sql, configs) as execution:
        assert connection.execute(execution.sql).fetchall() == expected
    if not projection.startswith('count'):
        # A LIMIT must not truncate the wrong (positive LIKE) candidate set.
        sql = f'SELECT {projection} FROM {table} WHERE {predicate} LIMIT 1'
        allowed = set(expected)
        with federated_execution_scope(connection, sql, configs, stream_candidates=True) as execution:
            actual = connection.execute(execution.sql).fetchall()
            assert len(actual) == min(1, len(expected))
            assert all(row in allowed for row in actual)


@pytest.mark.parametrize('aliases', [('c', 'c'), ('c', 'C')])
def test_remote_count_does_not_rename_duplicate_result_columns(environment, aliases):
    """2026-10-30 crosscheck: CTAS must not change repeated user-visible aliases."""
    connection, configs, table = environment
    sql = f'SELECT count(*) AS "{aliases[0]}",count(id) AS "{aliases[1]}" FROM {table} WHERE id>3'
    cursor = connection.execute(sql.replace(table, 'reference'))
    expected_columns, expected = cursor.description, cursor.fetchall()
    with federated_execution_scope(connection, sql, configs) as execution:
        cursor = connection.execute(execution.sql)
        assert cursor.description == expected_columns
        assert cursor.fetchall() == expected


def test_star_transformations_never_supply_untransformed_join_keys(mysql_fixture):
    """2026-10-30 crosscheck: * REPLACE/RENAME changes physical key meanings."""
    config, _, _ = mysql_fixture
    server = pymysql.connect(**{key: value for key, value in config.items() if key != 'type'}, autocommit=True)
    table = 'dq_star_' + uuid.uuid4().hex[:12]
    with server.cursor() as cursor:
        cursor.execute(f'CREATE TABLE `{table}` (id BIGINT, n BIGINT)')
        cursor.executemany(f'INSERT INTO `{table}` VALUES (%s,%s)', [(1, 11), (2, 12), (3, 13)])
    try:
        with duckdb.connect(':memory:') as connection:
            if os.getenv('DUCKDB_EXTENSION_DIRECTORY'):
                connection.execute('SET extension_directory=?', [os.environ['DUCKDB_EXTENSION_DIRECTORY']])
            connection.execute('LOAD mysql')
            connection.execute("SET disabled_optimizers='remote_pushdown'")
            connection.execute(build_attach_sql('m', config))
            connection.execute(f'CREATE TABLE star_snapshot AS SELECT * FROM m."{table}"')
            connection.execute('CREATE TABLE star_keys(id BIGINT)')
            connection.execute('INSERT INTO star_keys VALUES (1001),(1002),(NULL)')
            connection.execute('CREATE TABLE star_negative(id BIGINT)')
            connection.execute('INSERT INTO star_negative VALUES (-1),(-2),(NULL)')
            queries = [
                f'SELECT k.id,r.id FROM star_keys k LEFT JOIN (SELECT * REPLACE(id+1000 AS id) FROM m."{table}") r ON k.id=r.id ORDER BY ALL',
                f'SELECT k.id,r.id FROM (SELECT * REPLACE(-id AS id) FROM star_negative) k LEFT JOIN m."{table}" r ON k.id=r.id ORDER BY ALL',
                f'SELECT k.id,r.n FROM (SELECT * REPLACE(-id AS id) FROM star_negative) k LEFT JOIN (SELECT * RENAME(id AS n) FROM m."{table}") r ON k.id=r.n ORDER BY ALL',
            ]
            for sql in queries:
                expected = connection.execute(sql.replace(f'm."{table}"', 'star_snapshot')).fetchall()
                with federated_execution_scope(connection, sql, [('m', config)]) as execution:
                    assert connection.execute(execution.sql).fetchall() == expected
    finally:
        with server.cursor() as cursor:
            cursor.execute(f'DROP TABLE `{table}`')
        server.close()


def test_infinite_date_bounds_are_not_python_finite_sentinels(mysql_fixture):
    """2026-10-30 crosscheck: Python date conversion collapses +/-infinity sentinels."""
    config, _, _ = mysql_fixture
    server = pymysql.connect(**{key: value for key, value in config.items() if key != 'type'}, autocommit=True)
    table = 'dq_infinity_' + uuid.uuid4().hex[:12]
    with server.cursor() as cursor:
        cursor.execute(f'CREATE TABLE `{table}` (id INTEGER, d DATE, dt DATETIME(6))')
        cursor.executemany(f'INSERT INTO `{table}` VALUES (%s,%s,%s)', [
            (1, '9999-12-31', '9999-12-31 23:59:59.999999'), (2, '2026-10-30', '2026-10-30 12:00:00'), (3, None, None)])
    try:
        with duckdb.connect(':memory:') as connection:
            if os.getenv('DUCKDB_EXTENSION_DIRECTORY'):
                connection.execute('SET extension_directory=?', [os.environ['DUCKDB_EXTENSION_DIRECTORY']])
            connection.execute('LOAD mysql')
            connection.execute("SET disabled_optimizers='remote_pushdown'")
            connection.execute(build_attach_sql('m', config))
            connection.execute(f'CREATE TABLE infinity_snapshot AS SELECT * FROM m."{table}"')
            for column, literal in [('d', "'infinity'"), ('dt', "'infinity'"), ('d', "DATE 'infinity'"), ('dt', "TIMESTAMP 'infinity'")]:
                for operator in ['<', '=', '>=']:
                    for projection in ['count(*)', 'id']:
                        sql = f'SELECT {projection} FROM m."{table}" WHERE {column}{operator}{literal}'
                        expected = connection.execute(sql.replace(f'm."{table}"', 'infinity_snapshot')).fetchall()
                        with federated_execution_scope(connection, sql, [('m', config)], stream_candidates=True) as execution:
                            assert connection.execute(execution.sql).fetchall() == expected
    finally:
        with server.cursor() as cursor:
            cursor.execute(f'DROP TABLE `{table}`')
        server.close()


@pytest.mark.parametrize('stored_date', ['0000-12-30', '2026-02-31', '2026-00-12', '2026-10-00'])
def test_mysql_date_validation_matches_reader_policy(mysql_fixture, stored_date):
    """2026-10-30 crosscheck: year zero is valid; incomplete and invalid dates differ."""
    config, _, _ = mysql_fixture
    server = pymysql.connect(**{key: value for key, value in config.items() if key != 'type'}, autocommit=True)
    table = 'dq_date_policy_' + uuid.uuid4().hex[:12]
    with server.cursor() as cursor:
        cursor.execute("SET SESSION sql_mode='ALLOW_INVALID_DATES'")
        cursor.execute(f'CREATE TABLE `{table}` (d DATE, dt DATETIME)')
        cursor.execute(f'INSERT INTO `{table}` VALUES (%s,%s)', [stored_date, stored_date+' 00:00:00'])
    try:
        with duckdb.connect(':memory:') as connection:
            if os.getenv('DUCKDB_EXTENSION_DIRECTORY'):
                connection.execute('SET extension_directory=?', [os.environ['DUCKDB_EXTENSION_DIRECTORY']])
            connection.execute('LOAD mysql')
            connection.execute("SET disabled_optimizers='remote_pushdown,filter_pushdown'")
            connection.execute(build_attach_sql('m', config))
            for incomplete_as_null in [True, False]:
                connection.execute(f'SET mysql_incomplete_dates_as_nulls={str(incomplete_as_null).lower()}')
                for column in ['d', 'dt']:
                    for projection in ['count(*)', column]:
                        sql = f'SELECT {projection} FROM m."{table}" WHERE {column} < \'2026-12-31\''
                        try:
                            expected = connection.execute(sql).fetchall()
                        except duckdb.Error:
                            with pytest.raises(duckdb.Error):
                                with federated_execution_scope(connection, sql, [('m', config)]) as execution:
                                    connection.execute(execution.sql).fetchall()
                        else:
                            with federated_execution_scope(connection, sql, [('m', config)]) as execution:
                                assert connection.execute(execution.sql).fetchall() == expected
    finally:
        with server.cursor() as cursor:
            cursor.execute(f'DROP TABLE `{table}`')
        server.close()
