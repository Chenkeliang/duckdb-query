import socket
import importlib
import logging
import threading
import time
from unittest.mock import patch

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
    # 扩展目录指向可写用户目录(而非只读包内目录)
    assert os.environ["DUCKDB_EXTENSION_DIRECTORY"] == str(tmp_path / "duckdb_extensions")


def test_parent_watchdog_cleans_up_duckdb_before_hard_exit(monkeypatch):
    """Regression 2026-07-28: parent loss must checkpoint before hard exit."""
    import run

    importlib.reload(run)
    order = []

    class _ImmediateThread:
        def __init__(self, target=None, **_kwargs):
            self._target = target

        def start(self):
            self._target()

    monkeypatch.setattr(run.os, "getppid", lambda: 4242)
    monkeypatch.setattr(threading, "Thread", _ImmediateThread)
    monkeypatch.setattr(time, "sleep", lambda _seconds: None)
    monkeypatch.setattr("psutil.pid_exists", lambda _pid: False)

    def _exit(code):
        order.append(("exit", code))
        raise SystemExit(code)

    monkeypatch.setattr(run.os, "_exit", _exit)
    monkeypatch.setattr(logging, "shutdown", lambda: order.append("logging_shutdown"))

    with patch(
        "core.common.server_control.request_graceful_shutdown", return_value=True
    ), patch(
        "core.database.connection_registry.connection_registry.interrupt_all",
        side_effect=lambda: order.append("queries_interrupted"),
    ), patch(
        "core.database.duckdb_pool.shutdown_all_duckdb_connections",
        side_effect=lambda: order.append("pool_closed"),
    ), pytest.raises(SystemExit):
        run.start_parent_watchdog()

    assert order == [
        "queries_interrupted",
        "pool_closed",
        "logging_shutdown",
        ("exit", 1),
    ]
