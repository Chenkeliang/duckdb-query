"""
异步任务API路由
提供异步任务的创建、查询和管理功能
"""

import logging
import os
import traceback
import time
import json
import pandas as pd
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, BackgroundTasks, Body
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from datetime import datetime

from core.task_manager import task_manager, TaskStatus
from core.duckdb_engine import get_db_connection, create_varchar_table_from_dataframe
from core.file_datasource_manager import (
    file_datasource_manager,
    create_table_from_dataframe,
    build_table_metadata_snapshot,
)
from core.config_manager import config_manager
from core.timezone_utils import get_current_time_iso, get_current_time
from core.task_utils import TaskUtils
from models.query_models import DatabaseConnection, DataSourceType

logger = logging.getLogger(__name__)
router = APIRouter()

# 使用统一配置管理获取导出目录
EXPORTS_DIR = str(config_manager.get_exports_dir())

# 初始化任务工具类
task_utils = TaskUtils(EXPORTS_DIR)

SUPPORTED_EXTERNAL_TYPES = {"mysql", "postgresql", "sqlite"}


def _ensure_database_connection(datasource_id: str, datasource_type: str):
    from core.database_manager import db_manager

    connection = db_manager.get_connection(datasource_id)
    if connection:
        return connection

    try:
        db_manager.list_connections()
    except Exception as load_error:
        logger.debug(f"加载数据库连接配置失败: {load_error}")

    connection = db_manager.get_connection(datasource_id)
    if connection:
        return connection

    config_dir = os.getenv("CONFIG_DIR")
    if config_dir:
        config_path = os.path.join(config_dir, "datasources.json")
    else:
        config_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "config",
            "datasources.json",
        )

    if not os.path.exists(config_path):
        raise ValueError(f"未找到数据源配置文件: {config_path}")

    with open(config_path, "r", encoding="utf-8") as f:
        config_data = json.load(f)

    target_config = None
    for cfg in config_data.get("database_sources", []):
        if cfg.get("id") == datasource_id:
            target_config = cfg
            break

    if not target_config:
        raise ValueError(f"未找到数据源配置: {datasource_id}")

    connection = DatabaseConnection(
        id=target_config["id"],
        name=target_config.get("name", target_config["id"]),
        type=DataSourceType(target_config.get("type", datasource_type)),
        params=target_config.get("params", {}),
        created_at=get_current_time(),
    )

    added = db_manager.add_connection(connection)
    if not added:
        raise ValueError(f"创建数据库连接失败: {datasource_id}")

    return db_manager.get_connection(datasource_id)


def _fetch_external_query_result(datasource: Dict[str, Any], sql: str) -> pd.DataFrame:
    if not isinstance(datasource, dict):
        raise ValueError("无效的数据源配置")

    datasource_type = (datasource.get("type") or "").lower()
    if datasource_type not in SUPPORTED_EXTERNAL_TYPES:
        raise ValueError(f"不支持的数据源类型: {datasource_type}")

    datasource_id = datasource.get("id")
    if not datasource_id:
        raise ValueError("外部数据源缺少ID")

    connection = _ensure_database_connection(datasource_id, datasource_type)
    if not connection:
        raise ValueError(f"无法建立数据源连接: {datasource_id}")

    from core.database_manager import db_manager

    result_df = db_manager.execute_query(datasource_id, sql)
    if result_df is None or result_df.empty:
        raise ValueError("查询结果为空，无法创建异步任务")

    return result_df


class AsyncQueryRequest(BaseModel):
    """异步查询请求模型"""

    sql: str
    custom_table_name: Optional[str] = None  # 自定义表名（可选）
    task_type: str = "query"  # 任务类型：query, save_to_table, export
    datasource: Optional[Dict[str, Any]] = None


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


class CancelTaskRequest(BaseModel):
    """手动取消任务请求"""

    reason: Optional[str] = "用户手动取消"


