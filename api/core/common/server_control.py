"""持有当前运行中的 uvicorn Server 引用，供本地专用端点（桌面端 /api/system/shutdown）
请求优雅停机——直接置位 `should_exit`，不依赖 OS 信号（SIGTERM 在 Windows 上不会触发
uvicorn 的信号处理逻辑，而是直接 TerminateProcess）。

仅桌面 sidecar 入口（api/run.py）会调用 set_server()；经 `uvicorn main:app` CLI 或
Docker 启动时不会注册，request_graceful_shutdown() 会返回 False。
"""

from __future__ import annotations

from typing import Optional

_server: Optional[object] = None  # uvicorn.Server，避免在此处强制 import uvicorn


def set_server(server: object) -> None:
    global _server
    _server = server


def request_graceful_shutdown() -> bool:
    """请求正在运行的 uvicorn server 优雅退出。成功置位返回 True，无 server 注册返回 False。"""
    if _server is None:
        return False
    _server.should_exit = True  # type: ignore[attr-defined]
    return True
