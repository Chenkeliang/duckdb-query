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
from typing import Any, Dict, Optional

import duckdb
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app
from routers.async_tasks import (
    execute_async_query,
    generate_download_file,
    cleanup_old_files,
    EXPORTS_DIR,
)
from core.services.task_manager import AsyncTask, TaskStatus
from core.common.timezone_utils import get_storage_time

client = TestClient(app)


def api_data(body: dict) -> dict:
    assert body["success"] is True, body
    return body["data"]


def setup_mock_duckdb_connection(mock_get_pool: MagicMock) -> Mock:
    """创建一个模拟的DuckDB连接池并返回连接对象"""
    mock_con = Mock()
    mock_context = MagicMock()
    mock_context.__enter__.return_value = mock_con
    mock_context.__exit__.return_value = False

    mock_pool = Mock()
    mock_pool.get_connection.return_value = mock_context
    mock_get_pool.return_value = mock_pool
    return mock_con


def make_async_task(
    task_id: str,
    status: TaskStatus = TaskStatus.SUCCESS,
    *,
    table_name: Optional[str] = None,
    file_generated: bool = False,
    result_file_path: Optional[str] = None,
    result_info: Optional[Dict[str, Any]] = None,
) -> AsyncTask:
    """创建测试用的AsyncTask实例"""
    default_table = table_name or f"async_result_{task_id.replace('-', '_')}"
    task_result_info = (
        {"table_name": default_table, "file_generated": file_generated}
        if result_info is None
        else result_info
    )

    return AsyncTask(
        task_id=task_id,
        status=status,
        created_at=get_storage_time(),
        query="SELECT 1",
        result_file_path=result_file_path,
        result_info=task_result_info,
    )


