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

# 配置日志
logger = logging.getLogger(__name__)
from core.task_utils import TaskUtils
from models.query_models import DatabaseConnection, DataSourceType, AttachDatabase
from core.validators import validate_pagination

router = APIRouter()

# 使用统一配置管理获取导出目录
EXPORTS_DIR = str(config_manager.get_exports_dir())

# 初始化任务工具类
task_utils = TaskUtils(EXPORTS_DIR)

SUPPORTED_EXTERNAL_TYPES = {"mysql", "postgresql", "sqlite"}


def validate_attach_databases(attach_databases: Optional[List[AttachDatabase]]) -> None:
    """
    验证 attach_databases 参数
    
    Args:
        attach_databases: 需要 ATTACH 的外部数据库列表
        
    Raises:
        HTTPException: 当验证失败时抛出 400 错误
        
    Note:
        空数组视为普通查询（非联邦查询），不会抛出错误
    """
    if not attach_databases:
        return
    
    # 空数组视为普通查询
    if len(attach_databases) == 0:
        return
    
    aliases = set()
    for db in attach_databases:
        # 验证 alias 不为空
        if not db.alias or not db.alias.strip():
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "VALIDATION_ERROR",
                    "message": "数据库别名不能为空",
                    "field": "attach_databases.alias"
                }
            )
        
        # 验证 connection_id 不为空
        if not db.connection_id or not db.connection_id.strip():
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "VALIDATION_ERROR",
                    "message": "连接ID不能为空",
                    "field": "attach_databases.connection_id"
                }
            )
        
        # 验证别名不重复
        alias = db.alias.strip()
        if alias in aliases:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "VALIDATION_ERROR",
                    "message": f"重复的数据库别名: {alias}",
                    "field": "attach_databases.alias"
                }
            )
        aliases.add(alias)


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


    # 如果此时还未找到，说明连接不存在
    raise ValueError(f"未找到数据源连接: {datasource_id}")


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


def _attach_external_databases(
    con,
    attach_databases: List[Dict[str, str]]
) -> List[str]:
    """
    执行 ATTACH 操作，返回成功附加的别名列表
    
    Args:
        con: DuckDB 连接
        attach_databases: 需要 ATTACH 的数据库列表，每个元素包含 alias 和 connection_id
        
    Returns:
        成功附加的数据库别名列表
        
    Raises:
        ValueError: 当连接不存在或 ATTACH 失败时
        
    Note:
        失败时会 DETACH 已附加的数据库并抛出异常
    """
    import re
    from core.database_manager import db_manager
    from core.encryption import password_encryptor
    from core.duckdb_engine import build_attach_sql
    
    attached = []
    
    # 验证 alias 格式（防止 SQL 注入）
    SAFE_ALIAS_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
    
    try:
        for db in attach_databases:
            alias = db["alias"]
            connection_id = db["connection_id"]
            
            # 验证 alias 格式安全性
            if not SAFE_ALIAS_PATTERN.match(alias):
                raise ValueError(f"无效的数据库别名格式: {alias}")
            
            # 获取连接配置
            connection = db_manager.get_connection(connection_id)
            if not connection:
                raise ValueError(f"数据库连接 '{connection_id}' 不存在")
            
            # 验证数据库类型
            db_type = connection.type.value if hasattr(connection.type, 'value') else str(connection.type)
            if db_type.lower() not in SUPPORTED_EXTERNAL_TYPES:
                raise ValueError(f"不支持的数据源类型: {db_type}")
            
            # 构建配置
            db_config = connection.params.copy()
            db_config['type'] = db_type
            
            # 解密密码（不记录敏感信息）
            password = db_config.get('password', '')
            if password and password_encryptor.is_encrypted(password):
                db_config['password'] = password_encryptor.decrypt_password(password)
                logger.debug(f"连接 {connection_id} 密码已处理")
            
            # 执行 ATTACH
            attach_sql = build_attach_sql(alias, db_config)
            logger.info(f"执行 ATTACH: {alias} (connection_id: {connection_id})")
            con.execute(attach_sql)
            attached.append(alias)
            logger.info(f"成功 ATTACH 数据库: {alias}")
            
    except Exception as e:
        # 回滚已附加的数据库
        logger.error(f"ATTACH 失败: {e}, 回滚已附加的数据库: {attached}")
        _detach_databases(con, attached)
        raise
    
    return attached


