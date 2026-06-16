import importlib


def test_compute_memory_limit_caps_at_8gb(monkeypatch):
    import core.common.paths as paths
    importlib.reload(paths)

    class _VM:
        total = 64 * 1024 ** 3  # 64 GB

    monkeypatch.setattr("psutil.virtual_memory", lambda: _VM())
    assert paths.compute_memory_limit() == "8GB"


def test_compute_memory_limit_uses_75pct_on_small_machine(monkeypatch):
    import core.common.paths as paths
    importlib.reload(paths)

    class _VM:
        total = 8 * 1024 ** 3  # 8 GB -> 75% = 6 GB

    monkeypatch.setattr("psutil.virtual_memory", lambda: _VM())
    assert paths.compute_memory_limit() == "6GB"


def test_env_overrides_memory_limit(monkeypatch):
    monkeypatch.setenv("DUCKDB_MEMORY_LIMIT", "3GB")
    import core.common.config_manager as cm
    importlib.reload(cm)
    mgr = cm.ConfigManager()
    assert mgr.get_app_config().duckdb_memory_limit == "3GB"
