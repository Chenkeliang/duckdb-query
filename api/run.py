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

    使预置的扩展(v1.2.0 起仅 excel,见 scripts/fetch_duckdb_extensions.py)
    离线即用;未预置的经扩展页下载或由 DuckDB 在首次用到时按需 INSTALL
    到这个可写目录并缓存。
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


def bind_loopback_socket() -> socket.socket:
    # 绑 :0 让 OS 分配空闲高位端口,socket 持有不关,最后经 server.run(sockets=[sock])
    # 原样交给 uvicorn。此前"绑定后立即关闭、uvicorn 稍后按 host/port 重绑"存在
    # TOCTOU 竞态:重绑要等整条重量级 import 链跑完,Windows 首启叠加杀软扫描时
    # 这个窗口长达数分钟,端口一旦被其他进程/出站连接占走,uvicorn 绑定失败
    # sys.exit(1),前端表现为「本地引擎启动超时」。
    # 只 bind 不 listen:bind 已足以独占端口;过早 listen 会让前端健康轮询的
    # TCP 握手进入内核 backlog 挂住等待(此时尚无事件循环 accept),listen 由
    # asyncio 的 Server._start_serving 在 uvicorn 真正就绪时统一调用。
    # 不用 fd= 交接:uvicorn 的 fd= 路径内部走 socket.fromfd(AF_UNIX),Windows 上
    # 会崩;sockets=[...] 是独立分支,走跨平台的 loop.create_server(sock=...)。
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if sys.platform.startswith("win"):
        # Windows 默认允许其他进程带 SO_REUSEADDR 抢绑已占用端口(POSIX 无此行为),
        # SO_EXCLUSIVEADDRUSE 关死这个口子;该常量仅 Windows 版 Python 存在。
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    sock.bind(("127.0.0.1", 0))
    return sock


def start_parent_watchdog() -> None:
    """父进程(Tauri 壳)消失后自行退出,避免后端僵尸。

    Tauri 在崩溃/被 SIGKILL/macOS `terminate:`(AppleScript quit、Dock 退出)时不会触发
    Rust 侧的优雅 kill,故后端自己看护父进程。发现父进程消失后必须走优雅停机而不是
    os._exit:硬退不关 DuckDB 连接会留脏 WAL；当前恢复策略会保留 WAL 并拒绝打开
    旧 checkpoint，避免把最后一次 checkpoint 之后的数据静默隐藏。
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
                from core.common.process_exit import hard_exit_after_duckdb_cleanup

                hard_exit_after_duckdb_cleanup(1)

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
    sock = bind_loopback_socket()
    port = sock.getsockname()[1]
    print(port, flush=True)  # 第一行 = 端口,Tauri 读 stdout
    os.environ["DUCKQUERY_PORT"] = str(port)
    from core.common.paths import write_runtime_file
    write_runtime_file(port)
    os.environ["DUCKQUERY_DESKTOP"] = "1"  # 让 main.py 注册仅桌面端可用的 /api/system/shutdown
    # import 链按重量拆分打点:用户回传 startup.log 即可分辨卡在哪个包的
    # 杀软逐文件扫描,还是卡在 system.db 打开(脏 WAL 重放无超时,任务管理器
    # 强杀后常见)。这些模块本就在 main 的依赖里,提前导入不改变行为。
    stage(f"port {port} printed (socket held); importing duckdb...")
    import duckdb  # pylint: disable=import-error,unused-import
    stage("duckdb imported; opening metadata store (system.db, WAL replay if dirty)...")
    import core.database.metadata_manager  # pylint: disable=unused-import  # 模块级单例同步打开 system.db
    stage("metadata store ready; importing app...")
    import uvicorn  # pylint: disable=import-error
    from main import app

    stage("app imported; starting uvicorn")
    # 手动构造 Server(而非 uvicorn.run())以便注册到 server_control,供 /api/system/shutdown
    # 通过 should_exit 优雅停机——比 OS 信号更可靠(Windows 上 SIGTERM 不会走 uvicorn 的信号处理)。
    from core.common.server_control import set_server

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="info")
    server = uvicorn.Server(config)
    set_server(server)
    # sockets=[...] 路径下 uvicorn 不打印 "Uvicorn running on ..."(它以为多 worker
    # 场景已由 bind_socket 打过),就绪日志由 lifespan 的 "Application startup complete."
    # 与上面的 stage 行承担。
    stage(f"handing socket to uvicorn (lifespan + serve on 127.0.0.1:{port})")
    server.run(sockets=[sock])


if __name__ == "__main__":
    main()