def _detach_databases(con, aliases: List[str]) -> None:
    """
    执行 DETACH 操作，忽略单个失败继续处理其他
    
    Args:
        con: DuckDB 连接
        aliases: 需要 DETACH 的数据库别名列表
        
    Note:
        alias 已在 _attach_external_databases 中验证过格式安全性
    """
    import re
    SAFE_ALIAS_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
    
    for alias in aliases:
        try:
            # 二次验证 alias 格式（防御性编程）
            if not SAFE_ALIAS_PATTERN.match(alias):
                logger.warning(f"跳过无效别名格式的 DETACH: {alias}")
                continue
            # 使用引号包裹 alias 防止 SQL 注入
            con.execute(f'DETACH "{alias}"')
            logger.info(f"成功 DETACH 数据库: {alias}")
        except Exception as e:
            logger.warning(f"DETACH {alias} 失败: {e}")


class AsyncQueryRequest(BaseModel):
    """异步查询请求模型"""

    sql: str
    custom_table_name: Optional[str] = None  # 自定义表名（可选）
    task_type: str = "query"  # 任务类型：query, save_to_table, export
    datasource: Optional[Dict[str, Any]] = None
    # 联邦查询支持：需要 ATTACH 的外部数据库列表
    attach_databases: Optional[List[AttachDatabase]] = None


class AsyncQueryResponse(BaseModel):
    """异步查询响应模型"""

    success: bool
    task_id: str
    message: str


class TaskListResponse(BaseModel):
    """任务列表响应模型（支持分页）"""

    success: bool
    tasks: list
    count: int
    total: int = 0  # 总数据量
    limit: int = 20
    offset: int = 0


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
    "/api/async-tasks", response_model=AsyncQueryResponse, tags=["Async Tasks"]
)
async def submit_async_query(
    request: AsyncQueryRequest, background_tasks: BackgroundTasks
):
    """
    提交异步查询任务
    
    支持联邦查询：通过 attach_databases 参数指定需要 ATTACH 的外部数据库
    """
    try:
        if not request.sql.strip():
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "VALIDATION_ERROR",
                    "message": "SQL查询不能为空",
                    "field": "sql"
                }
            )

        # 验证 attach_databases 参数
        validate_attach_databases(request.attach_databases)

        # 判断是否为联邦查询
        is_federated = bool(request.attach_databases and len(request.attach_databases) > 0)

        # 创建任务，将信息存储在任务查询中
        task_query = {
            "sql": request.sql,
            "custom_table_name": request.custom_table_name,
            "task_type": request.task_type,
            "datasource": request.datasource,
            "attach_databases": [
                {"alias": db.alias, "connection_id": db.connection_id}
                for db in request.attach_databases
            ] if request.attach_databases else None,
            "is_federated": is_federated,
        }

        # 创建任务并保存元数据
        task_id = task_manager.create_task(
            request.sql,
            task_type=request.task_type,
            datasource=request.datasource,
            metadata=task_query,
        )

        # 根据是否为联邦查询选择执行函数
        if is_federated:
            # 联邦查询：使用新的执行函数
            background_tasks.add_task(
                execute_async_federated_query,
                task_id,
                request.sql,
                request.custom_table_name,
                request.task_type,
                request.datasource,
                [{"alias": db.alias, "connection_id": db.connection_id} for db in request.attach_databases],
            )
        else:
            # 普通查询：使用原有执行函数
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


