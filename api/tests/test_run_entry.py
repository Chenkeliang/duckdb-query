import socket
import importlib


def test_pick_free_loopback_port_returns_free_rebindable_port():
    import run
    importlib.reload(run)
    port = run.pick_free_loopback_port()
    assert isinstance(port, int) and 1024 < port <= 65535
    # 端口必须已释放:Windows 修复改用 uvicorn host/port 重新绑定(fd= 交接在 Windows 上崩),
    # 所以发现端口后 socket 必须关闭,否则 uvicorn bind 会 "address already in use"。
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", port))  # 不应抛错
    finally:
        s.close()


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
