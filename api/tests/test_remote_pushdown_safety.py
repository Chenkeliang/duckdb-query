"""Remote optimizer safety regressions (2026-09-07).

DuckDB v2.0.0-alpha39998 with mysql_scanner 1b7a31b95b can push a
``SUM(DECIMAL)`` to MySQL and return a rounded DOUBLE while DESCRIBE still
reports DECIMAL.  Until an engine/extension build passes the semantic matrix,
every connection must disable that optimizer after applying user settings.
"""

from types import SimpleNamespace

import duckdb

from core.database.duckdb_engine import _apply_perf_and_remote_settings


def _config(**remote_settings):
    return SimpleNamespace(
        duckdb_enable_profiling=False,
        duckdb_prefer_range_joins=False,
        duckdb_enable_object_cache=False,
        duckdb_preserve_insertion_order=True,
        duckdb_enable_progress_bar=False,
        duckdb_profiling_output=None,
        duckdb_remote_settings=remote_settings,
    )


def _disabled_optimizers(connection) -> set[str]:
    value = connection.execute(
        "SELECT value FROM duckdb_settings() WHERE name='disabled_optimizers'"
    ).fetchone()[0]
    return {item.strip() for item in str(value).split(",") if item.strip()}


def test_safety_policy_runs_after_user_remote_settings_and_preserves_existing_values():
    with duckdb.connect(":memory:") as connection:
        _apply_perf_and_remote_settings(
            connection,
            _config(disabled_optimizers="'filter_pushdown'"),
        )

        assert _disabled_optimizers(connection) == {
            "filter_pushdown",
            "remote_pushdown",
        }


def test_empty_user_setting_cannot_reenable_unverified_remote_pushdown():
    with duckdb.connect(":memory:") as connection:
        _apply_perf_and_remote_settings(
            connection,
            _config(disabled_optimizers=""),
        )

        assert "remote_pushdown" in _disabled_optimizers(connection)
