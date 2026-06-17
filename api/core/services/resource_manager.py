import os
import shutil
import time
import uuid
from pathlib import Path

from fastapi import BackgroundTasks


def _temp_dir() -> Path:
    """可写临时目录(惰性解析,避免 import 期对 cwd 相对路径 mkdir —— 桌面冻结时 cwd 只读会崩)。"""
    from core.common.paths import get_temp_dir

    d = get_temp_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d


async def save_upload_file(upload_file) -> str:
    """Saves an uploaded file to a temporary directory and returns the path."""
    # 生成SQL兼容的文件ID，使用下划线替代连字符
    file_id = str(uuid.uuid4()).replace('-', '_')
    file_path = _temp_dir() / f"{file_id}_{upload_file.filename}"
    with open(file_path, "wb") as buffer:
        buffer.write(await upload_file.read())
    return str(file_path)

def _cleanup_resource(file_path: str, delay_seconds: int = 3600):
    """Removes a file or directory after a delay."""
    time.sleep(delay_seconds)
    try:
        if os.path.isdir(file_path):
            shutil.rmtree(file_path, ignore_errors=True)
        else:
            os.remove(file_path)
    except OSError:
        pass

def schedule_cleanup(file_path: str, background_tasks: BackgroundTasks, delay_seconds: int = 3600):
    """Schedules a file or directory to be cleaned up."""
    background_tasks.add_task(_cleanup_resource, file_path, delay_seconds)
