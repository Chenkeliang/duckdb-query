"""DatabaseManager.connections 并发安全性。

背景：连接字典曾经完全没有锁保护，被处理同步请求的事件循环线程和跑
BackgroundTasks 的工作线程共同读写。典型风险：list_connections() 的
list(self.connections.values()) 在遍历时如果有另一个线程并发
add_connection/remove_connection，CPython 会抛
RuntimeError: dictionary changed size during iteration。
（历史上还存在 .engines 字典与 execute_query() 的引擎竞态，二者已随
SQLAlchemy 引擎层退役一并删除。）
"""

from __future__ import annotations

import threading

from core.database.database_manager import DatabaseManager
from models.query_models import DatabaseConnection, DataSourceType


def _register(mgr: DatabaseManager, connection_id: str) -> DatabaseConnection:
    """直接注入内存连接：test_connection=False 不做网络 I/O 也不会预先建引擎，
    save_to_metadata=False 不落盘——这样 execute_query 首次调用时才会触发
    "按需建引擎"这条懒加载路径。"""
    connection = DatabaseConnection(
        id=connection_id,
        name=connection_id,
        type=DataSourceType.SQLITE,
        params={"database": ":memory:"},
    )
    mgr.add_connection(connection, test_connection=False, save_to_metadata=False)
    return connection


class TestListConnectionsDuringMutation:
    def test_list_connections_survives_concurrent_add_remove(self):
        """list_connections() 遍历期间，另一个线程持续 add/remove 连接，不应该
        抛异常。

        诚实说明：CPython 的 dict "changed size during iteration" 具体在什么
        样的交错时机下触发，实测很难在这种紧凑循环里稳定复现——本测试没能在
        无锁版本上可靠地测出失败（多次运行时而通过时而不通过，不是可信的
        回归信号）。保留这个测试是因为"并发读写不抛异常"本身仍然值得作为一条
        持续验证的基线，但它不能替代 database_manager.py 里那条注释所依据的
        CPython 官方文档描述的风险——那个结论是读代码得出的，不是靠这个测试
        实测复现的。"""
        mgr = DatabaseManager()
        mgr._config_loaded = True  # 跳过配置文件加载，只测字典本身的并发安全
        for i in range(20):
            _register(mgr, f"seed_{i}")

        stop = threading.Event()
        mutation_errors = []

        def mutator():
            i = 0
            while not stop.is_set():
                cid = f"churn_{i % 5}"
                try:
                    _register(mgr, cid)
                    mgr.remove_connection(cid)
                except Exception as exc:  # pragma: no cover
                    mutation_errors.append(exc)
                i += 1

        reader_errors = []

        def reader():
            for _ in range(200):
                try:
                    result = mgr.list_connections()
                    assert isinstance(result, list)
                except Exception as exc:  # pragma: no cover
                    reader_errors.append(exc)

        mutator_thread = threading.Thread(target=mutator)
        mutator_thread.start()
        reader_threads = [threading.Thread(target=reader) for _ in range(4)]
        for t in reader_threads:
            t.start()
        for t in reader_threads:
            t.join()
        stop.set()
        mutator_thread.join()

        assert not reader_errors, f"list_connections raised under concurrency: {reader_errors}"
        assert not mutation_errors, f"add/remove raised under concurrency: {mutation_errors}"