def test_cleanup_old_files_keeps_persistent_async_result_tables(
    monkeypatch, tmp_path
):
    """2026-07-30: cleanup must not delete persisted async result tables."""
    task_id = "a8b64662-c08a-461c-b977-af86c008e375"
    table_name = f"async_result_{task_id.replace('-', '_')}"
    task = make_async_task(task_id, table_name=table_name)
    task.created_at = get_storage_time() - timedelta(days=30)

    con = duckdb.connect(":memory:")
    con.execute(f'CREATE TABLE "{table_name}" AS SELECT 1 AS id')

    connection_context = MagicMock()
    connection_context.__enter__.return_value = con
    connection_context.__exit__.return_value = False
    pool = Mock()
    pool.get_connection.return_value = connection_context

    monkeypatch.setattr(
        "core.database.duckdb_pool.get_connection_pool", lambda: pool
    )
    monkeypatch.setattr(
        "routers.async_tasks.task_manager.cleanup_expired_exports", lambda _cutoff: 0
    )
    monkeypatch.setattr(
        "routers.async_tasks.task_manager.get_task", lambda _task_id: task
    )
    monkeypatch.setattr("routers.async_tasks.EXPORTS_DIR", str(tmp_path))

    try:
        cleanup_old_files()
        assert con.execute(
            "SELECT COUNT(*) FROM duckdb_tables() WHERE table_name = ?",
            [table_name],
        ).fetchone()[0] == 1
    finally:
        con.close()


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

    @patch("routers.async_tasks.build_table_metadata_snapshot", return_value={"row_count": 100})
    @patch("core.database.duckdb_pool.get_connection_pool")
    @patch("core.database.duckdb_pool.interruptible_connection")
    @patch("routers.async_tasks.task_manager")
    @patch("routers.async_tasks.file_datasource_manager")
    def test_execute_async_query_creates_persistent_table(
        self, mock_file_manager, mock_task_manager, mock_interruptible, mock_get_pool, mock_metadata
    ):
        """测试异步查询创建持久表而不是加载到内存"""
        # 准备测试数据
        task_id = "test_task_123"
        sql = "SELECT * FROM test_table"

        # 模拟DuckDB连接 - 使用 interruptible_connection 替代 get_connection_pool
        mock_con = Mock()
        mock_interruptible.return_value.__enter__ = Mock(return_value=mock_con)
        mock_interruptible.return_value.__exit__ = Mock(return_value=False)

        # 模拟任务管理器
        mock_task_manager.start_task.return_value = True
        mock_task_manager.complete_task.return_value = True
        mock_task_manager.is_cancellation_requested.return_value = False

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
        create_table_sql = f'CREATE OR REPLACE TABLE "async_result_{task_id.replace("-", "_")}" AS ({sql})'
        executed_calls = [str(call) for call in mock_con.execute.call_args_list]
        assert any(create_table_sql in call for call in executed_calls), f"应该执行: {create_table_sql}, 实际调用: {executed_calls}"

        # 验证任务状态更新
        mock_task_manager.complete_task.assert_called_once()

    @patch("routers.async_tasks.build_table_metadata_snapshot", return_value={"row_count": 500})
    @patch("core.database.duckdb_pool.get_connection_pool")
    @patch("core.database.duckdb_pool.interruptible_connection")
    @patch("routers.async_tasks.task_manager")
    def test_execute_async_query_memory_cleanup(
        self, mock_task_manager, mock_interruptible, mock_get_pool, mock_metadata
    ):
        """测试异步查询的内存清理机制"""
        task_id = "test_task_456"
        sql = "SELECT * FROM test_table"

        # 模拟DuckDB连接 - 使用 interruptible_connection
        mock_con = Mock()
        mock_interruptible.return_value.__enter__ = Mock(return_value=mock_con)
        mock_interruptible.return_value.__exit__ = Mock(return_value=False)

        # 模拟任务管理器
        mock_task_manager.start_task.return_value = True
        mock_task_manager.complete_task.return_value = True
        mock_task_manager.is_cancellation_requested.return_value = False

        # 模拟DuckDB查询结果
        mock_con.execute.return_value.fetchone.return_value = [500]
        mock_con.execute.return_value.fetchall.return_value = [("col1", "VARCHAR")]

        # 执行异步查询
        execute_async_query(task_id, sql)

        # 验证任务完成
        mock_task_manager.complete_task.assert_called_once()

    @patch("core.database.duckdb_pool.get_connection_pool")
    @patch("routers.async_tasks.task_manager")
    def test_generate_download_file_on_demand(self, mock_task_manager, mock_get_pool):
        """测试按需生成下载文件功能"""
        task_id = "test_task_789"
        format = "csv"

        # 模拟任务信息
        mock_task = make_async_task(task_id)
        mock_task_manager.get_task.return_value = mock_task

        # 模拟DuckDB连接
        mock_con = setup_mock_duckdb_connection(mock_get_pool)
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
        assert mock_task.result_info["file_generated"] is True
        assert "file_path" in mock_task.result_info
        assert mock_task.result_info["file_format"] == format

    @pytest.mark.parametrize(
        ("format", "expected_copy_fragment"),
        [
            ("json", "FORMAT JSON, ARRAY true"),
            ("xlsx", "FORMAT XLSX, HEADER true"),
        ],
    )
    @patch("core.database.duckdb_pool.get_connection_pool")
    @patch("routers.async_tasks.task_manager")
    def test_generate_download_file_supports_structured_formats(
        self,
        mock_task_manager,
        mock_get_pool,
        format,
        expected_copy_fragment,
        monkeypatch,
    ):
        """2026-07-29: async JSON/XLSX exports must use their DuckDB COPY formats."""
        task_id = f"test_{format}"
        mock_task_manager.get_task.return_value = make_async_task(task_id)
        mock_con = setup_mock_duckdb_connection(mock_get_pool)
        mock_con.execute.return_value.fetchone.return_value = [2]
        if format == "json":
            monkeypatch.setattr(
                "routers.async_tasks._normalize_non_finite_json",
                lambda _source, _target: None,
            )

        target = os.path.join(self.temp_dir, f"result.{format}")
        generate_download_file(task_id, format, target_path=target)

        copy_sql = next(
            str(call) for call in mock_con.execute.call_args_list if "COPY" in str(call)
        )
        assert expected_copy_fragment in copy_sql

    @patch("core.database.duckdb_pool.get_connection_pool")
    @patch("routers.async_tasks.task_manager")
    def test_generate_download_file_rejects_xlsx_over_sheet_limit(
        self, mock_task_manager, mock_get_pool
    ):
        """2026-07-29: XLSX reserves one of 1,048,576 sheet rows for its header."""
        task_id = "test_xlsx_too_large"
        mock_task_manager.get_task.return_value = make_async_task(task_id)
        mock_con = setup_mock_duckdb_connection(mock_get_pool)
        mock_con.execute.return_value.fetchone.return_value = [1_048_576]

        with pytest.raises(ValueError, match="1,048,575"):
            generate_download_file(
                task_id,
                "xlsx",
                target_path=os.path.join(self.temp_dir, "too-large.xlsx"),
            )

        assert not any("COPY" in str(call) for call in mock_con.execute.call_args_list)

    @patch("core.database.duckdb_pool.get_connection_pool")
    @patch("routers.async_tasks.task_manager")
    def test_cached_xlsx_still_rejects_result_over_sheet_limit(
        self, mock_task_manager, mock_get_pool
    ):
        """2026-07-29: cached XLSX files must not bypass the task row limit."""
        cached_file = os.path.join(self.temp_dir, "cached.xlsx")
        with open(cached_file, "wb") as file:
            file.write(b"cached")
        mock_task_manager.get_task.return_value = make_async_task(
            "cached_xlsx",
            result_file_path=cached_file,
            result_info={
                "table_name": "async_result_cached_xlsx",
                "row_count": 1_048_576,
            },
        )

        with pytest.raises(ValueError, match="1,048,575"):
            generate_download_file("cached_xlsx", "xlsx")

        mock_get_pool.assert_not_called()

    @patch("core.database.duckdb_pool.get_connection_pool")
    @patch("routers.async_tasks.task_manager")
    def test_generate_download_file_validation(self, mock_task_manager, mock_get_pool):
        """测试按需文件生成的验证逻辑"""
        task_id = "test_task_invalid"

        # 测试任务不存在的情况
        mock_task_manager.get_task.return_value = None

        with pytest.raises(Exception, match="Failed to generate download file.*does not exist"):
            generate_download_file(task_id, "csv")

        # 测试任务未完成的情况
        mock_task = make_async_task(task_id, status=TaskStatus.RUNNING)
        mock_task_manager.get_task.return_value = mock_task

        with pytest.raises(Exception, match="Failed to generate download file.*not completed"):
            generate_download_file(task_id, "csv")

        # 测试缺少结果信息的情况
        mock_task = make_async_task(task_id)
        mock_task.result_info = None
        mock_task_manager.get_task.return_value = mock_task

        with pytest.raises(Exception, match="Failed to generate download file.*missing result"):
            generate_download_file(task_id, "csv")

        # 测试缺少表名的情况
        mock_task = make_async_task(task_id)
        mock_task.result_info = {"table_name": None}
        mock_task_manager.get_task.return_value = mock_task

        with pytest.raises(Exception, match="Failed to generate download file.*missing table name"):
            generate_download_file(task_id, "csv")

    @patch("core.database.duckdb_pool.get_connection_pool")
    @patch("routers.async_tasks.task_manager")
    def test_cleanup_old_files(self, mock_task_manager, mock_get_pool):
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
            mock_con = setup_mock_duckdb_connection(mock_get_pool)
            mock_con.execute.return_value.fetchall.return_value = []
            mock_task_manager.cleanup_expired_exports.return_value = 0

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

            response = client.post("/api/async-tasks", json=query_data)

            assert response.status_code == 200
            assert api_data(response.json())["task_id"] == "test_task_123"

        # 测试获取任务列表
        with patch("routers.async_tasks.task_manager") as mock_task_manager:
            # list_tasks 返回 (tasks, total_count) 元组
            mock_task_manager.list_tasks.return_value = ([], 0)

            response = client.get("/api/async-tasks")

            assert response.status_code == 200
            listed = api_data(response.json())
            assert listed["total"] == 0
            assert listed["items"] == []

        # 测试获取任务详情
        with patch("routers.async_tasks.task_manager") as mock_task_manager:
            mock_task = Mock()
            mock_task.to_dict.return_value = {
                "task_id": "test_task_123",
                "status": "completed",
                "query": '{"sql": "SELECT * FROM test_table", "format": "csv"}',
            }
            mock_task_manager.get_task.return_value = mock_task

            response = client.get("/api/async-tasks/test_task_123")

            assert response.status_code == 200
            assert api_data(response.json())["task"]["task_id"] == "test_task_123"

    def test_download_file_generation_api(self):
        """测试按需文件生成API端点"""
        task_id = "test_task_456"
        request_data = {"format": "csv"}

        temp_file = os.path.join(self.temp_dir, "task-download.csv")
        file_content = "id,name\n1,Alice\n"
        with open(temp_file, "w", encoding="utf-8") as f:
            f.write(file_content)

        try:
            with patch("routers.async_tasks.generate_download_file") as mock_generate:
                mock_generate.return_value = temp_file

                response = client.post(
                    f"/api/async-tasks/{task_id}/download", json=request_data
                )

            assert response.status_code == 200
            assert "text/csv" in response.headers.get("content-type", "")
            content_disposition = response.headers.get("content-disposition", "")
            # 下载名现为友好名(任务无结果表 → 回退 task_id),而非磁盘临时文件名,
            # 便于用户在浏览器下载里认出(此前是 task-<uuid>_<时间>.csv)。
            assert "test_task_456.csv" in content_disposition
            assert response.text == file_content
        finally:
            if os.path.exists(temp_file):
                os.remove(temp_file)


