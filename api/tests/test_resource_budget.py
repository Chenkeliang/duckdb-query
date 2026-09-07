"""Regression 2026-09-07: resource limits must hold on fallback and failure paths."""
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import Mock

import duckdb
import pytest

from core.database import resource_budget as budgets
from core.common.exceptions import BaseAPIException


def config(**updates):
    values = dict(duckdb_memory_limit="8GB", duckdb_max_temp_directory_size="1GB",
                  pool_max_connections=10, max_concurrent_queries=4, min_free_disk_bytes=256)
    return SimpleNamespace(**(values | updates))


def test_memory_headroom_and_smaller_explicit_limit(monkeypatch):
    monkeypatch.setattr(budgets, "memory_capacity_bytes", lambda: 8 * 1024**3)
    result = budgets.get_resource_budget(config())
    assert result["memory_limit_bytes"] == 6 * 1024**3
    assert result["max_connections"] == 4
    assert budgets.get_resource_budget(config(duckdb_memory_limit="1GB"))["memory_limit_bytes"] == 10**9


def test_cgroup_ceiling_beats_host_ram(monkeypatch):
    monkeypatch.setattr(budgets.psutil, "virtual_memory", lambda: SimpleNamespace(total=64 * 1024**3))
    monkeypatch.setattr(Path, "read_text", lambda *a, **kw: str(4 * 1024**3))
    assert budgets.memory_capacity_bytes() == 4 * 1024**3


@pytest.mark.parametrize("value", ["-1", "unlimited", "NaN", "0GB", "1GB'; SELECT 1"])
def test_invalid_resource_sizes_are_rejected(value):
    with pytest.raises(ValueError):
        budgets.parse_size(value, 1024**3)


def test_real_engine_receives_bounded_spill_and_memory(monkeypatch):
    monkeypatch.setattr(budgets, "memory_capacity_bytes", lambda: 8 * 1024**3)
    with duckdb.connect(":memory:") as con:
        budgets.apply_resource_budget(con, config(duckdb_memory_limit="64MiB", duckdb_max_temp_directory_size="32MiB"))
        assert con.execute("SELECT current_setting('memory_limit')").fetchone()[0] == "64.0 MiB"
        assert con.execute("SELECT current_setting('max_temp_directory_size')").fetchone()[0] == "32.0 MiB"


def test_disk_reserve_checks_both_paths(monkeypatch, tmp_path):
    spill = tmp_path / "spill"
    spill.mkdir()
    monkeypatch.setattr(budgets.shutil, "disk_usage", lambda p: SimpleNamespace(free=10 if p == spill else 1000))
    with pytest.raises(BaseAPIException) as exc:
        budgets.ensure_disk_reserve(SimpleNamespace(database_path=tmp_path / "main.db", temp_dir=spill), 100)
    assert exc.value.status_code == 507


def test_fallback_configuration_still_applies_budget(monkeypatch, tmp_path):
    from core.database import duckdb_engine, duckdb_pool
    monkeypatch.setattr(duckdb_engine, "_apply_duckdb_configuration", Mock(side_effect=RuntimeError("setup failed")))
    apply = Mock()
    monkeypatch.setattr(budgets, "apply_resource_budget", apply)
    cfg = config(duckdb_threads=2)
    pool = object.__new__(duckdb_pool.DuckDBConnectionPool)
    connection = Mock()
    pool._configure_connection(connection, cfg, str(tmp_path))
    apply.assert_called_once_with(connection, cfg)


def test_pool_factory_limits_concurrent_connections(monkeypatch):
    """The resource cap applies even when a saved pool setting requests ten slots."""
    from core.database import duckdb_pool
    from core.common.config_manager import config_manager
    cfg = config(pool_min_connections=8, pool_connection_timeout=1, pool_idle_timeout=1, pool_max_retries=1)
    monkeypatch.setattr(config_manager, "get_app_config", lambda: cfg)
    monkeypatch.setattr(duckdb_pool, "_connection_pool", None)
    constructor = Mock()
    monkeypatch.setattr(duckdb_pool, "DuckDBConnectionPool", constructor)
    duckdb_pool.get_connection_pool()
    assert constructor.call_args.kwargs["max_connections"] == 4
    assert constructor.call_args.kwargs["min_connections"] == 4
