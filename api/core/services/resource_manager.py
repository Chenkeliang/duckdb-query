import heapq
import logging
import os
import shutil
import threading
import time
import uuid
from pathlib import Path

from fastapi import BackgroundTasks

logger = logging.getLogger(__name__)


def _temp_dir() -> Path:
    """可写临时目录(惰性解析,避免 import 期对 cwd 相对路径 mkdir —— 桌面冻结时 cwd 只读会崩)。"""
    from core.common.paths import get_temp_dir

    d = get_temp_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d


async def save_upload_file(upload_file) -> str:
    """Saves an uploaded file to a temporary directory and returns the path."""
    # 生成SQL兼容的文件ID，使用下划线替代连字符
    file_id = str(uuid.uuid4()).replace('-', '_')
    file_path = _temp_dir() / f"{file_id}_{upload_file.filename}"
    with open(file_path, "wb") as buffer:
        buffer.write(await upload_file.read())
    return str(file_path)


def _delete_path(file_path: str) -> None:
    try:
        if os.path.isdir(file_path):
            shutil.rmtree(file_path, ignore_errors=True)
        elif os.path.exists(file_path):
            os.remove(file_path)
    except OSError as exc:
        logger.debug("cleanup failed for %s: %s", file_path, exc)


class _CleanupScheduler:
    """单个守护线程 + 到期最小堆,统一延迟删除临时资源。

    取代旧做法(每个文件一个 time.sleep(1h/6h) 的 FastAPI BackgroundTask):
    那会为每次上传永久占用一个 AnyIO 线程池 worker(默认 40),约 40 次上传即
    耗尽线程池,并把小时级 sleep 拖进 Uvicorn 优雅停机(Codex P1-9)。
    这里全程只有一个 daemon 线程,进程退出时随之消亡,不阻塞关机。
    """

    def __init__(self):
        self._heap = []  # (expiry_ts, seq, path)
        self._seq = 0
        self._cv = threading.Condition()
        self._thread = None

    def schedule(self, file_path: str, delay_seconds: int) -> None:
        expiry = time.time() + max(0, delay_seconds)
        with self._cv:
            self._seq += 1
            heapq.heappush(self._heap, (expiry, self._seq, file_path))
            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(
                    target=self._run, name="resource-cleanup", daemon=True
                )
                self._thread.start()
            self._cv.notify()

    def _run(self) -> None:
        # 整个循环体裹 try/except:任何意外异常都不能让这唯一的清理线程死掉
        # (线程一死,后续所有延迟清理会静默失效直到有新任务触发重建)。
        while True:
            try:
                with self._cv:
                    while not self._heap:
                        self._cv.wait()
                    expiry, _seq, path = self._heap[0]
                    now = time.time()
                    if expiry > now:
                        # 睡到最近到期时刻(封顶 1h,便于被新任务唤醒重排)
                        self._cv.wait(timeout=min(expiry - now, 3600))
                        continue
                    heapq.heappop(self._heap)
                _delete_path(path)
            except Exception as exc:  # noqa: BLE001 — 守住线程存活是第一要务
                logger.warning("cleanup scheduler loop error (continuing): %s", exc)


_scheduler = _CleanupScheduler()


def schedule_cleanup(
    file_path: str, background_tasks: BackgroundTasks = None, delay_seconds: int = 3600
):
    """延迟清理一个文件/目录。

    background_tasks 参数保留以兼容既有调用点,但不再用它(见 _CleanupScheduler
    的说明):延迟删除统一交给中央守护线程,不占用请求线程池、不阻塞关机。
    """
    _scheduler.schedule(file_path, delay_seconds)