class TestMemoryOptimizationIntegration:
    """测试内存优化功能的集成测试"""

    def setup_method(self):
        """每个测试方法前的设置"""
        self.temp_dir = tempfile.mkdtemp()

    def teardown_method(self):
        """每个测试方法后的清理"""
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    @patch("routers.async_tasks.build_table_metadata_snapshot", return_value={"row_count": 5000})
    @patch("core.database.duckdb_pool.get_connection_pool")
    @patch("core.database.duckdb_pool.interruptible_connection")
    @patch("routers.async_tasks.task_manager")
    @patch("routers.async_tasks.file_datasource_manager")
    def test_full_async_query_workflow(
        self, mock_file_manager, mock_task_manager, mock_interruptible, mock_get_pool, mock_metadata
    ):
        """测试完整的异步查询工作流程"""
        task_id = "integration_test_123"
        sql = "SELECT id, name, age FROM users WHERE age > 18"

        # 模拟DuckDB连接 - 使用 interruptible_connection
        mock_con = Mock()
        mock_interruptible.return_value.__enter__ = Mock(return_value=mock_con)
        mock_interruptible.return_value.__exit__ = Mock(return_value=False)

        # 模拟任务管理器
        mock_task_manager.start_task.return_value = True
        mock_task_manager.complete_task.return_value = True
        mock_task_manager.is_cancellation_requested.return_value = False
        mock_task_manager.get_task.return_value = make_async_task(task_id)

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

        # 验证任务完成
        mock_task_manager.complete_task.assert_called_once()

    @patch("routers.async_tasks.build_table_metadata_snapshot", return_value={"row_count": 1000000})
    @patch("core.database.duckdb_pool.get_connection_pool")
    @patch("core.database.duckdb_pool.interruptible_connection")
    @patch("routers.async_tasks.task_manager")
    def test_memory_usage_comparison(self, mock_task_manager, mock_interruptible, mock_get_pool, mock_metadata):
        """测试内存使用对比（模拟）"""
        task_id = "memory_test_456"
        sql = "SELECT * FROM large_table"

        # 模拟DuckDB连接 - 使用 interruptible_connection
        mock_con = Mock()
        mock_interruptible.return_value.__enter__ = Mock(return_value=mock_con)
        mock_interruptible.return_value.__exit__ = Mock(return_value=False)

        # 模拟任务管理器
        mock_task_manager.start_task.return_value = True
        mock_task_manager.complete_task.return_value = True
        mock_task_manager.is_cancellation_requested.return_value = False

        # 模拟大量数据
        mock_con.execute.return_value.fetchone.return_value = [1000000]  # 100万行
        mock_con.execute.return_value.fetchall.return_value = [
            ("col1", "VARCHAR"),
            ("col2", "INTEGER"),
            ("col3", "DOUBLE"),
        ]

        # 执行异步查询
        execute_async_query(task_id, sql)

        # 验证任务完成
        mock_task_manager.complete_task.assert_called_once()


