"""清理调度器回归(Codex P1-9):延迟删除改为单守护线程 + 到期堆,不再
每文件一个 time.sleep 的 BackgroundTask(会耗尽线程池、堵关机)。"""
import threading
import time

from core.services import resource_manager as rm


def _cleanup_threads():
    return [t for t in threading.enumerate() if t.name == "resource-cleanup"]


def test_deletes_after_delay(tmp_path):
    f = tmp_path / "a.txt"
    f.write_text("x")
    rm.schedule_cleanup(str(f), None, delay_seconds=0)
    # 到期(0s)后守护线程应尽快删除
    deadline = time.time() + 5
    while f.exists() and time.time() < deadline:
        time.sleep(0.05)
    assert not f.exists(), "文件未被清理"


def test_single_shared_thread_for_many_files(tmp_path):
    files = []
    for i in range(20):
        p = tmp_path / f"f{i}.txt"
        p.write_text("x")
        files.append(p)
        rm.schedule_cleanup(str(p), None, delay_seconds=0)
    # 关键:无论多少文件,清理线程只有一个(旧实现是每文件一个阻塞 worker)
    assert len(_cleanup_threads()) <= 1
    deadline = time.time() + 5
    while any(p.exists() for p in files) and time.time() < deadline:
        time.sleep(0.05)
    assert not any(p.exists() for p in files)


def test_future_delay_not_deleted_immediately(tmp_path):
    f = tmp_path / "later.txt"
    f.write_text("x")
    rm.schedule_cleanup(str(f), None, delay_seconds=3600)
    time.sleep(0.3)
    assert f.exists(), "远期任务不应被立即删除"
