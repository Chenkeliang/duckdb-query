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

    使预置的扩展(excel/httpfs/mysql/postgres,见 scripts/fetch_duckdb_extensions.py)
    离线即用;未预置的由 DuckDB 在首次用到时按需 INSTALL 到这个可写目录并缓存。
    包内只读,故必须用可写用户目录,否则签名后的 .app 里 DuckDB 无法写缓存/装扩展。
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


def pick_free_loopback_port() -> int:
    # 绑 :0 让 OS 分配空闲高位端口,随即关闭释放;uvicorn 再以 host/port 重新绑定。
    # 不复用 fd:uvicorn 的 fd= 路径内部走 socket.fromfd(AF_UNIX),Windows 上会崩。
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def start_parent_watchdog() -> None:
    """父进程(Tauri 壳)消失后自行退出,避免后端僵尸。

    Tauri 在崩溃/被 SIGKILL/macOS `terminate:`(AppleScript quit、Dock 退出)时不会触发
    Rust 侧的优雅 kill,故后端自己看护父进程。发现父进程消失后必须走优雅停机而不是
    os._exit:硬退不关 DuckDB 连接会留脏 WAL,下次启动重放失败即丢最后一次 checkpoint
    之后的所有数据(见 duckdb_recovery 的隔离逻辑)。
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
                from core.common.server_control import request_graceful_shutdown

                graceful = request_graceful_shutdown()
                try:  # 父进程已死,stderr 管道多半已断(EPIPE),日志只为 dev 直跑可见
                    print(f"[watchdog] parent gone, graceful={graceful}", file=sys.stderr, flush=True)
                except OSError:
                    pass
                if graceful:
                    # 优雅路径正常应在 1s 内退完(进程退出后本线程随之消失);
                    # 走到 os._exit 只剩一种情况:停机被长任务卡死,兜底硬退。
                    time.sleep(15)
                os._exit(1)

    threading.Thread(target=_watch, daemon=True).start()


def _make_stage_logger(log_path):
    """启动阶段计时日志:stderr(Tauri 侧转发)+ 落盘 startup.log。

    用户报「启动超时」时可回传该文件,直接看出卡在哪一步(扩展播种/import 链/
    uvicorn 绑定;Windows 首启杀软扫描通常体现为 import main 一步异常耗时)。
    """
    import time

    t0 = time.monotonic()
    try:  # 每次启动重写,只保留本次记录,避免无限增长
        open(log_path, "w", encoding="utf-8").close()
    except OSError:
        pass

    def stage(name: str) -> None:
        line = f"[startup +{time.monotonic() - t0:6.1f}s] {name}"
        print(line, file=sys.stderr, flush=True)
        try:
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except OSError:
            pass  # 日志写不进去不能影响启动

    return stage


def main() -> None:
    multiprocessing.freeze_support()  # Windows 必需
    apply_desktop_env()
    # 经 LaunchServices(双击)启动时 cwd=/ 只读;切到可写用户目录,兜住任何 cwd 相对路径
    from core.common.paths import get_user_data_dir

    _wd = get_user_data_dir()
    _wd.mkdir(parents=True, exist_ok=True)
    os.chdir(_wd)
    stage = _make_stage_logger(_wd / "startup.log")
    stage("env ready (extensions seeded)")
    start_parent_watchdog()
    port = pick_free_loopback_port()
    print(port, flush=True)  # 第一行 = 端口,Tauri 读 stdout
    os.environ["DUCKQUERY_PORT"] = str(port)
    from core.common.paths import write_runtime_file
    write_runtime_file(port)
    os.environ["DUCKQUERY_DESKTOP"] = "1"  # 让 main.py 注册仅桌面端可用的 /api/system/shutdown
    stage(f"port {port} printed; importing app...")
    import uvicorn  # pylint: disable=import-error
    from main import app

    stage("app imported; starting uvicorn")
    # host/port 跨平台可用;不用 fd=(uvicorn 的 fd 路径在 Windows 上崩,见 pick_free_loopback_port)。
    # 手动构造 Server(而非 uvicorn.run())以便注册到 server_control,供 /api/system/shutdown
    # 通过 should_exit 优雅停机——比 OS 信号更可靠(Windows 上 SIGTERM 不会走 uvicorn 的信号处理)。
    from core.common.server_control import set_server

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="info")
    server = uvicorn.Server(config)
    set_server(server)
    server.run()


if __name__ == "__main__":
    main()
