"""PyInstaller 冻结入口:桌面 sidecar。

Tauri 以 env 注入可写目录(CONFIG_DIR / DUCKDB_DATA_DIR / APP_DATA_DIR);
本入口补默认值、绑 127.0.0.1 随机端口、首行打印端口供 Tauri 读取。
"""

from __future__ import annotations

import multiprocessing
import os
import socket
import sys


def _base_dir() -> str:
    if getattr(sys, "frozen", False):
        # PyInstaller onedir: sys.executable is in the bundle root (e.g. dist/duckquery-api/).
        # sys._MEIPASS is the _internal/ subdir — extensions live at the bundle root, not inside
        # _internal/, so we use the executable's parent directory.
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def apply_desktop_env() -> None:
    base = _base_dir()
    # 只读资源(包内)
    os.environ.setdefault("DUCKDB_EXTENSION_DIRECTORY", os.path.join(base, "extensions"))
    # 内存自适应(笔记本友好)
    from core.common.paths import compute_memory_limit

    os.environ.setdefault("DUCKDB_MEMORY_LIMIT", compute_memory_limit())
    # 桌面安全/隐私
    os.environ.setdefault("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    os.environ.setdefault("LITELLM_TELEMETRY", "False")


def pick_free_loopback_port() -> tuple[socket.socket, int]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))  # 0 -> OS 分配空闲高位端口
    return sock, sock.getsockname()[1]


def main() -> None:
    multiprocessing.freeze_support()  # Windows 必需
    apply_desktop_env()
    sock, port = pick_free_loopback_port()
    print(port, flush=True)  # 第一行 = 端口,Tauri 读 stdout
    import uvicorn  # pylint: disable=import-error
    from main import app

    uvicorn.run(app, fd=sock.fileno(), log_level="info")


if __name__ == "__main__":
    main()
