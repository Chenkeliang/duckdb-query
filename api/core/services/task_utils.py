"""
异步任务工具类
统一处理任务ID转换、文件路径管理、状态检查等逻辑
"""

import os
import glob
import logging
from typing import Optional, Dict, Any
from datetime import datetime

from core.services.task_manager import AsyncTask, TaskStatus
from core.common.timezone_utils import get_storage_time

logger = logging.getLogger(__name__)


class TaskUtils:
    """异步任务工具类"""

    def __init__(self, exports_dir: str):
        self.exports_dir = exports_dir

    @staticmethod
    def task_id_to_table_name(task_id: str) -> str:
        """
        将任务ID转换为表名
        UUID格式 -> 下划线格式表名
        """
        safe_task_id = task_id.replace("-", "_")
        return f"async_result_{safe_task_id}"

    @staticmethod
    def table_name_to_task_id(table_name: str) -> str:
        """
        将表名转换为任务ID
        下划线格式表名 -> UUID格式
        """
        if table_name.startswith("async_result_"):
            safe_task_id = table_name.replace("async_result_", "")
            return safe_task_id.replace("_", "-")
        return table_name

    def get_task_file_path(self, task_id: str) -> Optional[str]:
        """
        获取任务对应的文件路径
        优先从result_file_path获取，如果为空则从result_info获取
        """
        # 这里需要传入task对象，暂时返回None
        # 实际使用时需要传入task对象
        return None

    def find_existing_files(self, task_id: str) -> list:
        """
        查找任务对应的已生成文件
        """
        file_pattern = os.path.join(self.exports_dir, f"task-{task_id}*")
        return glob.glob(file_pattern)

    def generate_file_path(self, task_id: str, format: str) -> str:
        """
        生成新的文件路径
        """
        from core.common.timezone_utils import get_current_time
        timestamp = get_current_time().strftime("%Y%m%d_%H%M%S")
        file_name = f"task-{task_id}_{timestamp}.{format}"
        return os.path.join(self.exports_dir, file_name)

    @staticmethod
    def is_task_completed(task: AsyncTask) -> bool:
        """
        检查任务是否已完成
        统一状态检查逻辑
        """
        return task.status == TaskStatus.SUCCESS

    @staticmethod
    def get_file_path_from_task(task: AsyncTask) -> Optional[str]:
        """
        从任务对象获取文件路径
        统一文件路径获取逻辑
        """
        # 优先使用result_file_path
        if task.result_file_path:
            return task.result_file_path

        # 如果为空，从result_info获取
        if task.result_info and task.result_info.get("file_path"):
            return task.result_info.get("file_path")

        return None

    def create_recovered_task(self, task_id: str, file_path: str) -> AsyncTask:
        """
        创建恢复的任务对象
        """
        file_name = os.path.basename(file_path)
        table_name = self.task_id_to_table_name(task_id)

        # 创建result_info字典
        result_info = {
            "status": "completed",
            "table_name": table_name,
            "file_generated": True,
            "file_path": file_path,
            "file_format": "parquet" if file_name.endswith(".parquet") else "csv",
        }

        # 创建AsyncTask对象
        task = AsyncTask(
            task_id=task_id,
            status=TaskStatus.SUCCESS,
            created_at=get_storage_time(),
            query=f"SELECT * FROM {table_name}",
            result_file_path=file_path,
            result_info=result_info,
        )

        return task

    def recover_task_from_files(self, task_id: str) -> Optional[AsyncTask]:
        """
        从文件系统中恢复任务信息
        """
        try:
            existing_files = self.find_existing_files(task_id)

            if not existing_files:
                logger.warning(f"任务 {task_id} 没有找到对应的文件")
                return None

            # 使用第一个找到的文件
            file_path = existing_files[0]
            logger.info(f"从文件恢复任务 {task_id}: {file_path}")

            return self.create_recovered_task(task_id, file_path)

        except Exception as e:
            logger.error(f"恢复任务信息失败: {task_id}, 错误: {str(e)}")
            return None

    @staticmethod
    def get_media_type(file_path: str) -> str:
        """
        根据文件扩展名获取媒体类型
        """
        if file_path.endswith(".csv"):
            return "text/csv"
        else:  # 默认为parquet
            return "application/octet-stream"

    def update_task_file_info(
        self, task: AsyncTask, file_path: str, format: str
    ) -> None:
        """
        更新任务的文件信息
        """
        if task.result_info:
            task.result_info["file_generated"] = True
            task.result_info["file_path"] = file_path
            task.result_info["file_format"] = format

        # 同时更新result_file_path字段
        task.result_file_path = file_path
