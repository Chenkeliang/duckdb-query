import inspect
import routers.set_operations as so


def test_no_hardcoded_app_exports_path():
    src = inspect.getsource(so)
    assert "/app/exports/" not in src, "set_operations 不应硬编码 /app/exports"
    assert "get_exports_dir" in src, "应改用 config_manager.get_exports_dir()"
