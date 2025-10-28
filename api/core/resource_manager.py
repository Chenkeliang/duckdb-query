import os
import shutil
import time
import uuid
from pathlib import Path

from fastapi import BackgroundTasks

TEMP_DIR = Path("temp_files")
TEMP_DIR.mkdir(exist_ok=True)

async def save_upload_file(upload_file) -> str:
    """Saves an uploaded file to a temporary directory and returns the path."""
    # 生成SQL兼容的文件ID，使用下划线替代连字符
    file_id = str(uuid.uuid4()).replace('-', '_')
    file_path = TEMP_DIR / f"{file_id}_{upload_file.filename}"
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
