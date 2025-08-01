"""
分块文件上传路由
支持大文件上传，带进度显示和断点续传
"""

import os
import hashlib
import logging
import traceback
import asyncio
from typing import Dict, Any, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import pandas as pd
import pyarrow.parquet as pq

from core.duckdb_engine import get_db_connection
from core.file_datasource_manager import file_datasource_manager, create_table_from_dataframe
from core.resource_manager import schedule_cleanup

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
    chunk_size: int = Form(default=1024*1024),  # 默认1MB分块
    file_hash: str = Form(default=None)
):
    """
    初始化分块上传
    
    Args:
        file_name: 文件名
        file_size: 文件总大小
        chunk_size: 分块大小
        file_hash: 文件MD5哈希（可选）
    """
    try:
        # 检查文件大小限制 (1GB)
        MAX_FILE_SIZE = 1024 * 1024 * 1024  # 1GB
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"文件太大，最大支持1GB。当前文件大小：{file_size / 1024 / 1024 / 1024:.1f}GB"
            )
        
        # 检查文件类型
        file_extension = file_name.lower().split('.')[-1]
        supported_formats = ['csv', 'xlsx', 'xls', 'json', 'jsonl', 'parquet', 'pq']
        
        if file_extension not in supported_formats:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件格式。支持的格式：{', '.join(supported_formats)}"
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
            "created_at": pd.Timestamp.now().isoformat(),
            "file_hash": file_hash,
            "chunks_dir": get_chunks_dir(upload_id)
        }
        
        logger.info(f"初始化上传会话: {upload_id}, 文件: {file_name}, 大小: {file_size}, 分块数: {total_chunks}")
        
        return {
            "success": True,
            "upload_id": upload_id,
            "total_chunks": total_chunks,
            "chunk_size": chunk_size,
            "message": "上传会话初始化成功"
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
    chunk: UploadFile = File(...)
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
            raise HTTPException(status_code=400, detail=f"上传会话状态错误: {session['status']}")
        
        # 检查分块编号
        if chunk_number < 0 or chunk_number >= session["total_chunks"]:
            raise HTTPException(
                status_code=400, 
                detail=f"分块编号无效: {chunk_number}, 总分块数: {session['total_chunks']}"
            )
        
        # 检查分块是否已上传
        if chunk_number in session["uploaded_chunk_numbers"]:
            return {
                "success": True,
                "message": f"分块 {chunk_number} 已存在，跳过上传",
                "progress": len(session["uploaded_chunk_numbers"]) / session["total_chunks"] * 100
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
        
        logger.info(f"上传分块 {chunk_number}/{session['total_chunks']}, 进度: {progress:.1f}%")
        
        return {
            "success": True,
            "chunk_number": chunk_number,
            "uploaded_chunks": session["uploaded_chunks"],
            "total_chunks": session["total_chunks"],
            "progress": progress,
            "message": f"分块 {chunk_number} 上传成功"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"上传分块失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"上传分块失败: {str(e)}")


@router.post("/api/upload/complete", tags=["Chunked Upload"])
async def complete_upload(
    upload_id: str = Form(...),
    background_tasks: BackgroundTasks = None
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
                detail=f"上传未完成，已上传: {session['uploaded_chunks']}/{session['total_chunks']}"
            )
        
        # 更新状态为处理中
        session["status"] = "processing"
        
        # 合并文件
        final_file_path = os.path.join(get_upload_dir(), session["file_name"])
        
        with open(final_file_path, "wb") as final_file:
            for chunk_num in range(session["total_chunks"]):
                chunk_path = os.path.join(session["chunks_dir"], f"chunk_{chunk_num:06d}")
                if os.path.exists(chunk_path):
                    with open(chunk_path, "rb") as chunk_file:
                        final_file.write(chunk_file.read())
                else:
                    raise HTTPException(
                        status_code=500, 
                        detail=f"分块文件缺失: chunk_{chunk_num:06d}"
                    )
        
        # 验证文件哈希（如果提供）
        if session.get("file_hash"):
            actual_hash = calculate_file_hash(final_file_path)
            if actual_hash != session["file_hash"]:
                raise HTTPException(
                    status_code=400, 
                    detail="文件哈希验证失败，文件可能已损坏"
                )
        
        # 处理文件并加载到DuckDB
        file_info = await process_uploaded_file(final_file_path, session["file_name"])
        
        # 清理分块文件
        import shutil
        if os.path.exists(session["chunks_dir"]):
            shutil.rmtree(session["chunks_dir"])
        
        # 安排文件清理（2小时后）
        if background_tasks:
            schedule_cleanup(final_file_path, background_tasks, delay_hours=2)
        
        # 更新会话状态
        session["status"] = "completed"
        session["file_info"] = file_info
        
        logger.info(f"文件上传完成: {session['file_name']}, 大小: {session['file_size']}")
        
        return {
            "success": True,
            "upload_id": upload_id,
            "file_info": file_info,
            "message": "文件上传和处理完成"
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


async def process_uploaded_file(file_path: str, file_name: str) -> Dict[str, Any]:
    """处理上传的文件并加载到DuckDB"""
    try:
        # 检测文件类型
        file_extension = file_name.lower().split('.')[-1]
        
        # 读取文件
        if file_extension == 'csv':
            df = pd.read_csv(file_path, dtype=str)
        elif file_extension in ['xlsx', 'xls']:
            df = pd.read_excel(file_path, dtype=str)
        elif file_extension in ['json', 'jsonl']:
            try:
                df = pd.read_json(file_path, lines=True)
            except ValueError:
                df = pd.read_json(file_path)
            df = df.astype(str)
        elif file_extension in ['parquet', 'pq']:
            df = pd.read_parquet(file_path)
            df = df.astype(str)
        else:
            raise ValueError(f"不支持的文件类型: {file_extension}")
        
        # 生成表名
        source_id = file_name.split('.')[0]
        
        # 加载到DuckDB
        con = get_db_connection()
        create_table_from_dataframe(con, source_id, df)
        
        # 保存文件数据源配置
        file_info = {
            "source_id": source_id,
            "filename": file_name,
            "file_path": file_path,
            "file_type": file_extension,
            "row_count": len(df),
            "column_count": len(df.columns),
            "columns": list(df.columns),
            "upload_time": pd.Timestamp.now()
        }
        
        file_datasource_manager.save_file_datasource(file_info)
        
        logger.info(f"文件处理完成: {file_name}, 表名: {source_id}, 行数: {len(df)}")
        
        return {
            "source_id": source_id,
            "filename": file_name,
            "file_size": os.path.getsize(file_path),
            "row_count": len(df),
            "column_count": len(df.columns),
            "columns": list(df.columns),
            "preview_data": df.head(5).to_dict(orient="records")
        }
        
    except Exception as e:
        logger.error(f"处理文件失败: {str(e)}")
        raise


@router.get("/api/upload/status/{upload_id}", tags=["Chunked Upload"])
async def get_upload_status(upload_id: str):
    """获取上传状态"""
    try:
        if upload_id not in upload_sessions:
            raise HTTPException(status_code=404, detail="上传会话不存在")
        
        session = upload_sessions[upload_id]
        progress = session["uploaded_chunks"] / session["total_chunks"] * 100
        
        return UploadStatus(
            upload_id=upload_id,
            file_name=session["file_name"],
            total_chunks=session["total_chunks"],
            uploaded_chunks=session["uploaded_chunks"],
            progress=progress,
            status=session["status"],
            file_size=session["file_size"],
            created_at=session["created_at"],
            error_message=session.get("error_message")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取上传状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取上传状态失败: {str(e)}")


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
        
        return {
            "success": True,
            "message": "上传已取消"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"取消上传失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"取消上传失败: {str(e)}")