@router.get("/api/async-tasks", response_model=TaskListResponse, tags=["Async Tasks"])
async def list_async_tasks(
    limit: int = 20,
    offset: int = 0,
    order_by: str = "created_at"
):
    """
    获取异步任务列表（支持分页）
    
    Args:
        limit: 每页条数 (20, 50, 100)
        offset: 偏移量
        order_by: 排序字段 (created_at, started_at, completed_at, status)
    """
    # 校验分页参数
    validate_pagination(limit, offset)
    
    try:
        tasks, total = task_manager.list_tasks(limit, offset, order_by)
        return TaskListResponse(
            success=True, 
            tasks=tasks, 
            count=len(tasks),
            total=total,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        logger.error(f"获取异步任务列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取任务列表失败: {str(e)}")


@router.get(
    "/api/async-tasks/{task_id}",
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
    "/api/async-tasks/{task_id}/cancel",
    tags=["Async Tasks"],
)
async def cancel_async_task(task_id: str, request: CancelTaskRequest):
    """
    请求取消异步任务（使用取消信号模式，避免写-写冲突）
    """
    try:
        reason = (request.reason or "用户手动取消").strip()
        # 使用 request_cancellation 设置取消标志，由后台任务检测并自行终止
        success = task_manager.request_cancellation(task_id, reason)
        if not success:
            # 检查任务是否存在
            task = task_manager.get_task(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            # 任务存在但状态不允许取消（已完成或已失败）
            raise HTTPException(
                status_code=400, 
                detail=f"任务状态不允许取消，当前状态: {task.status.value}"
            )
        return {"success": True, "task_id": task_id, "message": "取消请求已提交"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"取消任务失败: {task_id}, 错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"取消任务失败: {str(e)}")


def _extract_task_payload(task) -> Dict[str, Any]:
    """
    提取任务的原始执行参数
    
    支持提取联邦查询的 attach_databases 配置
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
                        # 提取联邦查询配置
                        payload.setdefault("attach_databases", guess.get("attach_databases"))
                        payload.setdefault("is_federated", guess.get("is_federated", False))
                except Exception:
                    pass
            else:
                payload.setdefault("sql", raw_sql)
    payload.setdefault("task_type", getattr(task, "task_type", None) or "query")
    return payload


@router.post(
    "/api/async-tasks/{task_id}/retry",
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
    try:
        task = task_manager.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        payload = _extract_task_payload(task)
        logger.info(f"重试任务 {task_id}, 提取的 payload: {payload}")

        sql = (request.override_sql or payload.get("sql") or "").strip()
        if not sql:
            raise HTTPException(status_code=400, detail="原任务缺少SQL，无法重试")

        task_type = payload.get("task_type", "query")
        datasource = request.datasource_override or payload.get("datasource")
        custom_table_name = request.custom_table_name or payload.get("custom_table_name")
        
        # 提取联邦查询配置（支持覆盖）
        attach_databases = payload.get("attach_databases")
        is_federated = bool(attach_databases and len(attach_databases) > 0)

        retry_metadata = dict(payload)
        retry_metadata.update(
            {
                "sql": sql,
                "task_type": task_type,
                "custom_table_name": custom_table_name,
                "datasource": datasource,
                "attach_databases": attach_databases,
                "is_federated": is_federated,
                "retry_of": task_id,
            }
        )

        new_task_id = task_manager.create_task(
            sql,
            task_type=task_type,
            datasource=datasource,
            metadata=retry_metadata,
        )

        # 根据是否为联邦查询选择执行函数
        if is_federated:
            background_tasks.add_task(
                execute_async_federated_query,
                new_task_id,
                sql,
                custom_table_name,
                task_type,
                datasource,
                attach_databases,
            )
        else:
            background_tasks.add_task(
                execute_async_query,
                new_task_id,
                sql,
                custom_table_name,
                task_type,
                datasource,
            )

        # 注意：移除了 update_task 调用，避免写写冲突
        # 重试关系已通过 retry_metadata["retry_of"] 记录在新任务中

        return AsyncQueryResponse(
            success=True,
            task_id=new_task_id,
            message="任务已重新提交执行",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"重试任务失败 {task_id}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"重试任务失败: {str(e)}")


@router.post("/api/async-tasks/cleanup-stuck", tags=["Async Tasks"])
async def cleanup_stuck_tasks():
    """
    清理卡住的取消中任务
    将所有 cancelling 状态的任务标记为 failed
    """
    try:
        count = task_manager.cleanup_stuck_cancelling_tasks()
        return {"success": True, "cleaned_count": count}
    except Exception as e:
        logger.error(f"清理卡住任务失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"清理失败: {str(e)}")


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
    
    关键设计：DuckDB 是单写入者数据库，多个连接同时写入会导致写写冲突。
    因此，所有写操作（查询执行、任务状态更新、元数据保存）必须串行化，
    不能在连接池连接持有期间使用其他连接写入。
    
    支持查询中断：使用 interruptible_connection 包装连接，支持取消操作。
    """
    import duckdb
    from core.duckdb_pool import get_connection_pool, interruptible_connection
    pool = get_connection_pool()
    
    # 用于存储查询结果的临时变量
    table_name = None
    row_count = 0
    columns = []
    metadata_snapshot = {}
    source_datasource_id = None
    datasource_type = ""
    query_success = False
    start_time = time.time()
    
    try:
        # 第一步：标记任务为运行中（独立事务）
        if not task_manager.start_task(task_id):
            logger.error(f"无法启动任务: {task_id}")
            return

        # 取消检查点 1
        if task_manager.is_cancellation_requested(task_id):
            logger.info(f"任务在启动后被取消: {task_id}")
            task_manager.mark_cancelled(task_id, "用户取消（启动前）")
            return

        logger.info(f"开始执行异步查询任务: {task_id}")

        # 智能移除系统自动添加的LIMIT
        from routers.query import remove_auto_added_limit
        clean_sql = remove_auto_added_limit(sql)
        if clean_sql != sql.strip():
            logger.info(f"异步任务移除了系统自动添加的LIMIT: {sql} -> {clean_sql}")
        else:
            logger.info(f"异步任务使用原始SQL: {clean_sql}")

        datasource_info = datasource if isinstance(datasource, dict) else None
        datasource_type = (
            (datasource_info.get("type") or "").lower()
            if datasource_info
            else ""
        )
        use_external_source = datasource_type in SUPPORTED_EXTERNAL_TYPES
        source_datasource_id = datasource_info.get("id") if datasource_info else None

        # 确定表名
        if custom_table_name:
            safe_table_name = custom_table_name.replace(" ", "_").replace("-", "_")
            import re
            safe_table_name = re.sub(r"[^a-zA-Z0-9_]", "", safe_table_name)
            table_name = safe_table_name
        else:
            table_name = task_utils.task_id_to_table_name(task_id)
        logger.info(f"[{task_id}] 创建持久表存储查询结果: {table_name}")
        logger.debug(f"[{task_id}] 准备执行 SQL: {clean_sql[:200]}...")

        # 第二步：执行查询（使用可中断连接）
        with interruptible_connection(task_id, clean_sql) as con:
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
                create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({clean_sql})'
                logger.debug(f"[{task_id}] 开始执行 CREATE TABLE AS SELECT...")
                con.execute(create_sql)
                logger.info(f"[{task_id}] 持久表创建成功: {table_name}")

            # 获取元数据（在同一连接中）
            metadata_snapshot = build_table_metadata_snapshot(con, table_name)
            row_count = metadata_snapshot.get("row_count", 0)
            logger.info(f"查询结果行数: {row_count}")

            columns_sql = f'DESCRIBE "{table_name}"'
            columns_info = con.execute(columns_sql).fetchall()
            columns = [{"name": col[0], "type": col[1]} for col in columns_info]
            logger.info(f"[{task_id}] 查询结果列数: {len(columns)}")
            
            logger.debug(f"[{task_id}] 资源释放检查点 - 即将释放连接")

            # 内存清理
            try:
                # 显式触发GC回收内存
                import gc
                gc.collect()
                logger.info("内存清理完成")
            except Exception as cleanup_error:
                logger.warning(f"内存清理失败: {str(cleanup_error)}")

            query_success = True
        # 连接池连接在这里释放

        # 取消检查点 2: 查询完成后检查
        if task_manager.is_cancellation_requested(task_id):
            logger.info(f"任务在查询完成后被取消: {task_id}, 清理已创建的表")
            # 使用新连接清理表
            with pool.get_connection() as con:
                try:
                    con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                    logger.info(f"已清理取消任务的表: {table_name}")
                except Exception as drop_error:
                    logger.warning(f"清理表失败: {drop_error}")
            task_manager.mark_cancelled(task_id, "用户取消（查询完成后）")
            return

        # 第三步：保存元数据（连接池连接已释放，可以安全使用其他连接）
        logger.info(f"[ASYNC_DEBUG] [{task_id}] 步骤3: 保存元数据")
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

        try:
            file_datasource_manager.save_file_datasource(table_metadata)
            logger.info(f"表元数据保存成功: {source_id}")
        except Exception as meta_error:
            logger.warning(f"保存表元数据失败（非致命）: {str(meta_error)}")

        # 第四步：更新任务状态为完成（独立事务）
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

        if custom_table_name:
            task_info["custom_table_name"] = custom_table_name
            task_info["display_name"] = custom_table_name

        complete_result = task_manager.complete_task(task_id, task_info)
        logger.info(f"[{task_id}] complete_task 返回结果: {complete_result}")
        if not complete_result:
            # 检查当前状态，防止覆盖已取消或已完成的状态
            current_task = task_manager.get_task(task_id)
            current_status = current_task.status.value if current_task else "None"
            
            # 使用字符串值进行比较，避免Enum身份问题
            if current_status in ("cancelling", "cancelled", "failed", "success", "completed"):
                logger.info(f"[{task_id}] 任务最终状态为 {current_status}，无需强制标记失败")
            else:
                logger.warning(f"[{task_id}] complete_task 失败且状态异常(status={current_status})，执行 force_fail_task")
                # 使用 force_fail_task 确保任务状态被更新
                task_manager.force_fail_task(
                    task_id, 
                    f"任务执行完成但状态更新失败(Last status: {current_status})，请检查结果表",
                    {"actual_result": task_info}
                )
                logger.error(f"[{task_id}] 无法标记任务为成功，已强制标记为失败")

        execution_time = time.time() - start_time
        logger.info(
            f"异步查询任务执行完成: {task_id}, 执行时间: {execution_time:.2f}秒"
        )

    except duckdb.InterruptException:
        # 查询被中断（用户取消）
        logger.info(f"任务 {task_id} 的查询被中断")
        
        # 清理可能已创建的表
        if table_name:
            try:
                with pool.get_connection() as con:
                    con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                    logger.info(f"已清理被中断任务的表: {table_name}")
            except Exception as drop_error:
                logger.warning(f"清理表失败: {drop_error}")
        
        # 标记为取消状态
        task_manager.mark_cancelled(task_id, "查询被用户中断")

    except Exception as e:
        logger.error(f"执行异步查询任务失败: {task_id}, 错误: {str(e)}")
        logger.error(traceback.format_exc())

        # 检查是否因取消而异常
        if task_manager.is_cancellation_requested(task_id):
            task_manager.mark_cancelled(task_id, "用户取消")
        else:
            if not task_manager.fail_task(task_id, str(e)):
                logger.error(f"无法标记任务为失败: {task_id}")


def execute_async_federated_query(
    task_id: str,
    sql: str,
    custom_table_name: Optional[str] = None,
    task_type: str = "query",
    datasource: Optional[Dict[str, Any]] = None,
    attach_databases: Optional[List[Dict[str, str]]] = None,
):
    """
    执行异步联邦查询（后台任务）
    
    支持跨数据库查询，通过 ATTACH 外部数据库实现联邦查询。
    
    关键设计：
    1. 所有 ATTACH/DETACH 操作必须在同一连接上下文中完成
    2. 无论成功或失败，都必须执行 DETACH 清理
    3. 支持任务取消检查点
    
    Args:
        task_id: 任务ID
        sql: SQL 查询语句
        custom_table_name: 自定义结果表名
        task_type: 任务类型
        datasource: 数据源信息（联邦查询时通常为 None）
        attach_databases: 需要 ATTACH 的外部数据库列表
    """
    import duckdb
    from core.duckdb_pool import get_connection_pool, interruptible_connection
    pool = get_connection_pool()
    
    # 用于存储查询结果的临时变量
    table_name = None
    row_count = 0
    columns = []
    metadata_snapshot = {}
    attached_aliases = []
    start_time = time.time()
    
    try:
        # 第一步：标记任务为运行中
        if not task_manager.start_task(task_id):
            logger.error(f"无法启动联邦查询任务: {task_id}")
            return

        # 取消检查点 1
        if task_manager.is_cancellation_requested(task_id):
            logger.info(f"联邦查询任务在启动后被取消: {task_id}")
            task_manager.mark_cancelled(task_id, "用户取消（启动前）")
            return

        logger.info(f"开始执行异步联邦查询任务: {task_id}")
        logger.info(f"需要 ATTACH 的数据库: {attach_databases}")

        # 智能移除系统自动添加的LIMIT
        from routers.query import remove_auto_added_limit
        clean_sql = remove_auto_added_limit(sql)
        if clean_sql != sql.strip():
            logger.info(f"联邦查询移除了系统自动添加的LIMIT: {sql} -> {clean_sql}")
        else:
            logger.info(f"联邦查询使用原始SQL: {clean_sql}")

        # 确定表名
        if custom_table_name:
            safe_table_name = custom_table_name.replace(" ", "_").replace("-", "_")
            import re
            safe_table_name = re.sub(r"[^a-zA-Z0-9_]", "", safe_table_name)
            table_name = safe_table_name
        else:
            table_name = task_utils.task_id_to_table_name(task_id)
        logger.info(f"联邦查询结果将存储到表: {table_name}")

        # 第二步：在同一连接中执行 ATTACH、查询、DETACH
        with interruptible_connection(task_id, clean_sql) as con:
            try:
                # 2.1 执行 ATTACH 操作
                if attach_databases:
                    attached_aliases = _attach_external_databases(con, attach_databases)
                    logger.info(f"成功 ATTACH {len(attached_aliases)} 个数据库: {attached_aliases}")

                # 取消检查点 2: ATTACH 完成后检查
                if task_manager.is_cancellation_requested(task_id):
                    logger.info(f"联邦查询任务在 ATTACH 后被取消: {task_id}")
                    _detach_databases(con, attached_aliases)
                    task_manager.mark_cancelled(task_id, "用户取消（ATTACH后）")
                    return

                # 2.2 执行查询并保存结果
                create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({clean_sql})'
                logger.info(f"执行联邦查询: {create_sql[:200]}...")
                con.execute(create_sql)
                logger.info(f"联邦查询结果表创建成功: {table_name}")

                # 2.3 获取元数据（在同一连接中）
                metadata_snapshot = build_table_metadata_snapshot(con, table_name)
                row_count = metadata_snapshot.get("row_count", 0)
                logger.info(f"联邦查询结果行数: {row_count}")

                columns_sql = f'DESCRIBE "{table_name}"'
                columns_info = con.execute(columns_sql).fetchall()
                columns = [{"name": col[0], "type": col[1]} for col in columns_info]
                logger.info(f"联邦查询结果列数: {len(columns)}")

                # 内存清理
                try:
                    # 显式触发GC回收内存
                    import gc
                    gc.collect()
                    logger.info("内存清理完成")
                except Exception as cleanup_error:
                    logger.warning(f"内存清理失败: {str(cleanup_error)}")

            finally:
                # 2.4 DETACH 清理（无论成功或失败都要执行）
                if attached_aliases:
                    logger.info(f"开始 DETACH 清理: {attached_aliases}")
                    _detach_databases(con, attached_aliases)

        # 连接池连接在这里释放

        # 取消检查点 3: 查询完成后检查
        if task_manager.is_cancellation_requested(task_id):
            logger.info(f"联邦查询任务在查询完成后被取消: {task_id}, 清理已创建的表")
            with pool.get_connection() as con:
                try:
                    con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                    logger.info(f"已清理取消任务的表: {table_name}")
                except Exception as drop_error:
                    logger.warning(f"清理表失败: {drop_error}")
            task_manager.mark_cancelled(task_id, "用户取消（查询完成后）")
            return

        # 第三步：保存元数据
        source_id = table_name
        table_metadata = {
            "source_id": source_id,
            "filename": f"federated_query_{task_id}",
            "file_path": f"duckdb://{table_name}",
            "file_type": "duckdb_federated_query",
            "created_at": get_current_time_iso(),
            "source_sql": sql,
            "schema_version": 2,
            "is_federated": True,
            "attached_databases": attached_aliases,
            **metadata_snapshot,
        }

        try:
            file_datasource_manager.save_file_datasource(table_metadata)
            logger.info(f"联邦查询表元数据保存成功: {source_id}")
        except Exception as meta_error:
            logger.warning(f"保存表元数据失败（非致命）: {str(meta_error)}")

        # 第四步：更新任务状态为完成
        task_info = {
            "status": "completed",
            "table_name": table_name,
            "row_count": row_count,
            "columns": columns,
            "file_generated": False,
            "task_type": task_type,
            "is_federated": True,
            "attached_databases": attached_aliases,
        }

        if custom_table_name:
            task_info["custom_table_name"] = custom_table_name
            task_info["display_name"] = custom_table_name

        logger.info(f"[{task_id}] (联邦) 开始调用 complete_task 更新状态")
        complete_result = task_manager.complete_task(task_id, task_info)
        logger.info(f"[{task_id}] (联邦) complete_task 返回结果: {complete_result}")
        if not complete_result:
            # 检查当前状态，防止覆盖已取消或已完成的状态
            current_task = task_manager.get_task(task_id)
            current_status = current_task.status.value if current_task else "None"
            
            # 使用字符串值进行比较，避免Enum身份问题
            if current_status in ("cancelling", "cancelled", "failed", "success", "completed"):
                logger.info(f"[{task_id}] (联邦) 任务最终状态为 {current_status}，无需强制标记失败")
            else:
                logger.warning(f"[{task_id}] (联邦) complete_task 失败且状态异常(status={current_status})，执行 force_fail_task")
                # 使用 force_fail_task 确保任务状态被更新
                task_manager.force_fail_task(
                    task_id, 
                    f"联邦查询执行完成但状态更新失败(Last status: {current_status})，请检查结果表",
                    {"actual_result": task_info}
                )
                logger.error(f"[{task_id}] (联邦) 无法标记任务为成功，已强制标记为失败")

        execution_time = time.time() - start_time
        logger.info(
            f"异步联邦查询任务执行完成: {task_id}, 执行时间: {execution_time:.2f}秒, "
            f"附加数据库: {attached_aliases}"
        )

    except duckdb.InterruptException:
        # 查询被中断（用户取消）
        logger.info(f"联邦查询任务 {task_id} 被中断")
        
        # 清理可能已创建的表
        if table_name:
            try:
                with pool.get_connection() as con:
                    con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                    logger.info(f"已清理被中断联邦查询的表: {table_name}")
            except Exception as drop_error:
                logger.warning(f"清理表失败: {drop_error}")
        
        # 标记为取消状态
        task_manager.mark_cancelled(task_id, "联邦查询被用户中断")

    except Exception as e:
        logger.error(f"执行异步联邦查询任务失败: {task_id}, 错误: {str(e)}")
        logger.error(traceback.format_exc())

        # 检查是否因取消而异常
        if task_manager.is_cancellation_requested(task_id):
            task_manager.mark_cancelled(task_id, "用户取消")
        else:
            # 根据错误类型分类错误代码
            error_message = str(e)
            error_str = str(e).lower()
            if "不存在" in error_message or "not found" in error_str:
                error_code = "CONNECTION_NOT_FOUND"
            elif "不支持" in error_message or "unsupported" in error_str:
                error_code = "UNSUPPORTED_TYPE"
            elif "attach" in error_str:
                error_code = "ATTACH_FAILED"
            elif "timeout" in error_str or "超时" in error_message:
                error_code = "TIMEOUT"
            elif "authentication" in error_str or "认证" in error_message or "密码" in error_message:
                error_code = "AUTH_FAILED"
            else:
                error_code = "FEDERATED_QUERY_FAILED"
            
            # 使用 force_fail_task 保存详细错误信息到元数据
            error_metadata = {
                "error_code": error_code,
                "is_federated": True,
                "attached_databases": attached_aliases,
            }
            
            if not task_manager.force_fail_task(task_id, error_message, metadata_update=error_metadata):
                logger.error(f"无法标记联邦查询任务为失败: {task_id}")


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
