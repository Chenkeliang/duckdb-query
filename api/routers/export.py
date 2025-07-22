"""
导出功能路由
支持多种格式的数据导出：CSV、Excel、JSON、Parquet
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from models.query_models import ExportRequest, ExportTask, ExportFormat, QueryRequest
from core.duckdb_engine import execute_query, build_join_query
import pandas as pd
import logging
import os
import uuid
import datetime
import io
import json
from typing import Dict, Any
import asyncio
import tempfile

logger = logging.getLogger(__name__)

router = APIRouter()

# 导出任务存储（在生产环境中应该使用数据库或Redis）
export_tasks: Dict[str, ExportTask] = {}


@router.post("/api/export", tags=["Export"])
async def export_data(
    export_request: ExportRequest,
    background_tasks: BackgroundTasks
):
    """导出查询结果"""
    try:
        # 创建导出任务
        task_id = str(uuid.uuid4())
        task = ExportTask(
            id=task_id,
            status="pending",
            format=export_request.format,
            filename=export_request.filename or f"export_{task_id}.{export_request.format.value}",
            created_at=datetime.datetime.now()
        )
        
        export_tasks[task_id] = task
        
        # 启动后台导出任务
        background_tasks.add_task(
            process_export_task,
            task_id,
            export_request
        )
        
        return {
            "success": True,
            "task_id": task_id,
            "message": "导出任务已创建，正在处理中"
        }
        
    except Exception as e:
        logger.error(f"创建导出任务失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"创建导出任务失败: {str(e)}")


@router.get("/api/export/tasks/{task_id}", tags=["Export"])
async def get_export_task_status(task_id: str):
    """获取导出任务状态"""
    try:
        if task_id not in export_tasks:
            raise HTTPException(status_code=404, detail="导出任务不存在")
        
        task = export_tasks[task_id]
        return {
            "success": True,
            "task": task
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取导出任务状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取导出任务状态失败: {str(e)}")


@router.get("/api/export/download/{task_id}", tags=["Export"])
async def download_export_file(task_id: str):
    """下载导出文件"""
    try:
        if task_id not in export_tasks:
            raise HTTPException(status_code=404, detail="导出任务不存在")
        
        task = export_tasks[task_id]
        
        if task.status != "completed":
            raise HTTPException(status_code=400, detail="导出任务尚未完成")
        
        # 构建文件路径
        export_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "exports")
        file_path = os.path.join(export_dir, task.filename)
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="导出文件不存在")
        
        # 确定媒体类型
        media_type_map = {
            ExportFormat.CSV: "text/csv",
            ExportFormat.EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ExportFormat.JSON: "application/json",
            ExportFormat.PARQUET: "application/octet-stream"
        }
        
        media_type = media_type_map.get(task.format, "application/octet-stream")
        
        return FileResponse(
            path=file_path,
            filename=task.filename,
            media_type=media_type
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"下载导出文件失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"下载导出文件失败: {str(e)}")


@router.get("/api/export/tasks", tags=["Export"])
async def list_export_tasks():
    """列出所有导出任务"""
    try:
        return {
            "success": True,
            "tasks": list(export_tasks.values())
        }
    except Exception as e:
        logger.error(f"获取导出任务列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取导出任务列表失败: {str(e)}")


@router.delete("/api/export/tasks/{task_id}", tags=["Export"])
async def delete_export_task(task_id: str):
    """删除导出任务和文件"""
    try:
        if task_id not in export_tasks:
            raise HTTPException(status_code=404, detail="导出任务不存在")
        
        task = export_tasks[task_id]
        
        # 删除文件
        export_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "exports")
        file_path = os.path.join(export_dir, task.filename)
        
        if os.path.exists(file_path):
            os.remove(file_path)
        
        # 删除任务记录
        del export_tasks[task_id]
        
        return {
            "success": True,
            "message": "导出任务已删除"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除导出任务失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除导出任务失败: {str(e)}")


async def process_export_task(task_id: str, export_request: ExportRequest):
    """处理导出任务"""
    task = export_tasks[task_id]
    
    try:
        # 更新任务状态
        task.status = "processing"
        task.progress = 0.1
        
        # 执行查询
        logger.info(f"开始执行导出查询，任务ID: {task_id}")
        
        # 构建查询
        if len(export_request.query_request.sources) == 1:
            # 单表查询
            source = export_request.query_request.sources[0]
            query = f'SELECT * FROM "{source.id}"'
            if export_request.query_request.where_conditions:
                query += f" WHERE {export_request.query_request.where_conditions}"
            if export_request.query_request.order_by:
                query += f" ORDER BY {export_request.query_request.order_by}"
            if export_request.query_request.limit:
                query += f" LIMIT {export_request.query_request.limit}"
        else:
            # 多表JOIN查询
            query = build_join_query(export_request.query_request)
        
        # 执行查询
        df = execute_query(query)
        task.progress = 0.5
        
        # 创建导出目录
        export_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "exports")
        os.makedirs(export_dir, exist_ok=True)
        
        # 导出文件
        file_path = os.path.join(export_dir, task.filename)
        
        if export_request.format == ExportFormat.CSV:
            df.to_csv(file_path, index=False, encoding='utf-8-sig')
        elif export_request.format == ExportFormat.EXCEL:
            df.to_excel(file_path, index=False, engine='openpyxl')
        elif export_request.format == ExportFormat.JSON:
            df.to_json(file_path, orient='records', force_ascii=False, indent=2)
        elif export_request.format == ExportFormat.PARQUET:
            df.to_parquet(file_path, index=False)
        
        # 获取文件大小
        file_size = os.path.getsize(file_path)
        
        # 更新任务状态
        task.status = "completed"
        task.progress = 1.0
        task.completed_at = datetime.datetime.now()
        task.file_size = file_size
        
        logger.info(f"导出任务完成，任务ID: {task_id}, 文件大小: {file_size} bytes")
        
    except Exception as e:
        # 更新任务状态为失败
        task.status = "failed"
        task.error_message = str(e)
        logger.error(f"导出任务失败，任务ID: {task_id}, 错误: {str(e)}")


@router.post("/api/export/quick", tags=["Export"])
async def quick_export(export_request: ExportRequest):
    """快速导出（直接返回文件流，适用于小数据集）"""
    try:
        # 构建查询
        if len(export_request.query_request.sources) == 1:
            source = export_request.query_request.sources[0]
            query = f'SELECT * FROM "{source.id}"'
            if export_request.query_request.where_conditions:
                query += f" WHERE {export_request.query_request.where_conditions}"
            if export_request.query_request.order_by:
                query += f" ORDER BY {export_request.query_request.order_by}"
            if export_request.query_request.limit:
                query += f" LIMIT {export_request.query_request.limit}"
        else:
            query = build_join_query(export_request.query_request)
        
        # 执行查询
        df = execute_query(query)
        
        # 检查数据大小
        if len(df) > 10000:
            raise HTTPException(
                status_code=400, 
                detail="数据量过大，请使用异步导出功能"
            )
        
        # 生成文件内容
        output = io.BytesIO()
        
        if export_request.format == ExportFormat.CSV:
            csv_content = df.to_csv(index=False, encoding='utf-8-sig')
            output.write(csv_content.encode('utf-8-sig'))
            media_type = "text/csv"
            filename = export_request.filename or "export.csv"
        elif export_request.format == ExportFormat.JSON:
            json_content = df.to_json(orient='records', force_ascii=False, indent=2)
            output.write(json_content.encode('utf-8'))
            media_type = "application/json"
            filename = export_request.filename or "export.json"
        else:
            raise HTTPException(
                status_code=400, 
                detail="快速导出仅支持CSV和JSON格式"
            )
        
        output.seek(0)
        
        return StreamingResponse(
            io.BytesIO(output.read()),
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"快速导出失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"快速导出失败: {str(e)}")
