import socket
import importlib


def test_pick_free_loopback_port_returns_bound_socket():
    import run
    importlib.reload(run)
    sock, port = run.pick_free_loopback_port()
    try:
        assert isinstance(port, int) and 1024 < port <= 65535
        assert sock.getsockname()[0] == "127.0.0.1"
    finally:
        sock.close()


def test_desktop_env_sets_memory_and_loopback(monkeypatch, tmp_path):
    monkeypatch.delenv("DUCKDB_MEMORY_LIMIT", raising=False)
    monkeypatch.delenv("DUCKDB_EXTENSION_DIRECTORY", raising=False)
    # 不触碰真实用户目录:把可写扩展目录指到 tmp(非 frozen 不会播种,无重拷贝)
    import core.common.paths as paths
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path)
    import run
    importlib.reload(run)
    run.apply_desktop_env()
    import os
    assert os.environ["DUCKDB_MEMORY_LIMIT"].endswith("GB")
    assert os.environ["LITELLM_TELEMETRY"] == "False"
    # 扩展目录指向可写用户目录(而非只读包内目录)
    assert os.environ["DUCKDB_EXTENSION_DIRECTORY"] == str(tmp_path / "duckdb_extensions")
