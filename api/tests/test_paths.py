import importlib
from pathlib import Path

import core.common.paths as paths


def _reload():
    return importlib.reload(paths)


def test_user_data_dir_macos(monkeypatch):
    monkeypatch.setattr("sys.platform", "darwin")
    monkeypatch.setattr("os.path.expanduser", lambda p: "/Users/tester")
    p = _reload().get_user_data_dir()
    assert p == Path("/Users/tester/Library/Application Support/DuckQuery")


def test_user_data_dir_windows(monkeypatch):
    monkeypatch.setattr("sys.platform", "win32")
    monkeypatch.setenv("APPDATA", r"C:\Users\tester\AppData\Roaming")
    p = _reload().get_user_data_dir()
    assert p == Path(r"C:\Users\tester\AppData\Roaming") / "DuckQuery"


def test_config_dir_prefers_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "cfg"))
    assert _reload().get_config_dir() == tmp_path / "cfg"


def test_config_dir_falls_back_to_user_dir(monkeypatch, tmp_path):
    monkeypatch.delenv("CONFIG_DIR", raising=False)
    _reload()
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path / "ud")
    assert paths.get_config_dir() == tmp_path / "ud" / "config"


def test_secret_key_path_under_config_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "cfg"))
    assert _reload().get_secret_key_path() == tmp_path / "cfg" / "secret.key"


def test_temp_dir_under_user_dir(monkeypatch, tmp_path):
    monkeypatch.delenv("TEMP_FILES_DIR", raising=False)
    _reload()
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path / "ud")
    assert paths.get_temp_dir() == tmp_path / "ud" / "temp_files"


def test_user_data_dir_honors_app_root(monkeypatch, tmp_path):
    # 显式 env(Docker /app)优先于 per-user —— 容器内全部路径解析的锚点。
    monkeypatch.setenv("APP_ROOT", str(tmp_path / "approot"))
    assert _reload().get_user_data_dir() == tmp_path / "approot"


def test_user_data_dir_ignores_empty_app_root(monkeypatch):
    # 空串视为未设,回退 per-user(避免 APP_ROOT="" 误判成根目录)。
    monkeypatch.setenv("APP_ROOT", "")
    monkeypatch.setattr("sys.platform", "darwin")
    monkeypatch.setattr("os.path.expanduser", lambda p: "/Users/tester")
    assert _reload().get_user_data_dir() == Path(
        "/Users/tester/Library/Application Support/DuckQuery"
    )
