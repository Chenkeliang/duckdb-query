import os
import uuid
from pathlib import Path
from fastapi import BackgroundTasks
import time

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

def cleanup_file(file_path: str):
    """Removes a file after a delay."""
    time.sleep(3600)  # 1 hour
    try:
        os.remove(file_path)
    except OSError:
        pass

def schedule_cleanup(file_path: str, background_tasks: BackgroundTasks):
    """Schedules a file to be cleaned up."""
    background_tasks.add_task(cleanup_file, file_path)
