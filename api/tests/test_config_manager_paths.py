import importlib
from pathlib import Path


def test_config_dir_uses_user_dir_when_no_env(monkeypatch, tmp_path):
    monkeypatch.delenv("CONFIG_DIR", raising=False)
    monkeypatch.delenv("APP_ROOT", raising=False)
    import core.common.paths as paths
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path / "ud")

    import core.common.config_manager as cm
    importlib.reload(cm)
    mgr = cm.ConfigManager()
    assert mgr.config_dir == tmp_path / "ud" / "config"


def test_project_root_does_not_use_app_or_file(monkeypatch, tmp_path):
    monkeypatch.delenv("APP_ROOT", raising=False)
    import core.common.paths as paths
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path / "ud")
    import core.common.config_manager as cm
    importlib.reload(cm)
    root = cm.ConfigManager()._resolve_project_root()
    assert root == tmp_path / "ud"
    assert str(root) != "/app"