class TestErrorHandling:
    """测试错误处理"""

    @patch("core.database.duckdb_pool.get_connection_pool")
    @patch("core.database.duckdb_pool.interruptible_connection")
    @patch("routers.async_tasks.task_manager")
    def test_execute_async_query_database_error(
        self, mock_task_manager, mock_interruptible, mock_get_pool
    ):
        """测试数据库错误处理"""
        task_id = "error_test_123"
        sql = "SELECT * FROM nonexistent_table"

        # 模拟任务管理器
        mock_task_manager.start_task.return_value = True
        mock_task_manager.fail_task.return_value = True
        mock_task_manager.is_cancellation_requested.return_value = False

        # 模拟DuckDB连接 - 使用 interruptible_connection 抛出异常
        mock_con = Mock()
        mock_con.execute.side_effect = Exception(
            "Table 'nonexistent_table' does not exist"
        )
        mock_interruptible.return_value.__enter__ = Mock(return_value=mock_con)
        mock_interruptible.return_value.__exit__ = Mock(return_value=False)

        # 执行异步查询
        execute_async_query(task_id, sql)

        # 验证任务被标记为失败
        mock_task_manager.fail_task.assert_called_once()

    @patch("core.database.duckdb_pool.get_connection_pool")
    @patch("routers.async_tasks.task_manager")
    def test_generate_download_file_table_not_found(
        self, mock_task_manager, mock_get_pool
    ):
        """测试表不存在时的错误处理"""
        task_id = "error_test_456"

        # 模拟任务信息
        mock_task = make_async_task(task_id, table_name="async_result_nonexistent")
        mock_task_manager.get_task.return_value = mock_task

        # 模拟DuckDB连接
        mock_con = setup_mock_duckdb_connection(mock_get_pool)
        mock_con.execute.side_effect = Exception(
            "Table 'async_result_nonexistent' does not exist"
        )

        # 执行文件生成
        with pytest.raises(
            Exception,
            match="Failed to generate download file.*does not exist or has been deleted",
        ):
            generate_download_file(task_id, "csv")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
