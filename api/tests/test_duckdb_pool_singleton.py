"""get_connection_pool() 懒加载单例的线程安全性。

背景：异步任务经 FastAPI BackgroundTasks 跑在真实线程池里，和处理同步请求的
事件循环线程一样会调用 get_connection_pool()。没有锁保护时，两个几乎同时到达
的首次调用都会看到 _connection_pool 是 None，各自完整构造一个连接池——各自
真实打开数据库连接、各自起一条维护线程；后赋值的那个"获胜"，先创建的那个连接
和线程永久泄漏，且短暂窗口内两个独立连接池同时持有对同一 DuckDB 文件的连接。
"""

from __future__ import annotations

import threading

import pytest

duckdb = pytest.importorskip("duckdb")

from core.database import duckdb_pool as pool_module
from core.database.duckdb_pool import DuckDBConnectionPool


@pytest.fixture(autouse=True)
def _reset_singleton():
    pool_module._connection_pool = None
    yield
    if pool_module._connection_pool is not None:
        pool_module._connection_pool.close_all()
    pool_module._connection_pool = None


def test_get_connection_pool_is_thread_safe_singleton(monkeypatch):
    """并发首次调用只应该构造一个 DuckDBConnectionPool 实例。"""
    construction_count = []
    original_init = DuckDBConnectionPool.__init__

    def counting_init(self, *args, **kwargs):
        construction_count.append(1)
        original_init(self, *args, **kwargs)

    monkeypatch.setattr(DuckDBConnectionPool, "__init__", counting_init)

    n_threads = 8
    barrier = threading.Barrier(n_threads)
    results: list[DuckDBConnectionPool] = []
    results_lock = threading.Lock()

    def worker():
        barrier.wait()  # 让所有线程尽量同时到达 get_connection_pool()，最大化竞态窗口
        pool = pool_module.get_connection_pool()
        with results_lock:
            results.append(pool)

    threads = [threading.Thread(target=worker) for _ in range(n_threads)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(construction_count) == 1, (
        f"expected exactly 1 DuckDBConnectionPool construction, got {len(construction_count)} "
        "— concurrent first calls raced past the None check"
    )
    assert len(results) == n_threads
    assert len({id(p) for p in results}) == 1, "not all threads received the same pool instance"


def test_sequential_calls_return_same_instance():
    first = pool_module.get_connection_pool()
    second = pool_module.get_connection_pool()
    assert first is second
