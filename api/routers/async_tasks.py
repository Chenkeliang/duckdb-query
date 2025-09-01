"""
异步任务API路由
提供异步任务的创建、查询和管理功能
"""

import logging
import os
import traceback
import time
import pandas as pd
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from datetime import datetime

from core.task_manager import task_manager, TaskStatus
from core.duckdb_engine import get_db_connection
from core.file_datasource_manager import (
    file_datasource_manager,
    create_table_from_dataframe,
)
from core.config_manager import config_manager
from core.timezone_utils import get_current_time_iso

logger = logging.getLogger(__name__)
router = APIRouter()

# 确保导出目录存在
EXPORTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "exports")
os.makedirs(EXPORTS_DIR, exist_ok=True)


class AsyncQueryRequest(BaseModel):
    """异步查询请求模型"""

    sql: str
    format: str = "parquet"  # 支持 "parquet" 或 "csv"


class AsyncQueryResponse(BaseModel):
    """异步查询响应模型"""

    success: bool
    task_id: str
    message: str


class TaskListResponse(BaseModel):
    """任务列表响应模型"""

    success: bool
    tasks: list
    count: int


class TaskDetailResponse(BaseModel):
    """任务详情响应模型"""

    success: bool
    task: dict


@router.post(
    "/api/async_query", response_model=AsyncQueryResponse, tags=["Async Tasks"]
)
async def submit_async_query(
    request: AsyncQueryRequest, background_tasks: BackgroundTasks
):
    """
    提交异步查询任务
    """
    try:
        if not request.sql.strip():
            raise HTTPException(status_code=400, detail="SQL查询不能为空")

        # 验证输出格式
        if request.format not in ["parquet", "csv"]:
            raise HTTPException(
                status_code=400, detail="不支持的输出格式，仅支持 parquet 或 csv"
            )

        # 创建任务，将格式信息存储在任务查询中
        task_query = {"sql": request.sql, "format": request.format}

        # 创建任务
        task_id = task_manager.create_task(str(task_query))

        # 添加后台任务执行查询
        background_tasks.add_task(
            execute_async_query, task_id, request.sql, request.format
        )

        return AsyncQueryResponse(
            success=True, task_id=task_id, message="任务已提交，请稍后查询任务状态"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"提交异步查询任务失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"提交任务失败: {str(e)}")


@router.get("/api/async_tasks", response_model=TaskListResponse, tags=["Async Tasks"])
async def list_async_tasks(limit: int = 100):
    """
    获取所有异步任务列表
    """
    try:
        tasks = task_manager.list_tasks(limit)
        return TaskListResponse(success=True, tasks=tasks, count=len(tasks))
    except Exception as e:
        logger.error(f"获取异步任务列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取任务列表失败: {str(e)}")


@router.get(
    "/api/async_tasks/{task_id}",
    response_model=TaskDetailResponse,
    tags=["Async Tasks"],
)
async def get_async_task(task_id: str):
    """
    获取单个异步任务详情
    """
    try:
        task = task_manager.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 解析任务查询中的格式信息
        import json

        try:
            task_dict = task.to_dict()
            query_info = json.loads(task_dict["query"])
            if isinstance(query_info, dict) and "sql" in query_info:
                task_dict["query"] = query_info["sql"]
                task_dict["format"] = query_info.get("format", "parquet")
        except (json.JSONDecodeError, TypeError):
            # 如果不是JSON格式，保持原样
            pass

        return TaskDetailResponse(success=True, task=task_dict)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取异步任务详情失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取任务详情失败: {str(e)}")


@router.get("/api/async_tasks/{task_id}/result", tags=["Async Tasks"])
async def download_async_task_result(task_id: str):
    """
    下载异步任务结果文件
    """
    try:
        task = task_manager.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 统一使用枚举值进行比较
        if task.status.value != TaskStatus.SUCCESS.value:
            raise HTTPException(status_code=400, detail="任务尚未成功完成")

        if not task.result_file_path or not os.path.exists(task.result_file_path):
            raise HTTPException(status_code=404, detail="结果文件不存在")

        # 确定文件名和媒体类型
        file_name = os.path.basename(task.result_file_path)

        # 根据文件扩展名确定媒体类型
        if file_name.endswith(".csv"):
            media_type = "text/csv"
        else:  # 默认为parquet
            media_type = "application/octet-stream"

        # 返回文件
        return FileResponse(
            task.result_file_path,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"下载异步任务结果失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"下载结果失败: {str(e)}")


def execute_async_query(task_id: str, sql: str, format: str = "parquet"):
    """
    执行异步查询（后台任务）
    """
    try:
        # 标记任务为运行中
        if not task_manager.start_task(task_id):
            logger.error(f"无法启动任务: {task_id}")
            return

        logger.info(f"开始执行异步查询任务: {task_id}")
        start_time = time.time()

        # 获取DuckDB连接
        con = get_db_connection()

        # 执行查询（不带LIMIT）
        logger.info(f"执行SQL查询: {sql}")
        result_df = con.execute(sql).fetchdf()

        # 生成结果文件路径
        timestamp = get_current_time().strftime("%Y%m%d_%H%M%S")
        if format == "csv":
            result_file_name = f"task-{task_id}_{timestamp}.csv"
            result_file_path = os.path.join(EXPORTS_DIR, result_file_name)

            # 保存结果到CSV文件
            result_df.to_csv(result_file_path, index=False)
            logger.info(f"查询结果已保存到: {result_file_path}")
        else:  # 默认为parquet
            result_file_name = f"task-{task_id}_{timestamp}.parquet"
            result_file_path = os.path.join(EXPORTS_DIR, result_file_name)

            # 保存结果到Parquet文件
            result_df.to_parquet(result_file_path, index=False)
            logger.info(f"查询结果已保存到: {result_file_path}")

        # 注册为新数据源
        source_id = f"async_result_{task_id}"
        file_info = {
            "source_id": source_id,
            "filename": result_file_name,
            "file_path": result_file_path,
            "file_type": format,
            "created_at": get_current_time_iso(),  # 使用统一的时区配置
            "columns": [
                {"name": col, "type": str(result_df[col].dtype)}
                for col in result_df.columns
            ],
            "row_count": len(result_df),
            "column_count": len(result_df.columns),
        }

        # 保存文件数据源配置
        file_datasource_manager.save_file_datasource(file_info)

        # 将结果文件加载到DuckDB中
        try:
            create_table_from_dataframe(con, source_id, result_file_path, format)
            logger.info(f"结果文件已注册为数据源: {source_id}")
        except Exception as e:
            logger.warning(f"将结果文件注册为数据源失败: {str(e)}")

        # 标记任务为成功
        execution_time = time.time() - start_time
        if not task_manager.complete_task(task_id, result_file_path):
            logger.error(f"无法标记任务为成功: {task_id}")

        logger.info(
            f"异步查询任务执行完成: {task_id}, 执行时间: {execution_time:.2f}秒"
        )

    except Exception as e:
        logger.error(f"执行异步查询任务失败: {task_id}, 错误: {str(e)}")
        logger.error(traceback.format_exc())

        # 标记任务为失败
        error_message = str(e)
        if not task_manager.fail_task(task_id, error_message):
            logger.error(f"无法标记任务为失败: {task_id}")
