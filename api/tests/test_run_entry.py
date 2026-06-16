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


def test_desktop_env_sets_memory_and_loopback(monkeypatch):
    monkeypatch.delenv("DUCKDB_MEMORY_LIMIT", raising=False)
    import run
    importlib.reload(run)
    run.apply_desktop_env()
    import os
    assert os.environ["DUCKDB_MEMORY_LIMIT"].endswith("GB")
    assert os.environ["LITELLM_TELEMETRY"] == "False"
