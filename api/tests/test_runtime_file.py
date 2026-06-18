import json
import core.common.paths as p
from core.common.paths import get_runtime_file, write_runtime_file


def test_get_runtime_file_under_user_dir():
    assert get_runtime_file().name == "runtime.json"


def test_write_runtime_file(tmp_path, monkeypatch):
    monkeypatch.setattr(p, "get_user_data_dir", lambda: tmp_path)
    write_runtime_file(48010)
    data = json.loads((tmp_path / "runtime.json").read_text())
    assert data["port"] == 48010
    assert data["base"] == "http://127.0.0.1:48010"
    assert "pid" in data
