"""
DuckDBPool 单元测试
测试 discard_connection 和 interruptible_connection
使用 mock 避免实际数据库锁冲突
"""

import unittest
import threading
from unittest.mock import Mock, MagicMock, patch

import duckdb


class TestDiscardConnection(unittest.TestCase):
    """测试 discard_connection 方法"""

    @patch('core.duckdb_pool.config_manager')
    def test_discard_nonexistent_connection(self, mock_config):
        """测试销毁不存在的连接返回 False"""
        from core.database.duckdb_pool import DuckDBConnectionPool
        
        # 设置 mock 配置
        mock_config.get_app_config.return_value = MagicMock(
            duckdb_threads=4,
            duckdb_memory_limit="1GB",
            pool_wait_timeout=10,
        )
        mock_config.get_duckdb_paths.return_value = MagicMock(
            database_path=":memory:",
            temp_dir="/tmp"
        )
        
        pool = DuckDBConnectionPool(
            min_connections=0,  # 不自动创建连接
            max_connections=2,
        )
        
        # 创建一个独立的连接（不在池中）
        fake_conn = duckdb.connect(":memory:")
        
        # 尝试销毁不在池中的连接应返回 False
        result = pool.discard_connection(fake_conn)
        self.assertFalse(result)
        
        fake_conn.close()
        pool.close_all()


class TestInterruptibleConnectionRegistry(unittest.TestCase):
    """测试 interruptible_connection 与 ConnectionRegistry 的集成"""

    def test_registration_and_unregistration(self):
        """测试注册和注销流程"""
        from core.database.connection_registry import ConnectionRegistry
        
        registry = ConnectionRegistry()
        task_id = "test-task-reg"
        conn = duckdb.connect(":memory:")
        
        # 确保开始时未注册
        self.assertIsNone(registry.get(task_id))
        
        # 注册
        registry.register(task_id, conn, "TEST SQL")
        record = registry.get(task_id)
        self.assertIsNotNone(record)
        self.assertEqual(record.sql_preview, "TEST SQL")
        
        # 注销
        result = registry.unregister(task_id)
        self.assertTrue(result)
        self.assertIsNone(registry.get(task_id))
        
        conn.close()

    def test_interrupt_registered_connection(self):
        """测试中断已注册的连接"""
        from core.database.connection_registry import ConnectionRegistry
        
        registry = ConnectionRegistry()
        task_id = "test-task-interrupt"
        conn = duckdb.connect(":memory:")
        
        registry.register(task_id, conn, "")
        
        # 调用 interrupt 应返回 True
        result = registry.interrupt(task_id)
        self.assertTrue(result)
        
        # 清理
        registry.unregister(task_id)
        conn.close()

    def test_interrupt_unregistered_connection(self):
        """测试中断未注册的连接返回 False"""
        from core.database.connection_registry import ConnectionRegistry
        
        registry = ConnectionRegistry()
        
        # 中断不存在的任务应返回 False
        result = registry.interrupt("non-existent-task")
        self.assertFalse(result)


class TestPoolStats(unittest.TestCase):
    """测试连接池统计"""

    @patch('core.duckdb_pool.config_manager')
    def test_get_stats_structure(self, mock_config):
        """测试获取统计信息的结构"""
        from core.database.duckdb_pool import DuckDBConnectionPool
        
        mock_config.get_app_config.return_value = MagicMock(
            duckdb_threads=4,
            duckdb_memory_limit="1GB",
            pool_wait_timeout=10,
        )
        mock_config.get_duckdb_paths.return_value = MagicMock(
            database_path=":memory:",
            temp_dir="/tmp"
        )
        
        pool = DuckDBConnectionPool(
            min_connections=0,
            max_connections=5,
        )
        
        stats = pool.get_stats()
        
        # 验证统计信息的键
        self.assertIn("total_connections", stats)
        self.assertIn("idle_connections", stats)
        self.assertIn("busy_connections", stats)
        self.assertIn("total_created", stats)
        self.assertIn("total_closed", stats)
        
        pool.close_all()


class TestWatchdogFunctions(unittest.TestCase):
    """测试 watchdog 相关函数"""

    @unittest.skip("Requires database access - skip in isolated tests")
    def test_start_cancellation_watchdog_singleton(self):
        """测试 watchdog 单例控制"""
        from core.services.task_manager import _watchdog_started, _watchdog_lock
        
        # 验证全局变量存在
        self.assertIsNotNone(_watchdog_lock)
        # _watchdog_started 可能是 True（如果已经初始化过 TaskManager）

    @unittest.skip("Requires database access - skip in isolated tests")
    def test_cleanup_functions_exist(self):
        """测试清理函数存在"""
        from core.services.task_manager import (
            start_cancellation_watchdog,
            cleanup_cancelling_timeout,
            cleanup_stale_registry,
        )
        
        # 验证函数可调用
        self.assertTrue(callable(start_cancellation_watchdog))
        self.assertTrue(callable(cleanup_cancelling_timeout))
        self.assertTrue(callable(cleanup_stale_registry))


if __name__ == "__main__":
    unittest.main()