class RetryTaskRequest(BaseModel):
    """重试任务请求，可选覆盖部分配置"""

    override_sql: Optional[str] = None
    custom_table_name: Optional[str] = None
    datasource_override: Optional[Dict[str, Any]] = None


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

        # 创建任务，将信息存储在任务查询中
        task_query = {
            "sql": request.sql,
            "custom_table_name": request.custom_table_name,
            "task_type": request.task_type,
            "datasource": request.datasource,
        }

        # 创建任务并保存元数据
        task_id = task_manager.create_task(
            request.sql,
            task_type=request.task_type,
            datasource=request.datasource,
            metadata=task_query,
        )

        # 添加后台任务执行查询
        background_tasks.add_task(
            execute_async_query,
            task_id,
            request.sql,
            request.custom_table_name,
            request.task_type,
            request.datasource,
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
        except (json.JSONDecodeError, TypeError):
            # 如果不是JSON格式，保持原样
            pass

        return TaskDetailResponse(success=True, task=task_dict)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取异步任务详情失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取任务详情失败: {str(e)}")


@router.post(
    "/api/async_tasks/{task_id}/cancel",
    tags=["Async Tasks"],
)
async def cancel_async_task(task_id: str, request: CancelTaskRequest):
    """
    手动取消异步任务，状态强制设为失败
    """
    reason = (request.reason or "用户手动取消").strip()
    success = task_manager.force_fail_task(
        task_id,
        reason,
        {
            "manual_cancelled": True,
            "cancel_reason": reason,
            "cancelled_at": get_current_time_iso(),
        },
    )
    if not success:
        raise HTTPException(status_code=400, detail="任务状态不允许取消或任务不存在")
    return {"success": True, "task_id": task_id, "message": "任务已取消"}


def _extract_task_payload(task) -> Dict[str, Any]:
    """
    提取任务的原始执行参数
    """
    metadata = task.metadata or {}
    payload: Dict[str, Any] = {}
    if isinstance(metadata, dict):
        payload.update(metadata)
    else:
        # 尝试从 query 字段解析
        import json

        try:
            payload.update(json.loads(str(metadata)))
        except Exception:
            pass

    if "sql" not in payload or not payload["sql"]:
        raw_sql = task.query
        if isinstance(raw_sql, str):
            # 如果是字典字符串，尝试解析
            if raw_sql.strip().startswith("{") and "sql" in raw_sql:
                import json

                try:
                    guess = json.loads(raw_sql.replace("'", '"'))
                    if isinstance(guess, dict) and "sql" in guess:
                        payload.setdefault("sql", guess.get("sql"))
                        payload.setdefault("task_type", guess.get("task_type"))
                        payload.setdefault("custom_table_name", guess.get("custom_table_name"))
                        payload.setdefault("datasource", guess.get("datasource"))
                except Exception:
                    pass
            else:
                payload.setdefault("sql", raw_sql)
    payload.setdefault("task_type", getattr(task, "task_type", None) or "query")
    return payload


@router.post(
    "/api/async_tasks/{task_id}/retry",
    response_model=AsyncQueryResponse,
    tags=["Async Tasks"],
)
async def retry_async_task(
    task_id: str,
    background_tasks: BackgroundTasks,
    request: RetryTaskRequest,
):
    """
    重试指定异步任务，可选覆盖 SQL / 数据源等参数
    """
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    payload = _extract_task_payload(task)

    sql = (request.override_sql or payload.get("sql") or "").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="原任务缺少SQL，无法重试")

    task_type = payload.get("task_type", "query")
    datasource = request.datasource_override or payload.get("datasource")
    custom_table_name = request.custom_table_name or payload.get("custom_table_name")

    retry_metadata = dict(payload)
    retry_metadata.update(
        {
            "sql": sql,
            "task_type": task_type,
            "custom_table_name": custom_table_name,
            "datasource": datasource,
            "retry_of": task_id,
        }
    )

    new_task_id = task_manager.create_task(
        sql,
        task_type=task_type,
        datasource=datasource,
        metadata=retry_metadata,
    )

    background_tasks.add_task(
        execute_async_query,
        new_task_id,
        sql,
        custom_table_name,
        task_type,
        datasource,
    )

    task_manager.update_task(task_id, {"last_retry_id": new_task_id})

    return AsyncQueryResponse(
        success=True,
        task_id=new_task_id,
        message="任务已重新提交执行",
    )


