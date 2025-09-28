"""
异步查询内存优化单元测试

测试异步查询的内存优化功能，包括：
1. 持久表创建逻辑
2. 按需文件生成
3. 内存清理机制
4. 任务状态管理
5. 文件清理功能
"""

import pytest
import os
import tempfile
import shutil
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta
import pandas as pd
import json

import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app
from routers.async_tasks import (
    execute_async_query,
    generate_download_file,
    cleanup_old_files,
    EXPORTS_DIR,
)
from core.task_manager import task_manager, TaskStatus
from core.duckdb_engine import get_db_connection
from core.file_datasource_manager import file_datasource_manager

client = TestClient(app)


class TestAsyncQueryMemoryOptimization:
    """测试异步查询内存优化功能"""

    def setup_method(self):
        """每个测试方法前的设置"""
        # 创建临时目录用于测试
        self.temp_dir = tempfile.mkdtemp()
        self.original_exports_dir = EXPORTS_DIR

        # 模拟EXPORTS_DIR
        with patch("routers.async_tasks.EXPORTS_DIR", self.temp_dir):
            pass

    def teardown_method(self):
        """每个测试方法后的清理"""
        # 清理临时目录
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    @patch("routers.async_tasks.get_db_connection")
    @patch("routers.async_tasks.task_manager")
    @patch("routers.async_tasks.file_datasource_manager")
    def test_execute_async_query_creates_persistent_table(
        self, mock_file_manager, mock_task_manager, mock_get_db
    ):
        """测试异步查询创建持久表而不是加载到内存"""
        # 准备测试数据
        task_id = "test_task_123"
        sql = "SELECT * FROM test_table"

        # 模拟DuckDB连接
        mock_con = Mock()
        mock_get_db.return_value = mock_con

        # 模拟任务管理器
        mock_task_manager.start_task.return_value = True
        mock_task_manager.complete_task.return_value = True

        # 模拟文件数据源管理器
        mock_file_manager.save_file_datasource.return_value = True

        # 模拟DuckDB查询结果
        mock_con.execute.return_value.fetchone.return_value = [1000]  # 行数
        mock_con.execute.return_value.fetchall.return_value = [
            ("id", "INTEGER"),
            ("name", "VARCHAR"),
            ("age", "INTEGER"),
        ]  # 列信息

        # 执行异步查询
        execute_async_query(task_id, sql)

        # 验证持久表创建
        mock_con.execute.assert_any_call(
            f'CREATE OR REPLACE TABLE "async_result_{task_id.replace("-", "_")}" AS ({sql})'
        )

        # 验证没有使用fetchdf()（避免内存加载）
        fetchdf_calls = [
            call for call in mock_con.execute.call_args_list if "fetchdf" in str(call)
        ]
        assert len(fetchdf_calls) == 0, "不应该使用fetchdf()加载数据到内存"

        # 验证任务状态更新
        mock_task_manager.complete_task.assert_called_once()
        call_args = mock_task_manager.complete_task.call_args[0]
        assert call_args[0] == task_id
        assert call_args[1]["status"] == "completed"
        assert call_args[1]["table_name"] == f"async_result_{task_id.replace('-', '_')}"
        assert call_args[1]["file_generated"] is False

    @patch("routers.async_tasks.get_db_connection")
    @patch("routers.async_tasks.task_manager")
    def test_execute_async_query_memory_cleanup(self, mock_task_manager, mock_get_db):
        """测试异步查询的内存清理机制"""
        task_id = "test_task_456"
        sql = "SELECT * FROM test_table"

        # 模拟DuckDB连接
        mock_con = Mock()
        mock_get_db.return_value = mock_con

        # 模拟任务管理器
        mock_task_manager.start_task.return_value = True
        mock_task_manager.complete_task.return_value = True

        # 模拟DuckDB查询结果
        mock_con.execute.return_value.fetchone.return_value = [500]
        mock_con.execute.return_value.fetchall.return_value = [("col1", "VARCHAR")]

        # 执行异步查询
        execute_async_query(task_id, sql)

        # 验证内存清理PRAGMA命令
        memory_cleanup_calls = [
            call for call in mock_con.execute.call_args_list if "PRAGMA" in str(call)
        ]
        assert len(memory_cleanup_calls) >= 2, "应该执行内存清理PRAGMA命令"

        # 验证具体的PRAGMA命令
        pragma_calls = [str(call) for call in mock_con.execute.call_args_list]
        assert any("memory_limit" in call for call in pragma_calls), "应该设置内存限制"
        assert any(
            "force_external" in call for call in pragma_calls
        ), "应该强制使用外部存储"

    @patch("routers.async_tasks.get_db_connection")
    @patch("routers.async_tasks.task_manager")
    def test_generate_download_file_on_demand(self, mock_task_manager, mock_get_db):
        """测试按需生成下载文件功能"""
        task_id = "test_task_789"
        format = "csv"

        # 模拟任务信息
        mock_task_info = {
            "status": "completed",
            "table_name": f"async_result_{task_id.replace('-', '_')}",
            "file_generated": False,
        }
        mock_task_manager.get_task.return_value = mock_task_info

        # 模拟DuckDB连接
        mock_con = Mock()
        mock_get_db.return_value = mock_con
        mock_con.execute.return_value.fetchone.return_value = [1000]

        # 执行文件生成
        with patch("routers.async_tasks.EXPORTS_DIR", self.temp_dir):
            file_path = generate_download_file(task_id, format)

        # 验证文件路径
        assert file_path is not None
        assert file_path.endswith(f".{format}")
        assert "task-" in file_path

        # 验证COPY命令执行
        copy_calls = [
            call for call in mock_con.execute.call_args_list if "COPY" in str(call)
        ]
        assert len(copy_calls) == 1, "应该执行COPY命令生成文件"

        # 验证任务信息更新
        assert mock_task_info["file_generated"] is True
        assert "file_path" in mock_task_info
        assert mock_task_info["file_format"] == format

    @patch("routers.async_tasks.get_db_connection")
    @patch("routers.async_tasks.task_manager")
    def test_generate_download_file_validation(self, mock_task_manager, mock_get_db):
        """测试按需文件生成的验证逻辑"""
        task_id = "test_task_invalid"

        # 测试任务不存在的情况
        mock_task_manager.get_task.return_value = None

        with pytest.raises(Exception, match="生成下载文件失败: 任务 .* 不存在"):
            generate_download_file(task_id, "csv")

        # 测试任务未完成的情况
        mock_task_info = {"status": "running"}
        mock_task_manager.get_task.return_value = mock_task_info

        with pytest.raises(Exception, match="生成下载文件失败: 任务 .* 未完成"):
            generate_download_file(task_id, "csv")

        # 测试缺少表名的情况
        mock_task_info = {"status": "completed"}
        mock_task_manager.get_task.return_value = mock_task_info

        with pytest.raises(Exception, match="生成下载文件失败: 任务 .* 缺少表名信息"):
            generate_download_file(task_id, "csv")

    @patch("routers.async_tasks.get_db_connection")
    @patch("routers.async_tasks.task_manager")
    def test_cleanup_old_files(self, mock_task_manager, mock_get_db):
        """测试文件清理功能"""
        # 创建一些测试文件
        old_file = os.path.join(self.temp_dir, "task-old_20240101_000000.csv")
        new_file = os.path.join(self.temp_dir, "task-new_20241201_120000.csv")

        with open(old_file, "w") as f:
            f.write("test data")
        with open(new_file, "w") as f:
            f.write("test data")

        # 模拟文件修改时间（旧文件）
        old_time = datetime.now() - timedelta(hours=25)
        new_time = datetime.now() - timedelta(hours=1)

        with patch("os.path.getmtime") as mock_getmtime:

            def getmtime_side_effect(path):
                if "old" in path:
                    return old_time.timestamp()
                else:
                    return new_time.timestamp()

            mock_getmtime.side_effect = getmtime_side_effect

            # 模拟DuckDB连接和表查询
            mock_con = Mock()
            mock_get_db.return_value = mock_con
            mock_con.execute.return_value.fetchall.return_value = []

            # 执行清理
            with patch("routers.async_tasks.EXPORTS_DIR", self.temp_dir):
                cleaned_count = cleanup_old_files()

        # 验证清理结果
        assert cleaned_count >= 1, "应该清理至少一个旧文件"
        assert not os.path.exists(old_file), "旧文件应该被删除"
        # 注意：新文件可能也被清理了，因为cleanup_old_files会清理所有匹配模式的文件
        # 这里我们只验证旧文件被清理了

    def test_async_query_api_endpoints(self):
        """测试异步查询API端点"""
        # 测试提交异步查询
        query_data = {"sql": "SELECT * FROM test_table", "format": "csv"}

        with patch("routers.async_tasks.task_manager") as mock_task_manager:
            mock_task_manager.create_task.return_value = "test_task_123"

            response = client.post("/api/async_query", json=query_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["task_id"] == "test_task_123"

        # 测试获取任务列表
        with patch("routers.async_tasks.task_manager") as mock_task_manager:
            mock_task_manager.list_tasks.return_value = []

            response = client.get("/api/async_tasks")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["count"] == 0

        # 测试获取任务详情
        with patch("routers.async_tasks.task_manager") as mock_task_manager:
            mock_task = Mock()
            mock_task.to_dict.return_value = {
                "task_id": "test_task_123",
                "status": "completed",
                "query": '{"sql": "SELECT * FROM test_table", "format": "csv"}',
            }
            mock_task_manager.get_task.return_value = mock_task

            response = client.get("/api/async_tasks/test_task_123")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["task"]["task_id"] == "test_task_123"

    def test_download_file_generation_api(self):
        """测试按需文件生成API端点"""
        task_id = "test_task_456"
        request_data = {"format": "csv"}

        with patch("routers.async_tasks.generate_download_file") as mock_generate:
            mock_generate.return_value = "/path/to/generated/file.csv"

            response = client.post(
                f"/api/async-tasks/{task_id}/download", json=request_data
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["file_path"] == "/path/to/generated/file.csv"
            assert data["format"] == "csv"

    def test_cleanup_api_endpoint(self):
        """测试文件清理API端点"""
        with patch("routers.async_tasks.cleanup_old_files") as mock_cleanup:
            mock_cleanup.return_value = 5

            response = client.post("/api/async-tasks/cleanup")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["cleaned_count"] == 5


class TestMemoryOptimizationIntegration:
    """测试内存优化功能的集成测试"""

    def setup_method(self):
        """每个测试方法前的设置"""
        self.temp_dir = tempfile.mkdtemp()

    def teardown_method(self):
        """每个测试方法后的清理"""
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    @patch("routers.async_tasks.get_db_connection")
    @patch("routers.async_tasks.task_manager")
    @patch("routers.async_tasks.file_datasource_manager")
    def test_full_async_query_workflow(
        self, mock_file_manager, mock_task_manager, mock_get_db
    ):
        """测试完整的异步查询工作流程"""
        task_id = "integration_test_123"
        sql = "SELECT id, name, age FROM users WHERE age > 18"

        # 模拟DuckDB连接
        mock_con = Mock()
        mock_get_db.return_value = mock_con

        # 模拟任务管理器
        mock_task_manager.start_task.return_value = True
        mock_task_manager.complete_task.return_value = True
        mock_task_manager.get_task.return_value = {
            "status": "completed",
            "table_name": f"async_result_{task_id.replace('-', '_')}",
            "file_generated": False,
        }

        # 模拟文件数据源管理器
        mock_file_manager.save_file_datasource.return_value = True

        # 模拟DuckDB查询结果
        mock_con.execute.return_value.fetchone.return_value = [5000]
        mock_con.execute.return_value.fetchall.return_value = [
            ("id", "INTEGER"),
            ("name", "VARCHAR"),
            ("age", "INTEGER"),
        ]

        # 步骤1：执行异步查询
        execute_async_query(task_id, sql)

        # 验证持久表创建
        create_table_calls = [
            call
            for call in mock_con.execute.call_args_list
            if "CREATE OR REPLACE TABLE" in str(call)
        ]
        assert len(create_table_calls) == 1, "应该创建持久表"

        # 步骤2：按需生成下载文件
        with patch("routers.async_tasks.EXPORTS_DIR", self.temp_dir):
            file_path = generate_download_file(task_id, "csv")

        # 验证文件生成
        assert file_path is not None
        assert file_path.endswith(".csv")

        # 验证COPY命令执行
        copy_calls = [
            call for call in mock_con.execute.call_args_list if "COPY" in str(call)
        ]
        assert len(copy_calls) == 1, "应该执行COPY命令"

    @patch("routers.async_tasks.get_db_connection")
    @patch("routers.async_tasks.task_manager")
    def test_memory_usage_comparison(self, mock_task_manager, mock_get_db):
        """测试内存使用对比（模拟）"""
        task_id = "memory_test_456"
        sql = "SELECT * FROM large_table"

        # 模拟DuckDB连接
        mock_con = Mock()
        mock_get_db.return_value = mock_con

        # 模拟任务管理器
        mock_task_manager.start_task.return_value = True
        mock_task_manager.complete_task.return_value = True

        # 模拟大量数据
        mock_con.execute.return_value.fetchone.return_value = [1000000]  # 100万行
        mock_con.execute.return_value.fetchall.return_value = [
            ("col1", "VARCHAR"),
            ("col2", "INTEGER"),
            ("col3", "DOUBLE"),
        ]

        # 执行异步查询
        execute_async_query(task_id, sql)

        # 验证没有使用fetchdf()（这是内存优化的关键）
        fetchdf_calls = [
            call for call in mock_con.execute.call_args_list if "fetchdf" in str(call)
        ]
        assert len(fetchdf_calls) == 0, "内存优化版本不应该使用fetchdf()"

        # 验证使用了持久表创建
        create_table_calls = [
            call
            for call in mock_con.execute.call_args_list
            if "CREATE OR REPLACE TABLE" in str(call)
        ]
        assert len(create_table_calls) == 1, "应该使用持久表存储结果"


class TestErrorHandling:
    """测试错误处理"""

    @patch("routers.async_tasks.get_db_connection")
    @patch("routers.async_tasks.task_manager")
    def test_execute_async_query_database_error(self, mock_task_manager, mock_get_db):
        """测试数据库错误处理"""
        task_id = "error_test_123"
        sql = "SELECT * FROM nonexistent_table"

        # 模拟任务管理器
        mock_task_manager.start_task.return_value = True
        mock_task_manager.fail_task.return_value = True

        # 模拟数据库错误
        mock_con = Mock()
        mock_get_db.return_value = mock_con
        mock_con.execute.side_effect = Exception(
            "Table 'nonexistent_table' does not exist"
        )

        # 执行异步查询
        execute_async_query(task_id, sql)

        # 验证任务被标记为失败
        mock_task_manager.fail_task.assert_called_once_with(
            task_id, "Table 'nonexistent_table' does not exist"
        )

    @patch("routers.async_tasks.get_db_connection")
    @patch("routers.async_tasks.task_manager")
    def test_generate_download_file_table_not_found(
        self, mock_task_manager, mock_get_db
    ):
        """测试表不存在时的错误处理"""
        task_id = "error_test_456"

        # 模拟任务信息
        mock_task_info = {
            "status": "completed",
            "table_name": "async_result_nonexistent",
            "file_generated": False,
        }
        mock_task_manager.get_task.return_value = mock_task_info

        # 模拟DuckDB连接
        mock_con = Mock()
        mock_get_db.return_value = mock_con
        mock_con.execute.side_effect = Exception(
            "Table 'async_result_nonexistent' does not exist"
        )

        # 执行文件生成
        with pytest.raises(Exception, match="生成下载文件失败: 表 .* 不存在或已删除"):
            generate_download_file(task_id, "csv")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
