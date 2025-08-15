"""
异步任务系统后端测试
测试异步任务API的功能
"""

import pytest
import asyncio
import os
import sys
import time
from fastapi.testclient import TestClient

# 添加项目路径到系统路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'api'))

from main import app
from core.task_manager import task_manager, TaskStatus

client = TestClient(app)

class TestAsyncTasks:
    """异步任务API测试类"""
    
    def setup_method(self):
        """每个测试方法执行前的设置"""
        # 清空任务管理器
        task_manager._tasks.clear()
    
    def test_submit_async_query(self):
        """测试提交异步查询任务"""
        # 准备测试数据
        test_sql = "SELECT 1 as id, 'test' as name"
        
        # 发送POST请求
        response = client.post("/api/async_query", json={"sql": test_sql})
        
        # 验证响应
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "task_id" in data
        assert data["message"] == "任务已提交，请稍后查询任务状态"
        
        # 验证任务是否创建
        task_id = data["task_id"]
        task = task_manager.get_task(task_id)
        assert task is not None
        assert task.query == test_sql
        # 任务可能已经执行完成，所以状态可能是SUCCESS或RUNNING
        assert task.status in [TaskStatus.QUEUED, TaskStatus.RUNNING, TaskStatus.SUCCESS]
    
    def test_submit_async_query_empty_sql(self):
        """测试提交空SQL查询"""
        # 发送POST请求
        response = client.post("/api/async_query", json={"sql": ""})
        
        # 验证响应
        assert response.status_code == 400
    
    def test_list_async_tasks(self):
        """测试获取异步任务列表"""
        # 先创建几个任务
        task_ids = []
        for i in range(3):
            response = client.post("/api/async_query", json={"sql": f"SELECT * FROM table_{i}"})
            data = response.json()
            task_ids.append(data["task_id"])
        
        # 获取任务列表
        response = client.get("/api/async_tasks")
        
        # 验证响应
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["tasks"]) >= 3
        assert data["count"] >= 3
        
        # 验证任务ID是否在列表中
        task_list_ids = [task["task_id"] for task in data["tasks"]]
        for task_id in task_ids:
            assert task_id in task_list_ids
    
    def test_get_async_task(self):
        """测试获取单个异步任务详情"""
        # 创建任务
        test_sql = "SELECT 1 as id, 'test' as name"
        response = client.post("/api/async_query", json={"sql": test_sql})
        task_data = response.json()
        task_id = task_data["task_id"]
        
        # 获取任务详情
        response = client.get(f"/api/async_tasks/{task_id}")
        
        # 验证响应
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["task"]["task_id"] == task_id
        assert data["task"]["query"] == test_sql
        # 任务可能已经执行完成，所以状态可能是QUEUED, RUNNING或SUCCESS
        assert data["task"]["status"] in ["queued", "running", "success"]
    
    def test_get_nonexistent_task(self):
        """测试获取不存在的任务"""
        # 获取不存在的任务
        response = client.get("/api/async_tasks/nonexistent_task_id")
        
        # 验证响应
        assert response.status_code == 404
    
    def test_task_lifecycle(self):
        """测试任务完整生命周期"""
        import pandas as pd
        
        # 直接创建一个新任务用于状态测试（不提交到API）
        task_id = task_manager.create_task("SELECT 1 as id, 'test' as name")
        
        # 验证任务初始状态
        task = task_manager.get_task(task_id)
        assert task.status == TaskStatus.QUEUED
        
        # 测试状态转换
        task_manager.start_task(task_id)
        task = task_manager.get_task(task_id)
        assert task.status == TaskStatus.RUNNING
        
        # 模拟任务完成（使用一个简单的文件路径）
        test_file_path = "/tmp/test_result.parquet"
        # 创建一个简单的测试文件
        df = pd.DataFrame({"id": [1], "name": ["test"]})
        df.to_parquet(test_file_path)
        
        task_manager.complete_task(task_id, test_file_path)
        task = task_manager.get_task(task_id)
        assert task.status == TaskStatus.SUCCESS
        assert task.result_file_path == test_file_path
        
        # 清理测试文件
        if os.path.exists(test_file_path):
            os.remove(test_file_path)

if __name__ == "__main__":
    pytest.main([__file__, "-v"])