@router.post("/api/async-tasks/{task_id}/download", tags=["Async Tasks"])
async def generate_and_download_file(task_id: str, request: dict = Body(...)):
    """
    按需生成并直接下载文件
    一步完成文件生成和下载，避免时序问题
    """
    try:
        format = request.get("format", "csv")

        # 验证格式参数
        if format not in ["csv", "parquet"]:
            raise HTTPException(
                status_code=400, detail="不支持的格式，只支持csv和parquet"
            )

        # 生成下载文件
        file_path = generate_download_file(task_id, format)

        # 检查文件是否存在
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="生成的文件不存在")

        # 确定文件名和媒体类型
        file_name = os.path.basename(file_path)
        media_type = task_utils.get_media_type(file_path)

        # 直接返回文件
        return FileResponse(
            file_path,
            media_type=media_type,
            filename=file_name,
        )

    except ValueError as e:
        logger.warning(f"下载文件生成失败: {task_id}, 错误: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"下载文件生成失败: {task_id}, 错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"生成下载文件失败: {str(e)}")


def execute_async_query(
    task_id: str,
    sql: str,
    custom_table_name: Optional[str] = None,
    task_type: str = "query",
    datasource: Optional[Dict[str, Any]] = None,
):
    """
    执行异步查询（后台任务）- 内存优化版本
    使用DuckDB原生功能，避免Python内存加载
    """
    try:
        # 标记任务为运行中
        if not task_manager.start_task(task_id):
            logger.error(f"无法启动任务: {task_id}")
            return

        logger.info(f"开始执行异步查询任务: {task_id}")
        start_time = time.time()

        # 智能移除系统自动添加的LIMIT，确保异步任务获取完整数据
        from routers.query import remove_auto_added_limit

        clean_sql = remove_auto_added_limit(sql)
        if clean_sql != sql.strip():
            logger.info(f"异步任务移除了系统自动添加的LIMIT: {sql} -> {clean_sql}")
        else:
            logger.info(f"异步任务使用原始SQL: {clean_sql}")

        # 使用连接池获取DuckDB连接，避免阻塞其他请求
        from core.duckdb_pool import get_connection_pool

        pool = get_connection_pool()

        datasource_info = datasource if isinstance(datasource, dict) else None
        datasource_type = (
            (datasource_info.get("type") or "").lower()
            if datasource_info
            else ""
        )
        use_external_source = datasource_type in SUPPORTED_EXTERNAL_TYPES
        source_datasource_id = datasource_info.get("id") if datasource_info else None

        with pool.get_connection() as con:
            # 创建持久表存储查询结果（避免fetchdf()内存问题）
            if custom_table_name:
                # 使用自定义表名，确保表名安全
                safe_table_name = custom_table_name.replace(" ", "_").replace("-", "_")
                # 移除特殊字符，只保留字母、数字、下划线
                import re

                safe_table_name = re.sub(r"[^a-zA-Z0-9_]", "", safe_table_name)
                table_name = safe_table_name  # 直接使用用户提供的表名
            else:
                table_name = task_utils.task_id_to_table_name(task_id)
            logger.info(f"创建持久表存储查询结果: {table_name}")

            if use_external_source:
                logger.info(
                    f"异步任务将使用外部数据源 {source_datasource_id} ({datasource_type}) 执行查询"
                )
                result_df = _fetch_external_query_result(datasource_info, clean_sql)
                created = create_varchar_table_from_dataframe(table_name, result_df, con)
                if not created:
                    raise ValueError("外部数据源结果写入DuckDB失败")
                logger.info(f"外部数据源查询结果已写入DuckDB表: {table_name}")
            else:
                # 使用清理后的SQL创建持久表，确保获取完整数据
                create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({clean_sql})'
                con.execute(create_sql)
                logger.info(f"持久表创建成功: {table_name}")

            metadata_snapshot = build_table_metadata_snapshot(con, table_name)
            row_count = metadata_snapshot.get("row_count", 0)
            logger.info(f"查询结果行数: {row_count}")

            columns_sql = f'DESCRIBE "{table_name}"'
            columns_info = con.execute(columns_sql).fetchall()
            columns = [{"name": col[0], "type": col[1]} for col in columns_info]
            logger.info(f"查询结果列数: {len(columns)}")

            # 保存表元数据到文件数据源管理器
            source_id = table_name
            table_metadata = {
                "source_id": source_id,
                "filename": f"async_query_{task_id}",
                "file_path": f"duckdb://{table_name}",
                "file_type": "duckdb_async_query",
                "created_at": get_current_time_iso(),
                "source_sql": sql,
                "schema_version": 2,
                **metadata_snapshot,
            }

            if source_datasource_id:
                table_metadata["source_datasource"] = source_datasource_id
                table_metadata["source_datasource_type"] = datasource_type

            # 保存到文件数据源管理器
            file_datasource_manager.save_file_datasource(table_metadata)
            logger.info(f"表元数据保存成功: {source_id}")

            # 更新任务状态为完成，但不生成文件（按需下载）
            task_info = {
                "status": "completed",
                "table_name": table_name,
                "row_count": row_count,
                "columns": columns,
                "file_generated": False,
                "task_type": task_type,
            }

            if source_datasource_id:
                task_info["source_datasource"] = source_datasource_id
                task_info["source_datasource_type"] = datasource_type

            # 如果是自定义表名，添加原始表名信息
            if custom_table_name:
                task_info["custom_table_name"] = custom_table_name
                task_info["display_name"] = custom_table_name

            if not task_manager.complete_task(task_id, task_info):
                logger.error(f"无法标记任务为成功: {task_id}")

            # 内存清理
            try:
                con.execute("PRAGMA memory_limit='1GB'")
                con.execute("PRAGMA force_external")
                import gc

                gc.collect()
                logger.info("内存清理完成")
            except Exception as cleanup_error:
                logger.warning(f"内存清理失败: {str(cleanup_error)}")

            execution_time = time.time() - start_time
            logger.info(
                f"异步查询任务执行完成: {task_id}, 执行时间: {execution_time:.2f}秒, 内存优化版本"
            )

    except Exception as e:
        logger.error(f"执行异步查询任务失败: {task_id}, 错误: {str(e)}")
        logger.error(traceback.format_exc())

        # 标记任务为失败
        error_message = str(e)
        if not task_manager.fail_task(task_id, error_message):
            logger.error(f"无法标记任务为失败: {task_id}")


