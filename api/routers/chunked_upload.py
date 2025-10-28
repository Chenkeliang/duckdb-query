"""
分块文件上传路由
支持大文件上传，带进度显示和断点续传
"""

import os
import hashlib
import logging
import traceback
import asyncio
import time
from typing import Dict, Any, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from pydantic import BaseModel

from core.config_manager import config_manager
from core.duckdb_engine import get_db_connection
from core.file_datasource_manager import (
    file_datasource_manager,
    create_table_from_dataframe,
)
from core.excel_import_manager import register_excel_upload, sanitize_identifier
from core.resource_manager import schedule_cleanup
from core.timezone_utils import get_current_time_iso  # 统一时间

logger = logging.getLogger(__name__)
router = APIRouter()


class ChunkUploadRequest(BaseModel):
    """分块上传请求模型"""

    chunk_number: int
    total_chunks: int
    file_name: str
    file_size: int
    chunk_size: int
    file_hash: str = None  # 文件MD5哈希，用于验证


class UploadStatus(BaseModel):
    """上传状态模型"""

    upload_id: str
    file_name: str
    total_chunks: int
    uploaded_chunks: int
    progress: float
    status: str  # 'uploading', 'completed', 'failed', 'processing'
    file_size: int
    created_at: str
    error_message: str = None


# 全局上传状态存储
upload_sessions: Dict[str, Dict[str, Any]] = {}


def get_upload_dir() -> str:
    """获取上传目录"""
    upload_dir = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "temp_files", "uploads"
    )
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


def get_chunks_dir(upload_id: str) -> str:
    """获取分块存储目录"""
    chunks_dir = os.path.join(get_upload_dir(), "chunks", upload_id)
    os.makedirs(chunks_dir, exist_ok=True)
    return chunks_dir


def calculate_file_hash(file_path: str) -> str:
    """计算文件MD5哈希"""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


