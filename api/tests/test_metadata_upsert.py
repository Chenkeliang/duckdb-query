"""Metadata upsert regressions for the shared system database."""

from contextlib import contextmanager

import duckdb
import pytest

import core.database.metadata_manager as metadata_module
import core.services.task_manager as task_module


@pytest.fixture
def isolated_system_store(monkeypatch):
    connection = duckdb.connect(":memory:")

    @contextmanager
    def _connection():
        yield connection

    monkeypatch.setattr(metadata_module, "with_system_connection", _connection)
    monkeypatch.setattr(task_module, "with_system_connection", _connection)
    monkeypatch.setattr(task_module, "start_cancellation_watchdog", lambda *_args, **_kwargs: None)

    manager = metadata_module.MetadataManager()
    tasks = task_module.TaskManager()
    try:
        yield manager, tasks
    finally:
        connection.close()


def test_partial_connection_update_keeps_system_db_usable_for_async_tasks(
    isolated_system_store,
):
    """Regression 2026-07-21: OR REPLACE invalidated indexed system.db."""
    manager, tasks = isolated_system_store
    connection_id = "SORDER"

    assert manager.save_metadata(
        "system_database_connections",
        connection_id,
        {
            "id": connection_id,
            "name": "SORDER Production",
            "type": "mysql",
            "params": {"host": "127.0.0.1", "password": "secret"},
            "status": "active",
        },
    )
    assert manager.save_metadata(
        "system_database_connections",
        connection_id,
        {"id": connection_id, "type": "mysql", "status": "active"},
    )

    manager._cache.clear()  # pylint: disable=protected-access
    saved = manager.get_database_connection(connection_id)
    assert saved["name"] == "SORDER Production"
    assert saved["params"]["host"] == "127.0.0.1"

    task_id = tasks.create_task("SELECT 1", metadata={"apply_row_limit": False})
    task = tasks.get_task(task_id)
    assert task is not None
    assert task.query == "SELECT 1"


def test_partial_file_and_favorite_upserts_preserve_existing_fields(
    isolated_system_store,
):
    """Regression 2026-07-21: generic upserts must not erase omitted fields."""
    manager, _tasks = isolated_system_store

    assert manager.save_file_datasource(
        {
            "source_id": "uploaded_table",
            "filename": "source.csv",
            "file_type": "csv",
            "row_count": 1,
            "column_count": 1,
            "columns": ["id"],
        }
    )
    assert manager.save_metadata(
        "system_file_datasources",
        "uploaded_table",
        {"source_id": "uploaded_table", "row_count": 2},
    )
    manager._cache.clear()  # pylint: disable=protected-access
    datasource = manager.get_file_datasource("uploaded_table")
    assert datasource["filename"] == "source.csv"
    assert datasource["row_count"] == 2

    assert manager.save_sql_favorite(
        {
            "id": "favorite-1",
            "name": "Original",
            "type": "duckdb",
            "sql": "SELECT 42",
        }
    )
    assert manager.save_metadata(
        "system_sql_favorites",
        "favorite-1",
        {"id": "favorite-1", "name": "Renamed"},
    )
    manager._cache.clear()  # pylint: disable=protected-access
    favorite = manager.get_sql_favorite("favorite-1")
    assert favorite["name"] == "Renamed"
    assert favorite["sql"] == "SELECT 42"


def test_connection_index_rebuild_migration_is_completed_once(isolated_system_store):
    """Regression 2026-07-21: rebuild legacy indexes once, then keep them stable."""
    _manager, _tasks = isolated_system_store
    with metadata_module.with_system_connection() as connection:
        marker = connection.execute(
            """
            SELECT status
            FROM system_migration_status
            WHERE migration_name = 'rebuild_database_connection_indexes_20260721'
            """
        ).fetchone()
        before = connection.execute(
            """
            SELECT index_name, index_oid
            FROM duckdb_indexes()
            WHERE index_name IN ('idx_db_conn_type', 'idx_db_conn_status')
            ORDER BY index_name
            """
        ).fetchall()

    assert marker == ("completed",)
    assert [row[0] for row in before] == ["idx_db_conn_status", "idx_db_conn_type"]

    metadata_module.MetadataManager()
    with metadata_module.with_system_connection() as connection:
        after = connection.execute(
            """
            SELECT index_name, index_oid
            FROM duckdb_indexes()
            WHERE index_name IN ('idx_db_conn_type', 'idx_db_conn_status')
            ORDER BY index_name
            """
        ).fetchall()

    assert after == before