def generate_download_file(task_id: str, format: str = "csv"):
    """
    按需生成下载文件 - 基于持久DuckDB表进行COPY导出
    避免重复加载数据到内存
    """
    try:
        # 获取任务信息
        task_info = task_manager.get_task(task_id)
        if not task_info:
            # 尝试从文件系统恢复任务信息
            task_info = task_utils.recover_task_from_files(task_id)
            if not task_info:
                raise ValueError(f"任务 {task_id} 不存在")

        # 检查任务状态
        if not task_utils.is_task_completed(task_info):
            raise ValueError(f"任务 {task_id} 未完成，无法生成下载文件")

        # 检查是否已经有生成的文件
        if task_info.result_file_path and os.path.exists(task_info.result_file_path):
            existing_file = task_info.result_file_path
            existing_format = existing_file.split(".")[-1]

            # 如果请求的格式与现有文件格式相同，直接返回
            if existing_format == format:
                logger.info(f"使用现有文件: {existing_file}")
                return existing_file

            # 如果格式不同，需要转换
            logger.info(f"需要转换格式: {existing_format} -> {format}")

        # 从result_info中获取表名
        if not task_info.result_info:
            raise ValueError(f"任务 {task_id} 缺少结果信息")

        table_name = task_info.result_info.get("table_name")
        if not table_name:
            raise ValueError(f"任务 {task_id} 缺少表名信息")

        # 使用连接池获取连接
        from core.duckdb_pool import get_connection_pool

        pool = get_connection_pool()

        with pool.get_connection() as con:
            # 验证表是否存在
            try:
                con.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()
            except Exception as e:
                raise ValueError(f"表 {table_name} 不存在或已删除: {str(e)}")

            # 生成文件路径
            result_file_path = task_utils.generate_file_path(task_id, format)

            # 使用COPY命令基于持久表生成文件（流式处理，避免内存加载）
            if format == "csv":
                copy_sql = f'COPY "{table_name}" TO "{result_file_path}" WITH (FORMAT CSV, HEADER true)'
            else:
                copy_sql = (
                    f'COPY "{table_name}" TO "{result_file_path}" WITH (FORMAT PARQUET)'
                )

            logger.info(f"开始生成下载文件: {result_file_path}")
            con.execute(copy_sql)
            logger.info(f"下载文件生成成功: {result_file_path}")

            # 更新任务信息，标记文件已生成
            task_utils.update_task_file_info(task_info, result_file_path, format)

            return result_file_path

    except Exception as e:
        import traceback

        logger.error(f"生成下载文件失败: {task_id}, 错误: {str(e)}")
        logger.error(f"完整堆栈跟踪: {traceback.format_exc()}")
        raise Exception(f"生成下载文件失败: {str(e)}")


