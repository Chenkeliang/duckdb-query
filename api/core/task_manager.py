"""
异步任务管理器
负责管理所有异步任务的状态跟踪和生命周期管理
"""

import logging
import uuid
import time
from typing import Dict, Any, Optional, List
from enum import Enum
from datetime import datetime
from dataclasses import dataclass, asdict
from threading import Lock

from core.timezone_utils import get_current_time  # 导入时区工具

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    """任务状态枚举"""

    QUEUED = "queued"  # 排队中
    RUNNING = "running"  # 运行中
    SUCCESS = "success"  # 成功
    FAILED = "failed"  # 失败


@dataclass
class AsyncTask:
    """异步任务数据结构"""

    task_id: str
    status: TaskStatus
    created_at: datetime
    query: str
    result_file_path: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    execution_time: Optional[float] = None  # 执行时间（秒）
    result_info: Optional[Dict[str, Any]] = None  # 任务结果信息（包含table_name等）

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        result = asdict(self)
        # 转换枚举为字符串
        result["status"] = self.status.value
        # 转换datetime为字符串
        for key in ["created_at", "started_at", "completed_at"]:
            if result[key]:
                result[key] = result[key].isoformat()
        return result


class TaskManager:
    """异步任务管理器"""

    def __init__(self):
        """初始化任务管理器"""
        self._tasks: Dict[str, AsyncTask] = {}
        self._lock = Lock()
        logger.info("异步任务管理器初始化完成")

    def create_task(self, query: str) -> str:
        """创建新任务

        Args:
            query: SQL查询语句

        Returns:
            str: 任务ID
        """
        with self._lock:
            task_id = str(uuid.uuid4())
            task = AsyncTask(
                task_id=task_id,
                status=TaskStatus.QUEUED,
                created_at=get_current_time(),
                query=query,
            )
            self._tasks[task_id] = task
            logger.info(f"创建新任务: {task_id}")
            return task_id

    def start_task(self, task_id: str) -> bool:
        """标记任务为运行中

        Args:
            task_id: 任务ID

        Returns:
            bool: 是否成功标记
        """
        with self._lock:
            if task_id not in self._tasks:
                logger.warning(f"任务不存在: {task_id}")
                return False

            task = self._tasks[task_id]
            if task.status != TaskStatus.QUEUED:
                logger.warning(f"任务状态不正确: {task_id}, 当前状态: {task.status}")
                return False

            task.status = TaskStatus.RUNNING
            task.started_at = get_current_time()
            logger.info(f"任务开始运行: {task_id}")
            return True

    def complete_task(self, task_id: str, result_info: Dict[str, Any]) -> bool:
        """标记任务为成功完成

        Args:
            task_id: 任务ID
            result_info: 任务结果信息字典

        Returns:
            bool: 是否成功标记
        """
        with self._lock:
            if task_id not in self._tasks:
                logger.warning(f"任务不存在: {task_id}")
                return False

            task = self._tasks[task_id]
            if task.status != TaskStatus.RUNNING:
                logger.warning(f"任务状态不正确: {task_id}, 当前状态: {task.status}")
                return False

            task.status = TaskStatus.SUCCESS
            task.result_info = result_info
            task.result_file_path = (
                result_info.get("result_file_path") if result_info else None
            )
            task.completed_at = get_current_time()
            if task.started_at:
                task.execution_time = (
                    task.completed_at - task.started_at
                ).total_seconds()
            logger.info(f"任务执行成功: {task_id}, 结果文件: {result_info}")
            return True

    def fail_task(self, task_id: str, error_message: str) -> bool:
        """标记任务为失败

        Args:
            task_id: 任务ID
            error_message: 错误信息

        Returns:
            bool: 是否成功标记
        """
        with self._lock:
            if task_id not in self._tasks:
                logger.warning(f"任务不存在: {task_id}")
                return False

            task = self._tasks[task_id]
            task.status = TaskStatus.FAILED
            task.error_message = error_message
            task.completed_at = get_current_time()
            if task.started_at:
                task.execution_time = (
                    task.completed_at - task.started_at
                ).total_seconds()
            logger.info(f"任务执行失败: {task_id}, 错误: {error_message}")
            return True

    def get_task(self, task_id: str) -> Optional[AsyncTask]:
        """获取任务信息

        Args:
            task_id: 任务ID

        Returns:
            Optional[AsyncTask]: 任务对象或None
        """
        with self._lock:
            return self._tasks.get(task_id)

    def list_tasks(self, limit: int = 100) -> List[Dict[str, Any]]:
        """列出所有任务（按创建时间倒序）

        Args:
            limit: 限制返回的任务数量

        Returns:
            List[Dict[str, Any]]: 任务列表
        """
        with self._lock:
            # 按创建时间倒序排列
            sorted_tasks = sorted(
                self._tasks.values(), key=lambda x: x.created_at, reverse=True
            )
            # 限制数量
            limited_tasks = sorted_tasks[:limit]
            # 转换为字典格式
            return [task.to_dict() for task in limited_tasks]

    def get_pending_tasks(self) -> List[str]:
        """获取所有排队中的任务ID

        Returns:
            List[str]: 排队中任务ID列表
        """
        with self._lock:
            return [
                task_id
                for task_id, task in self._tasks.items()
                if task.status == TaskStatus.QUEUED
            ]


# 全局任务管理器实例
task_manager = TaskManager()
