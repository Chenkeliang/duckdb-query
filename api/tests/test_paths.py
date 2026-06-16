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
