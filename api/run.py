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


def _seed_extensions(bundled_dir: str, user_ext_dir) -> None:
    """把包内预置的 DuckDB 扩展播种到可写用户目录(仅当目标缺失时拷贝)。

    使预置的扩展(mysql/postgres/excel)离线即用;未预置的(如 httpfs)由 DuckDB
    在首次用到时按需 INSTALL 到这个可写目录并缓存。包内只读,故必须用可写用户目录,
    否则签名后的 .app 里 DuckDB 无法写缓存/装扩展。
    """
    import shutil
    from pathlib import Path

    src = Path(bundled_dir)
    if not src.is_dir():
        return
    for ext_file in src.rglob("*.duckdb_extension"):
        dst = user_ext_dir / ext_file.relative_to(src)
        if not dst.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ext_file, dst)


def apply_desktop_env() -> None:
    base = _base_dir()
    from core.common.paths import compute_memory_limit, get_user_data_dir

    # 扩展目录用可写的用户目录:预置的离线可用,未预置的按需联网装到此处缓存
    user_ext_dir = get_user_data_dir() / "duckdb_extensions"
    user_ext_dir.mkdir(parents=True, exist_ok=True)
    if getattr(sys, "frozen", False):
        _seed_extensions(os.path.join(base, "extensions"), user_ext_dir)
    os.environ.setdefault("DUCKDB_EXTENSION_DIRECTORY", str(user_ext_dir))
    # 内存自适应(笔记本友好)
    os.environ.setdefault("DUCKDB_MEMORY_LIMIT", compute_memory_limit())
    # 桌面安全/隐私
    os.environ.setdefault("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    os.environ.setdefault("LITELLM_TELEMETRY", "False")


def pick_free_loopback_port() -> tuple[socket.socket, int]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))  # 0 -> OS 分配空闲高位端口
    return sock, sock.getsockname()[1]


def start_parent_watchdog() -> None:
    """父进程(Tauri 壳)消失后自杀,避免后端僵尸。

    Tauri 在崩溃/被 SIGKILL 时不会触发 Rust 侧的优雅 kill,故后端自己看护父进程:
    任何方式导致父进程退出,这里都会让后端自行退出(跨平台,优先 psutil)。
    """
    import threading
    import time

    ppid = os.getppid()

    def _watch() -> None:
        while True:
            time.sleep(2)
            try:
                import psutil  # pylint: disable=import-error

                alive = psutil.pid_exists(ppid)
            except Exception:
                alive = os.getppid() == ppid  # Unix: 父死后 getppid() 变 1
            if not alive:
                os._exit(0)

    threading.Thread(target=_watch, daemon=True).start()


def main() -> None:
    multiprocessing.freeze_support()  # Windows 必需
    apply_desktop_env()
    # 经 LaunchServices(双击)启动时 cwd=/ 只读;切到可写用户目录,兜住任何 cwd 相对路径
    from core.common.paths import get_user_data_dir

    _wd = get_user_data_dir()
    _wd.mkdir(parents=True, exist_ok=True)
    os.chdir(_wd)
    start_parent_watchdog()
    sock, port = pick_free_loopback_port()
    print(port, flush=True)  # 第一行 = 端口,Tauri 读 stdout
    os.environ["DUCKQUERY_PORT"] = str(port)
    from core.common.paths import write_runtime_file
    write_runtime_file(port)
    import uvicorn  # pylint: disable=import-error
    from main import app

    uvicorn.run(app, fd=sock.fileno(), log_level="info")


if __name__ == "__main__":
    main()