def cleanup_old_files():
    """
    清理过期的临时文件
    删除24小时前的下载文件，释放存储空间
    """
    try:
        import glob
        from datetime import datetime, timedelta

        # 获取24小时前的时间
        cutoff_time = datetime.now() - timedelta(hours=24)
        cleaned_count = task_manager.cleanup_expired_exports(cutoff_time)

        # 清理exports目录中的旧文件
        if os.path.exists(EXPORTS_DIR):
            for file_path in glob.glob(
                os.path.join(EXPORTS_DIR, "task-*.csv")
            ) + glob.glob(os.path.join(EXPORTS_DIR, "task-*.parquet")):
                try:
                    # 检查文件修改时间
                    file_mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
                    if file_mtime < cutoff_time:
                        os.remove(file_path)
                        cleaned_count += 1
                        logger.info(f"清理过期文件: {file_path}")
                except Exception as e:
                    logger.warning(f"清理文件失败: {file_path}, 错误: {str(e)}")

        # 清理过期的DuckDB表
        try:
            from core.duckdb_pool import get_connection_pool

            pool = get_connection_pool()

            with pool.get_connection() as con:
                # 获取所有异步结果表
                tables_sql = """
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_name LIKE 'async_result_%'
                """
                tables = con.execute(tables_sql).fetchall()

                for (table_name,) in tables:
                    try:
                        # 从表名中提取任务ID（需要将下划线还原为连字符）
                        safe_task_id = table_name.replace("async_result_", "")
                        task_id = safe_task_id.replace("_", "-")

                        # 检查任务是否过期（24小时前创建）
                        task_info = task_manager.get_task(task_id)
                        if task_info:
                            created_at = task_info.created_at
                            if created_at < cutoff_time:
                                # 删除过期的表
                                con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                                logger.info(f"清理过期表: {table_name}")
                                cleaned_count += 1
                    except Exception as e:
                        logger.warning(f"清理表失败: {table_name}, 错误: {str(e)}")

        except Exception as e:
            logger.warning(f"清理DuckDB表失败: {str(e)}")

        logger.info(f"文件清理完成，共清理 {cleaned_count} 个文件/表")
        return cleaned_count

    except Exception as e:
        logger.error(f"文件清理失败: {str(e)}")
        return 0
