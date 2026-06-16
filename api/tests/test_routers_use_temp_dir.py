import inspect
import routers.file_ingestion as fi
import routers.chunked_upload as cu


def test_routers_resolve_temp_via_get_temp_dir():
    for mod in (fi, cu):
        src = inspect.getsource(mod)
        assert "get_temp_dir" in src, f"{mod.__name__} 应使用 get_temp_dir()"
        assert "dirname(os.path.dirname(__file__))" not in src.replace(" ", ""), \
            f"{mod.__name__} 不应再用 __file__ 相对 temp_files"
