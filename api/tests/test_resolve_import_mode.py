"""resolve_import_mode 与 app-config json_import_column_type 联动。"""

from core.data.import_mode import resolve_import_mode


class _Cfg:
    def __init__(self, json_import_column_type: str = "auto"):
        self.json_import_column_type = json_import_column_type


def test_resolve_import_mode_explicit_variant():
    assert resolve_import_mode("variant", file_type="json") == "variant"


def test_resolve_import_mode_auto_json_uses_config(monkeypatch):
    monkeypatch.setattr(
        "core.common.config_manager.config_manager.get_app_config",
        lambda: _Cfg(json_import_column_type="variant"),
    )
    assert resolve_import_mode("auto", file_type="jsonl") == "variant"


def test_resolve_import_mode_auto_csv_ignores_config(monkeypatch):
    monkeypatch.setattr(
        "core.common.config_manager.config_manager.get_app_config",
        lambda: _Cfg(json_import_column_type="variant"),
    )
    assert resolve_import_mode("auto", file_type="csv") == "auto"