@router.post("/api/upload/init", tags=["Chunked Upload"])
async def init_upload(
    file_name: str = Form(...),
    file_size: int = Form(...),
    chunk_size: int = Form(default=1024 * 1024),  # 默认1MB分块
    file_hash: str = Form(default=None),
    table_alias: str = Form(default=None),  # 表别名支持
):
    """
    初始化分块上传

    Args:
        file_name: 文件名
        file_size: 文件总大小
        chunk_size: 分块大小
        file_hash: 文件MD5哈希（可选）
        table_alias: 表别名（可选）
    """
    try:
        # 从配置中获取文件大小限制
        app_config = config_manager.get_app_config()
        if file_size > app_config.max_file_size:
            max_file_size_mb = app_config.max_file_size / 1024 / 1024
            raise HTTPException(
                status_code=413,
                detail=f"文件太大，最大支持 {max_file_size_mb:.0f}MB。当前文件大小：{file_size / 1024 / 1024:.1f}MB",
            )

        # 检查文件类型
        file_extension = file_name.lower().split(".")[-1]
        supported_formats = ["csv", "xlsx", "xls", "json", "jsonl", "parquet", "pq"]

        if file_extension not in supported_formats:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件格式。支持的格式：{', '.join(supported_formats)}",
            )

        # 生成上传ID
        import uuid

        upload_id = str(uuid.uuid4())

        # 计算总分块数
        total_chunks = (file_size + chunk_size - 1) // chunk_size

        # 创建上传会话
        upload_sessions[upload_id] = {
            "upload_id": upload_id,
            "file_name": file_name,
            "file_size": file_size,
            "chunk_size": chunk_size,
            "total_chunks": total_chunks,
            "uploaded_chunks": 0,
            "uploaded_chunk_numbers": set(),
            "status": "uploading",
            "created_at": get_current_time_iso(),
            "file_hash": file_hash,
            "table_alias": table_alias,  # 保存表别名
            "chunks_dir": get_chunks_dir(upload_id),
        }

        logger.info(
            f"初始化上传会话: {upload_id}, 文件: {file_name}, 大小: {file_size}, 分块数: {total_chunks}"
        )

        return {
            "success": True,
            "upload_id": upload_id,
            "total_chunks": total_chunks,
            "chunk_size": chunk_size,
            "message": "上传会话初始化成功",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"初始化上传失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"初始化上传失败: {str(e)}")


@router.post("/api/upload/chunk", tags=["Chunked Upload"])
async def upload_chunk(
    upload_id: str = Form(...),
    chunk_number: int = Form(...),
    chunk: UploadFile = File(...),
):
    """
    上传文件分块

    Args:
        upload_id: 上传会话ID
        chunk_number: 分块编号（从0开始）
        chunk: 分块文件数据
    """
    try:
        # 检查上传会话
        if upload_id not in upload_sessions:
            raise HTTPException(status_code=404, detail="上传会话不存在")

        session = upload_sessions[upload_id]

        if session["status"] != "uploading":
            raise HTTPException(
                status_code=400, detail=f"上传会话状态错误: {session['status']}"
            )

        # 检查分块编号
        if chunk_number < 0 or chunk_number >= session["total_chunks"]:
            raise HTTPException(
                status_code=400,
                detail=f"分块编号无效: {chunk_number}, 总分块数: {session['total_chunks']}",
            )

        # 检查分块是否已上传
        if chunk_number in session["uploaded_chunk_numbers"]:
            return {
                "success": True,
                "message": f"分块 {chunk_number} 已存在，跳过上传",
                "progress": len(session["uploaded_chunk_numbers"])
                / session["total_chunks"]
                * 100,
            }

        # 保存分块
        chunk_path = os.path.join(session["chunks_dir"], f"chunk_{chunk_number:06d}")
        chunk_content = await chunk.read()

        with open(chunk_path, "wb") as f:
            f.write(chunk_content)

        # 更新会话状态
        session["uploaded_chunk_numbers"].add(chunk_number)
        session["uploaded_chunks"] = len(session["uploaded_chunk_numbers"])

        progress = session["uploaded_chunks"] / session["total_chunks"] * 100

        logger.info(
            f"上传分块 {chunk_number}/{session['total_chunks']}, 进度: {progress:.1f}%"
        )

        return {
            "success": True,
            "chunk_number": chunk_number,
            "uploaded_chunks": session["uploaded_chunks"],
            "total_chunks": session["total_chunks"],
            "progress": progress,
            "message": f"分块 {chunk_number} 上传成功",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"上传分块失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"上传分块失败: {str(e)}")


@router.post("/api/upload/complete", tags=["Chunked Upload"])
async def complete_upload(
    upload_id: str = Form(...), background_tasks: BackgroundTasks = None
):
    """
    完成分块上传，合并文件并处理

    Args:
        upload_id: 上传会话ID
    """
    try:
        # 检查上传会话
        if upload_id not in upload_sessions:
            raise HTTPException(status_code=404, detail="上传会话不存在")

        session = upload_sessions[upload_id]

        # 检查所有分块是否已上传
        if session["uploaded_chunks"] != session["total_chunks"]:
            raise HTTPException(
                status_code=400,
                detail=f"上传未完成，已上传: {session['uploaded_chunks']}/{session['total_chunks']}",
            )

        # 更新状态为处理中
        session["status"] = "processing"

        # 合并文件
        temp_upload_path = os.path.join(get_upload_dir(), session["file_name"])

        with open(temp_upload_path, "wb") as final_file:
            for chunk_num in range(session["total_chunks"]):
                chunk_path = os.path.join(
                    session["chunks_dir"], f"chunk_{chunk_num:06d}"
                )
                if os.path.exists(chunk_path):
                    with open(chunk_path, "rb") as chunk_file:
                        final_file.write(chunk_file.read())
                else:
                    raise HTTPException(
                        status_code=500, detail=f"分块文件缺失: chunk_{chunk_num:06d}"
                    )

        # 将合并后的文件移动到主临时目录
        import shutil

        final_file_path = os.path.join(
            os.path.dirname(get_upload_dir()), session["file_name"]
        )
        shutil.move(temp_upload_path, final_file_path)
        logger.info(f"文件已移动到: {final_file_path}")

        # 验证文件哈希（如果提供）
        if session.get("file_hash"):
            actual_hash = calculate_file_hash(final_file_path)
            if actual_hash != session["file_hash"]:
                raise HTTPException(
                    status_code=400, detail="文件哈希验证失败，文件可能已损坏"
                )

        # 处理文件并加载到DuckDB
        file_info = await process_uploaded_file(
            final_file_path,
            session["file_name"],
            session.get("table_alias"),
            background_tasks=background_tasks,
        )

        # 清理分块文件
        import shutil

        if os.path.exists(session["chunks_dir"]):
            shutil.rmtree(session["chunks_dir"])

        if background_tasks:
            cleanup_target = file_info.pop("cleanup_path", None)
            if cleanup_target:
                schedule_cleanup(cleanup_target, background_tasks)
            elif not file_info.get("pending_excel") and os.path.exists(final_file_path):
                schedule_cleanup(final_file_path, background_tasks)

        # 更新会话状态
        session["status"] = "completed"
        session["file_info"] = file_info

        logger.info(
            f"文件上传完成: {session['file_name']}, 大小: {session['file_size']}"
        )

        return {
            "success": True,
            "upload_id": upload_id,
            "file_info": file_info,
            "message": "文件上传和处理完成",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"完成上传失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")

        # 更新会话状态为失败
        if upload_id in upload_sessions:
            upload_sessions[upload_id]["status"] = "failed"
            upload_sessions[upload_id]["error_message"] = str(e)

        raise HTTPException(status_code=500, detail=f"完成上传失败: {str(e)}")


async def process_uploaded_file(
    file_path: str,
    file_name: str,
    table_alias: str = None,
    background_tasks: Optional[BackgroundTasks] = None,
) -> Dict[str, Any]:
    """处理上传的文件并加载到DuckDB"""
    try:
        logger.info(f"开始处理上传的文件: {file_name}, 路径: {file_path}")

        file_extension = file_name.lower().split(".")[-1]
        logger.info(f"文件类型: {file_extension}")

        if file_extension in {"xlsx", "xls"}:
            pending_excel = register_excel_upload(file_path, file_name, table_alias)
            if background_tasks:
                from pathlib import Path

                pending_dir = Path(pending_excel.stored_path).parent
                schedule_cleanup(str(pending_dir), background_tasks, delay_seconds=6 * 3600)

            return {
                "success": True,
                "pending_excel": {
                    "file_id": pending_excel.file_id,
                    "original_filename": pending_excel.original_filename,
                    "file_size": pending_excel.file_size,
                    "table_alias": pending_excel.table_alias,
                    "uploaded_at": pending_excel.uploaded_at,
                    "default_table_prefix": pending_excel.default_table_prefix,
                },
                "message": "Excel 文件已上传，请选择需要导入的工作表。",
                "cleanup_path": None,
            }

        source_id = table_alias if table_alias else file_name.split(".")[0]
        source_id = sanitize_identifier(source_id, allow_leading_digit=False, prefix="table")
        if not source_id:
            source_id = f"table_{int(time.time())}"

        con = get_db_connection()
        original_source_id = source_id

        while True:
            try:
                result = con.execute(
                    "SELECT 1 FROM information_schema.tables WHERE lower(table_name) = lower(?)",
                    [source_id],
                ).fetchone()
                if result is None:
                    break
                timestamp = time.strftime("%Y%m%d%H%M", time.localtime())
                source_id = f"{original_source_id}_{timestamp}"
                break
            except Exception as e:
                logger.warning(f"检查表名时出错: {e}")
                break

        logger.info(f"生成的表名: {source_id}")

        table_info = None
        try:
            logger.info("开始加载到DuckDB...")
            con = get_db_connection()
            table_info = create_table_from_dataframe(
                con, source_id, file_path, file_extension
            )
            logger.info("成功加载到DuckDB: %s", table_info)
        except Exception as e:
            logger.error(f"加载到DuckDB失败: {str(e)}")
            raise

        file_metadata = {
            "source_id": source_id,
            "filename": file_name,
            "file_path": file_path,
            "file_type": file_extension,
            "row_count": table_info.get("row_count", 0),
            "column_count": table_info.get("column_count", 0),
            "columns": table_info.get("columns", []),
            "column_profiles": table_info.get("column_profiles", []),
            "schema_version": 2,
            "created_at": get_current_time_iso(),
        }

        try:
            logger.info("保存文件数据源配置...")
            file_datasource_manager.save_file_datasource(file_metadata)
            logger.info("成功保存文件数据源配置")
        except Exception as e:
            logger.error(f"保存文件数据源配置失败: {str(e)}")
            raise

        logger.info(
            f"文件处理完成: {file_name}, 表名: {source_id}, 行数: {file_metadata['row_count']}"
        )

        return {
            "source_id": source_id,
            "filename": file_name,
            "file_size": os.path.getsize(file_path),
            "row_count": file_metadata["row_count"],
            "column_count": file_metadata["column_count"],
            "columns": file_metadata["columns"],
            "preview_data": [{"提示": "预览数据已禁用以提高性能"}],
            "cleanup_path": file_path,
        }

    except Exception as e:
        logger.error(f"处理文件失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise


@router.delete("/api/upload/cancel/{upload_id}", tags=["Chunked Upload"])
async def cancel_upload(upload_id: str):
    """取消上传"""
    try:
        if upload_id not in upload_sessions:
            raise HTTPException(status_code=404, detail="上传会话不存在")

        session = upload_sessions[upload_id]

        # 清理分块文件
        import shutil

        if os.path.exists(session["chunks_dir"]):
            shutil.rmtree(session["chunks_dir"])

        # 删除会话
        del upload_sessions[upload_id]

        logger.info(f"取消上传: {upload_id}")

        return {"success": True, "message": "上传已取消"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"取消上传失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"取消上传失败: {str(e)}")
