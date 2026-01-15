"""
ConnectionRegistry 单元测试
"""

import unittest
import threading
import time
from unittest.mock import Mock, MagicMock

import duckdb

from core.database.connection_registry import ConnectionRegistry, ConnectionRecord, connection_registry


class TestConnectionRegistry(unittest.TestCase):
    """测试 ConnectionRegistry 类"""

    def setUp(self):
        """每个测试前创建新的注册表实例"""
        self.registry = ConnectionRegistry()

    def test_register_and_get(self):
        """测试注册和获取连接"""
        # 创建一个内存连接用于测试
        conn = duckdb.connect(":memory:")
        task_id = "test-task-1"
        sql = "SELECT * FROM test"

        # 注册
        self.registry.register(task_id, conn, sql)

        # 获取
        record = self.registry.get(task_id)
        self.assertIsNotNone(record)
        self.assertEqual(record.task_id, task_id)
        self.assertIs(record.connection, conn)
        self.assertEqual(record.sql_preview, sql)

        # 清理
        conn.close()

    def test_unregister(self):
        """测试注销连接"""
        conn = duckdb.connect(":memory:")
        task_id = "test-task-2"

        self.registry.register(task_id, conn, "")
        self.assertEqual(self.registry.get_active_count(), 1)

        # 注销
        result = self.registry.unregister(task_id)
        self.assertTrue(result)
        self.assertEqual(self.registry.get_active_count(), 0)
        self.assertIsNone(self.registry.get(task_id))

        # 再次注销应返回 False
        result = self.registry.unregister(task_id)
        self.assertFalse(result)

        conn.close()

    def test_interrupt(self):
        """测试中断查询"""
        conn = duckdb.connect(":memory:")
        task_id = "test-task-3"

        self.registry.register(task_id, conn, "")

        # 调用 interrupt 应返回 True（即使没有活跃查询）
        result = self.registry.interrupt(task_id)
        self.assertTrue(result)

        # 不存在的任务应返回 False
        result = self.registry.interrupt("non-existent")
        self.assertFalse(result)

        conn.close()

    def test_get_active_count(self):
        """测试获取活跃连接数"""
        self.assertEqual(self.registry.get_active_count(), 0)

        conn1 = duckdb.connect(":memory:")
        conn2 = duckdb.connect(":memory:")

        self.registry.register("task-1", conn1, "")
        self.assertEqual(self.registry.get_active_count(), 1)

        self.registry.register("task-2", conn2, "")
        self.assertEqual(self.registry.get_active_count(), 2)

        self.registry.unregister("task-1")
        self.assertEqual(self.registry.get_active_count(), 1)

        conn1.close()
        conn2.close()

    def test_cleanup_stale(self):
        """测试清理过期条目"""
        conn = duckdb.connect(":memory:")
        task_id = "stale-task"

        self.registry.register(task_id, conn, "")

        # 修改开始时间为很久以前
        record = self.registry.get(task_id)
        record.start_time = time.time() - 3600  # 1 小时前

        # 清理超过 30 分钟的条目
        cleaned = self.registry.cleanup_stale(max_age_seconds=1800)
        self.assertEqual(cleaned, 1)
        self.assertIsNone(self.registry.get(task_id))

        conn.close()

    def test_cleanup_stale_with_ignore_suffix(self):
        """测试清理时忽略特定后缀"""
        conn1 = duckdb.connect(":memory:")
        conn2 = duckdb.connect(":memory:")

        self.registry.register("task-normal", conn1, "")
        self.registry.register("task_cleanup", conn2, "")  # 使用 _cleanup 后缀

        # 设为过期
        self.registry.get("task-normal").start_time = time.time() - 3600
        self.registry.get("task_cleanup").start_time = time.time() - 3600

        # 清理但忽略 _cleanup 后缀
        cleaned = self.registry.cleanup_stale(max_age_seconds=1800, ignore_suffix="_cleanup")
        self.assertEqual(cleaned, 1)
        self.assertIsNone(self.registry.get("task-normal"))
        self.assertIsNotNone(self.registry.get("task_cleanup"))

        conn1.close()
        conn2.close()

    def test_thread_safety(self):
        """测试线程安全性"""
        errors = []
        num_threads = 10
        operations_per_thread = 100

        def worker(thread_id):
            try:
                for i in range(operations_per_thread):
                    task_id = f"thread-{thread_id}-task-{i}"
                    conn = duckdb.connect(":memory:")
                    self.registry.register(task_id, conn, f"SELECT {i}")
                    self.registry.get(task_id)
                    self.registry.unregister(task_id)
                    conn.close()
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # 应该没有错误
        self.assertEqual(len(errors), 0)
        # 所有条目都应该被注销
        self.assertEqual(self.registry.get_active_count(), 0)

    def test_get_all_tasks(self):
        """测试获取所有任务信息"""
        conn = duckdb.connect(":memory:")
        self.registry.register("debug-task", conn, "SELECT 1")

        tasks = self.registry.get_all_tasks()
        self.assertIn("debug-task", tasks)
        self.assertIn("sql_preview", tasks["debug-task"])
        self.assertIn("duration", tasks["debug-task"])

        conn.close()


class TestGlobalConnectionRegistry(unittest.TestCase):
    """测试全局单例"""

    def test_singleton_instance(self):
        """测试单例实例"""
        self.assertIsInstance(connection_registry, ConnectionRegistry)


if __name__ == "__main__":
    unittest.main()
