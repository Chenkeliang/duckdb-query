import socket
import importlib

import pytest


def test_bind_loopback_socket_holds_port_until_handoff():
    import run
    importlib.reload(run)
    sock = run.bind_loopback_socket()
    try:
        host, port = sock.getsockname()
        assert host == "127.0.0.1"
        assert isinstance(port, int) and 1024 < port <= 65535
        # 端口必须被持续独占:socket 经 server.run(sockets=[sock]) 原样交给 uvicorn,
        # 不存在"先关闭再重绑"的窗口——旧实现里该窗口跨越整条重量级 import 链,
        # Windows 首启杀软扫描下长达数分钟,端口被抢即启动失败(表现为「启动超时」)。
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            with pytest.raises(OSError):
                s.bind(("127.0.0.1", port))
        finally:
            s.close()
        # 只 bind 不 listen:过早 listen 会让健康轮询的握手进 backlog 挂死 fetch,
        # listen 由 asyncio 的 Server._start_serving 在 uvicorn 就绪时统一调用。
        with pytest.raises(OSError):
            sock.accept()
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
    # 离线确定性:litellm 不得在运行时去 GitHub 拉模型价格表(国内不可达)
    assert os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] == "true"
    # 扩展目录指向可写用户目录(而非只读包内目录)
    assert os.environ["DUCKDB_EXTENSION_DIRECTORY"] == str(tmp_path / "duckdb_extensions")
