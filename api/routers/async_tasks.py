"""
异步任务API路由
提供异步任务的创建、查询和管理功能
"""

# pylint: disable=unreachable,broad-exception-raised,duplicate-code
import asyncio
import json
import logging
import os
import re
import shutil
import time
import traceback
from datetime import datetime
from typing import Any, Dict, List, Optional

from core.common.config_manager import config_manager
from core.common.timezone_utils import get_current_time, get_current_time_iso
from core.data.file_datasource_manager import (
    build_table_metadata_snapshot,
    create_table_from_dataframe,
    file_datasource_manager,
)
from core.services.task_manager import TaskStatus, task_manager
from fastapi import APIRouter, BackgroundTasks, Body
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from core.common.exceptions import (
    BaseAPIException,
    ResourceNotFoundError,
    ValidationError as APIValidationError,
)
from utils.response_helpers import (
    MessageCode,
    create_error_response,
    create_list_response,
    create_success_response,
    error_json_response,
)
from utils.local_export import desktop_local_export_enabled, validate_local_target_path
from utils.safe_filename import safe_filename_base

# 配置日志
logger = logging.getLogger(__name__)
from core.common.validators import validate_pagination
from core.services.task_utils import TaskUtils
from core.common.connection_alias import resolve_attach_databases_for_async
from models.query_models import AttachDatabase, DatabaseConnection, DataSourceType

router = APIRouter()

# 使用统一配置管理获取导出目录
EXPORTS_DIR = str(config_manager.get_exports_dir())

# 初始化任务工具类
task_utils = TaskUtils(EXPORTS_DIR)

SUPPORTED_EXTERNAL_TYPES = {"mysql", "postgresql", "sqlite", "duckdb"}

# 本地导出仅支持 DuckDB COPY 的这两种格式(excel 需转换、不走此路径)。
# 单一来源,避免同文件两处各写一份字面量。
LOCAL_EXPORT_FORMATS = ("csv", "parquet")


def validate_attach_databases(attach_databases: Optional[List[AttachDatabase]]) -> None:
    """
    验证 attach_databases 参数

    Args:
        attach_databases: 需要 ATTACH 的外部数据库列表

    Raises:
        APIValidationError: 当验证失败时

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
            raise APIValidationError(
                "Database alias cannot be empty",
                details={"field": "attach_databases.alias"},
            )

        # 验证 connection_id 不为空
        if not db.connection_id or not db.connection_id.strip():
            raise APIValidationError(
                "Connection ID cannot be empty",
                details={"field": "attach_databases.connection_id"},
            )

        # 验证别名不重复
        alias = db.alias.strip()
        if alias in aliases:
            raise APIValidationError(
                f"Duplicate database alias: {alias}",
                details={"field": "attach_databases.alias", "alias": alias},
            )
        aliases.add(alias)


def _attach_external_databases(
    con, attach_databases: List[Dict[str, str]]
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

    from core.database.database_manager import db_manager
    from core.database.duckdb_engine import build_attach_sql
    from core.common.exceptions import DatabaseConnectionError
    from core.database.federated_attach import (
        _is_database_already_attached_error,
        _quote_identifier,
        redact_connection_secrets,
    )
    from core.security.encryption import password_encryptor

    attached = []

    # 验证 alias 格式（防止 SQL 注入）
    SAFE_ALIAS_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

    try:
        for db in attach_databases:
            alias = db["alias"]
            connection_id = db["connection_id"]

            # 验证 alias 格式安全性
            if not SAFE_ALIAS_PATTERN.match(alias):
                raise ValueError(f"Invalid database alias format: {alias}")

            # 获取连接配置
            connection = db_manager.get_connection(connection_id)
            if not connection:
                raise ValueError(
                    f"Database connection '{connection_id}' does not exist"
                )

            # 验证数据库类型
            db_type = (
                connection.type.value
                if hasattr(connection.type, "value")
                else str(connection.type)
            )
            if db_type.lower() not in SUPPORTED_EXTERNAL_TYPES:
                raise ValueError(f"Unsupported data source type: {db_type}")

            # 构建配置
            db_config = connection.params.copy()
            db_config["type"] = db_type

            # 解密密码（不记录敏感信息）
            password = db_config.get("password", "")
            if password and password_encryptor.is_encrypted(password):
                db_config["password"] = password_encryptor.decrypt_password(password)
                logger.debug(f"Connection {connection_id} password processed")

            try:
                con.execute(f'DETACH {_quote_identifier(alias)}')
            except Exception:
                pass

            attach_sql = build_attach_sql(alias, db_config)
            logger.info(f"Executing ATTACH: {alias} (connection_id: {connection_id})")
            try:
                con.execute(attach_sql)
            except Exception as attach_error:
                if _is_database_already_attached_error(attach_error):
                    logger.warning(
                        "Database %s still attached after pre-DETACH, reusing",
                        alias,
                    )
                else:
                    # 在错误离开 ATTACH 现场之前脱敏并切断 __cause__ 链，避免连接串里的
                    # 明文口令随原始异常流向日志/任务元数据/MCP 调用方（回归 #19）
                    safe_error = redact_connection_secrets(attach_error)
                    raise DatabaseConnectionError(
                        f"Failed to connect to external database '{alias}': {safe_error}"
                    ) from None
            attached.append(alias)
            logger.info(f"Successfully ATTACH database: {alias}")

    except Exception as e:
        # 回滚已附加的数据库
        logger.error(f"ATTACH failed, rolling back attached databases: {attached}")
        _detach_databases(con, attached)
        raise

    return attached


def _detach_databases(con, aliases: List[str]) -> None:
    """
    逐个执行 DETACH，某个失败时不中断，继续处理其余的

    Args:
        con: DuckDB 连接
        aliases: 需要 DETACH 的数据库别名列表

    Note:
        alias 已在 _attach_external_databases 中验证过格式安全性
    """
    import re

    SAFE_ALIAS_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

    for alias in aliases:
        try:
            # 二次验证 alias 格式（防御性编程）
            if not SAFE_ALIAS_PATTERN.match(alias):
                logger.warning(f"Skipping DETACH with invalid alias format: {alias}")
                continue
            # 使用引号包裹 alias 防止 SQL 注入
            con.execute(f'DETACH "{alias}"')
            logger.info(f"Successfully DETACH database: {alias}")
        except Exception as e:
            logger.warning(f"DETACH failed: {e}")


class AsyncQueryRequest(BaseModel):
    """异步查询请求模型"""

    sql: str
    custom_table_name: Optional[str] = None  # 自定义表名（可选）
    task_type: str = "query"  # 任务类型：query, save_to_table, export
    datasource: Optional[Dict[str, Any]] = None
    # 联邦查询支持：需要 ATTACH 的外部数据库列表
    attach_databases: Optional[List[AttachDatabase]] = None
    # 自定义表名撞已有表时是否允许覆盖；默认 False，避免静默 CREATE OR REPLACE 毁数据
    overwrite: bool = False


class AsyncQueryResponse(BaseModel):
    """异步查询响应模型"""

    success: bool
    task_id: str
    message: str


class TaskListResponse(BaseModel):
    """任务列表响应模型（支持分页）- 标准格式"""

    success: bool
    data: dict  # 包含 items, total, page, pageSize
    messageCode: str
    message: str
    timestamp: str


class TaskDetailResponse(BaseModel):
    """任务详情响应模型 - 标准格式"""

    success: bool
    data: dict  # 包含 task
    messageCode: str
    message: str
    timestamp: str


class CancelTaskRequest(BaseModel):
    """手动取消任务请求"""

    reason: Optional[str] = "用户手动取消"


class RetryTaskRequest(BaseModel):
    """重试任务请求，可选覆盖部分配置"""

    override_sql: Optional[str] = None
    custom_table_name: Optional[str] = None
    datasource_override: Optional[Dict[str, Any]] = None


@router.post("/api/async-tasks", tags=["Async Tasks"])
def submit_async_query(
    request: AsyncQueryRequest, background_tasks: BackgroundTasks
):
    """
    提交异步查询任务

    支持联邦查询：通过 attach_databases 参数指定需要 ATTACH 的外部数据库
    """
    try:
        if not request.sql.strip():
            raise APIValidationError(
                "SQL query cannot be empty",
                details={"field": "sql"},
            )

        attach_list, is_federated = resolve_attach_databases_for_async(
            request.attach_databases, request.datasource
        )
        if attach_list:
            validate_attach_databases(
                [
                    AttachDatabase(alias=item["alias"], connection_id=item["connection_id"])
                    for item in attach_list
                ]
            )

        # 创建任务，将信息存储在任务查询中
        task_query = {
            "sql": request.sql,
            "custom_table_name": request.custom_table_name,
            "task_type": request.task_type,
            "datasource": request.datasource,
            "attach_databases": attach_list if attach_list else None,
            "is_federated": is_federated,
            "overwrite": request.overwrite,
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
            # 联邦查询：ATTACH + DuckDB SQL（含从 datasource 自动推导的 attach）
            background_tasks.add_task(
                execute_async_federated_query,
                task_id,
                request.sql,
                request.custom_table_name,
                request.task_type,
                request.datasource,
                attach_list,
                request.overwrite,
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
                request.overwrite,
            )

        return create_success_response(
            data={"task_id": task_id},
            message_code=MessageCode.TASK_SUBMITTED,
        )

    except BaseAPIException:
        raise
    except Exception as e:
        logger.error(f"Failed to submit async query task: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to submit task: {str(e)}",
        )


@router.get("/api/async-tasks", tags=["Async Tasks"])
def list_async_tasks(
    limit: int = 20, offset: int = 0, order_by: str = "created_at"
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
        return create_list_response(
            items=tasks,
            total=total,
            message_code=MessageCode.TASKS_RETRIEVED,
            page=offset // limit + 1 if limit > 0 else 1,
            page_size=limit,
        )
    except Exception as e:
        logger.error(f"Failed to get async task list: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to get task list: {str(e)}",
        )


@router.get(
    "/api/async-tasks/{task_id}",
    tags=["Async Tasks"],
)
def get_async_task(task_id: str):
    """
    获取单个异步任务详情
    """
    try:
        task = task_manager.get_task(task_id)
        if not task:
            raise ResourceNotFoundError("Task", task_id)

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

        return create_success_response(
            data={"task": task_dict},
            message_code=MessageCode.TASK_RETRIEVED,
        )
    except BaseAPIException:
        raise
    except Exception as e:
        logger.error(f"Failed to get async task detail: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to fetch task detail: {str(e)}",
            details={"task_id": task_id},
        )


@router.post(
    "/api/async-tasks/{task_id}/cancel",
    tags=["Async Tasks"],
)
def cancel_async_task(task_id: str, request: CancelTaskRequest):
    """
    请求取消异步任务（使用取消信号模式，避免写-写冲突）
    """
    try:
        reason = (request.reason or "User cancelled manually").strip()
        # 使用 request_cancellation 设置取消标志，由后台任务检测并自行终止
        success = task_manager.request_cancellation(task_id, reason)
        if not success:
            # 检查任务是否存在
            task = task_manager.get_task(task_id)
            if not task:
                raise ResourceNotFoundError("Task", task_id)
            # 任务存在但状态不允许取消（已完成或已失败）
            raise BaseAPIException(
                message=(
                    f"Task status does not allow cancellation. "
                    f"Current status: {task.status.value}"
                ),
                status_code=400,
                error_code=MessageCode.TASK_CANCEL_NOT_ALLOWED.value,
                details={"task_id": task_id, "status": task.status.value},
            )
        return create_success_response(
            data={"task_id": task_id},
            message_code=MessageCode.TASK_CANCELLED,
            message="Cancellation request submitted",
        )
    except BaseAPIException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel task {task_id}: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to cancel task: {str(e)}",
            details={"task_id": task_id},
        )


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
                        payload.setdefault(
                            "custom_table_name", guess.get("custom_table_name")
                        )
                        payload.setdefault("datasource", guess.get("datasource"))
                        # 提取联邦查询配置
                        payload.setdefault(
                            "attach_databases", guess.get("attach_databases")
                        )
                        payload.setdefault(
                            "is_federated", guess.get("is_federated", False)
                        )
                except Exception:
                    pass
            else:
                payload.setdefault("sql", raw_sql)
    payload.setdefault("task_type", getattr(task, "task_type", None) or "query")
    return payload


@router.post(
    "/api/async-tasks/{task_id}/retry",
    tags=["Async Tasks"],
)
def retry_async_task(
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
            raise ResourceNotFoundError("Task", task_id)

        payload = _extract_task_payload(task)
        logger.info(f"Retrying task {task_id}, extracted payload: {payload}")

        sql = (request.override_sql or payload.get("sql") or "").strip()
        if not sql:
            raise APIValidationError(
                "Original task missing SQL, cannot retry",
                details={"task_id": task_id, "field": "sql"},
            )

        task_type = payload.get("task_type", "query")
        datasource = request.datasource_override or payload.get("datasource")
        custom_table_name = request.custom_table_name or payload.get(
            "custom_table_name"
        )

        attach_list, is_federated = resolve_attach_databases_for_async(
            payload.get("attach_databases"), datasource
        )
        if attach_list:
            validate_attach_databases(
                [
                    AttachDatabase(alias=item["alias"], connection_id=item["connection_id"])
                    for item in attach_list
                ]
            )

        retry_metadata = dict(payload)
        retry_metadata.update(
            {
                "sql": sql,
                "task_type": task_type,
                "custom_table_name": custom_table_name,
                "datasource": datasource,
                "attach_databases": attach_list if attach_list else None,
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
        # 重试是用户显式"重做"，允许覆盖上一次的同名结果表（overwrite=True）
        if is_federated:
            background_tasks.add_task(
                execute_async_federated_query,
                new_task_id,
                sql,
                custom_table_name,
                task_type,
                datasource,
                attach_list,
                overwrite=True,
            )
        else:
            background_tasks.add_task(
                execute_async_query,
                new_task_id,
                sql,
                custom_table_name,
                task_type,
                datasource,
                overwrite=True,
            )

        # 注意：移除了 update_task 调用，避免写写冲突
        # 重试关系已通过 retry_metadata["retry_of"] 记录在新任务中

        return create_success_response(
            data={"task_id": new_task_id},
            message_code=MessageCode.TASK_RETRY_SUCCESS,
            message="Task has been resubmitted",
        )
    except BaseAPIException:
        raise
    except Exception as e:
        logger.error(f"Failed to retry task {task_id}: {str(e)}")
        logger.error(traceback.format_exc())
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to retry task: {str(e)}",
            details={"task_id": task_id},
        )


@router.post("/api/async-tasks/cleanup-stuck", tags=["Async Tasks"])
def cleanup_stuck_tasks():
    """
    清理卡住的取消中任务
    将所有 cancelling 状态的任务标记为 failed
    """
    try:
        count = task_manager.cleanup_stuck_cancelling_tasks()
        return create_success_response(
            data={"cleaned_count": count},
            message_code=MessageCode.TASK_CLEANUP_SUCCESS,
        )
    except Exception as e:
        logger.error(f"Failed to clean stuck tasks: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Cleanup failed: {str(e)}",
        )


def _serve_task_download(task_id: str, fmt: str):
    """生成(或复用已缓存的)结果文件并以 FileResponse 流式返回。POST/GET 共用。

    FileResponse 是流式的:大文件(2 亿行 CSV 可达数 GB)也是边读边发、不占内存。
    前端务必用原生下载(openExternal 走系统浏览器/window.open)去命中它,不要用
    axios responseType:'blob' 把整个文件读进 webview 内存——那会把界面卡死。
    """
    try:
        if fmt not in LOCAL_EXPORT_FORMATS:
            raise APIValidationError(
                "Unsupported format, only csv and parquet are allowed",
                details={"field": "format", "allowed": list(LOCAL_EXPORT_FORMATS)},
            )

        file_path = generate_download_file(task_id, fmt)
        if not os.path.exists(file_path):
            raise ResourceNotFoundError("Generated file", task_id)

        # 友好下载名:优先用任务结果表名(如 big_test_200m.csv),回退到 task_id,
        # 而不是磁盘上的 task-<uuid>_<时间>.csv——让用户在浏览器下载里一眼认出。
        table_name = None
        try:
            info = task_manager.get_task(task_id)
            if info and info.result_info:
                table_name = info.result_info.get("table_name")
        except Exception:  # pylint: disable=broad-exception-caught
            table_name = None
        base = safe_filename_base(table_name) or safe_filename_base(task_id) or "result"
        return FileResponse(
            file_path,
            media_type=task_utils.get_media_type(file_path),
            filename=f"{base}.{fmt}",
        )
    except BaseAPIException:
        raise
    except ValueError as e:
        logger.warning(f"Failed to generate download file: {task_id}, error: {str(e)}")
        return error_json_response(
            400, MessageCode.VALIDATION_ERROR, str(e), details={"task_id": task_id}
        )
    except Exception as e:  # pylint: disable=broad-exception-caught
        logger.error(f"Failed to generate download file: {task_id}, error: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to generate download file: {str(e)}",
            details={"task_id": task_id},
        )


@router.get("/api/async-tasks/{task_id}/download", tags=["Async Tasks"])
def download_task_result(task_id: str, format: str = "csv"):
    """GET 下载入口:供前端原生下载(openExternal/window.open)命中,流式落盘。

    大文件下载必须走这里 + 原生下载,避免前端用 blob 把整个文件读进内存卡死界面。
    """
    return _serve_task_download(task_id, format)


@router.post("/api/async-tasks/{task_id}/download", tags=["Async Tasks"])
def generate_and_download_file(task_id: str, request: dict = Body(...)):
    """按需生成并直接下载文件(保留 POST 兼容旧调用方)。"""
    return _serve_task_download(task_id, request.get("format", "csv"))


class ExportToPathRequest(BaseModel):
    """桌面直写导出请求:format + 原生存盘对话框选定的绝对路径。"""

    format: str = "csv"
    target_path: str


def _export_result_file_to_local_path(task_id: str, fmt: str, target_path: str) -> int:
    """把任务结果文件写到用户选定的本地绝对路径,返回写入字节数。

    校验失败抛 ValueError(英文,端点映射为 400)。全程恒定内存:未命中缓存时
    DuckDB 直接 COPY 到目标路径(单遍磁盘写);命中已有导出缓存时分块 copyfile
    秒回。相比经系统浏览器命中 GET 流式端点:免浏览器依赖(Windows explorer 曾
    对带 query 的 URL 静默失败)、数据不再过一遍 HTTP。覆盖语义:原生存盘对话框
    已向用户确认过覆盖,此处直接覆盖。
    """
    if fmt not in LOCAL_EXPORT_FORMATS:
        raise ValueError("Unsupported format, only csv and parquet are allowed")
    target = validate_local_target_path(target_path)

    source = generate_download_file(task_id, fmt, target_path=target)
    if os.path.normpath(str(source)) != target:
        # 命中已有缓存导出 → 分块拷贝到目标;直写场景 source 即 target,无需拷贝
        shutil.copyfile(source, target)
    return os.path.getsize(target)


@router.post("/api/async-tasks/{task_id}/export-to-path", tags=["Async Tasks"])
async def export_task_result_to_path(task_id: str, request: ExportToPathRequest):
    """桌面模式专用:后端直接把任务结果写到本机用户选定的路径。

    门控与导入方向(server_files.py 读本地任意路径)同一开关:
    ALLOW_ARBITRARY_LOCAL_PATHS=1(api/run.py 桌面 sidecar 设置)。Web/Docker
    部署不设该开关 → 一律 403,浏览器场景继续用 GET /download 流式端点落盘。
    写盘跑在线程池,不阻塞事件循环;大结果 COPY+拷贝可达数十秒,前端应禁用超时。
    """
    if not desktop_local_export_enabled():
        return error_json_response(
            403,
            MessageCode.FORBIDDEN,
            "Direct local export is only available in the desktop app; "
            "use GET /api/async-tasks/{task_id}/download instead",
            details={"task_id": task_id},
        )
    try:
        size = await asyncio.to_thread(
            _export_result_file_to_local_path, task_id, request.format, request.target_path
        )
        return create_success_response(
            data={"path": request.target_path, "size_bytes": size},
            message_code=MessageCode.OPERATION_SUCCESS,
        )
    except ValueError as e:
        return error_json_response(
            400, MessageCode.VALIDATION_ERROR, str(e), details={"task_id": task_id}
        )
    except Exception as e:  # pylint: disable=broad-exception-caught
        logger.error(f"Failed to export task result to local path: {task_id}, error: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to export result to local path: {str(e)}",
            details={"task_id": task_id},
        )


def _discard_persisted_result(task_id: str, table_name: Optional[str]) -> None:
    """撤销"结果表已建、complete_task 却因任务被并发取消/失败而拒绝"这个窗口里
    留下的副作用：删掉结果表 + 已注册的 file datasource 记录。

    取消检查点 2（查询完成后、保存元数据前）之后到 complete_task 之间仍有一段
    窗口——取消请求若恰好落在这里，complete_task 因状态已是 CANCELLING 而返回
    False，但此时表已建好、datasource 记录（save_file_datasource）也已写入。不
    清理的话，任务显示 cancelled，磁盘上却留着一张可查询的孤儿表和一条 datasource
    记录，没人知道该不该信任它（回归 #8）。

    只在 complete_task 被拒且任务非 success/completed 时调用——已提交为正式结果
    的表绝不会被本函数删除。表名与 datasource 的 source_id 相同，故只需一个入参。
    """
    if not table_name:
        return

    from core.database.duckdb_pool import get_connection_pool

    try:
        with get_connection_pool().get_connection() as con:
            con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
        logger.info("[%s] Dropped orphaned result table: %s", task_id, table_name)
    except Exception as drop_error:  # pylint: disable=broad-exception-caught
        logger.warning(
            "[%s] Failed to drop orphaned table %s: %s", task_id, table_name, drop_error
        )

    try:
        file_datasource_manager.delete_file_datasource(table_name)
    except Exception as del_error:  # pylint: disable=broad-exception-caught
        logger.warning(
            "[%s] Failed to delete orphaned datasource record %s: %s",
            task_id,
            table_name,
            del_error,
        )


def _resolve_result_table_name(custom_table_name: Optional[str], task_id: str):
    """把 custom_table_name 洗成裸标识符;洗完为空(如 "!!!")则回退到唯一的 task_id
    表名——绝不建空名表。返回 (table_name, is_custom)。

    async_tasks 的普通/联邦两个 worker 曾各写一份等价逻辑(且都无空名兜底),统一到此。
    """
    if custom_table_name:
        safe = re.sub(
            r"[^a-zA-Z0-9_]", "", custom_table_name.replace(" ", "_").replace("-", "_")
        )
        if safe:
            return safe, True
    return task_utils.task_id_to_table_name(task_id), False


def _raise_if_table_exists(con, table_name: str) -> None:
    """自定义结果表名撞上 main schema 已有表 → 抛错,阻止静默 CREATE OR REPLACE 覆盖。"""
    exists = con.execute(
        "SELECT 1 FROM duckdb_tables() WHERE table_name = ? AND schema_name = 'main' LIMIT 1",
        [table_name],
    ).fetchone()
    if exists:
        raise ValueError(
            f'Table "{table_name}" already exists; choose a different name or pass '
            "overwrite=true to replace it (refusing to overwrite data silently)"
        )


def execute_async_query(
    task_id: str,
    sql: str,
    custom_table_name: Optional[str] = None,
    task_type: str = "query",
    datasource: Optional[Dict[str, Any]] = None,
    overwrite: bool = False,
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
    from core.database.duckdb_pool import get_connection_pool, interruptible_connection

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
            logger.error(f"Unable to start task: {task_id}")
            return

        # 取消检查点 1
        if task_manager.is_cancellation_requested(task_id):
            logger.info(f"Task cancelled after start: {task_id}")
            task_manager.mark_cancelled(task_id, "User cancelled (before start)")
            return

        logger.info(f"Starting async query task: {task_id}")

        # 智能移除系统自动添加的LIMIT
        from routers.query_sql_utils import remove_auto_added_limit

        clean_sql = remove_auto_added_limit(sql)
        if clean_sql != sql.strip():
            logger.info(f"Async task removed auto-added LIMIT: {sql} -> {clean_sql}")
        else:
            logger.info(f"Async task using original SQL: {clean_sql}")

        datasource_info = datasource if isinstance(datasource, dict) else None
        datasource_type = (
            (datasource_info.get("type") or "").lower() if datasource_info else ""
        )
        use_external_source = datasource_type in SUPPORTED_EXTERNAL_TYPES
        source_datasource_id = datasource_info.get("id") if datasource_info else None

        # 确定表名（洗空则回退 task_id 名，不建空名表）
        table_name, is_custom = _resolve_result_table_name(custom_table_name, task_id)
        logger.info(f"[{task_id}] Creating persistent table to store query result: {table_name}")
        logger.debug(f"[{task_id}] Preparing to execute SQL: {clean_sql[:200]}...")

        # 第二步：执行查询（使用可中断连接）
        with interruptible_connection(task_id, clean_sql) as con:
            # 自定义名撞已有表且未显式允许覆盖 → 报错，绝不静默 CREATE OR REPLACE 毁用户表
            if is_custom and not overwrite:
                _raise_if_table_exists(con, table_name)
            if use_external_source:
                from core.common.connection_alias import build_attach_list_from_datasource

                attach_list = build_attach_list_from_datasource(datasource_info)
                if not attach_list:
                    raise ValueError(
                        "External datasource async task requires attach_databases or "
                        "a resolvable mysql/postgresql/sqlite datasource"
                    )
                logger.info(
                    "Async task using ATTACH for external datasource %s (%s), aliases=%s",
                    source_datasource_id,
                    datasource_type,
                    [a["alias"] for a in attach_list],
                )
                attached_aliases = _attach_external_databases(con, attach_list)
                try:
                    create_sql = (
                        f'CREATE OR REPLACE TABLE "{table_name}" AS ({clean_sql})'
                    )
                    con.execute(create_sql)
                    logger.info(
                        "External federated result written to DuckDB table: %s",
                        table_name,
                    )
                finally:
                    _detach_databases(con, attached_aliases)
            else:
                create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({clean_sql})'
                logger.debug(f"[{task_id}] Starting CREATE TABLE AS SELECT...")
                con.execute(create_sql)
                logger.info(f"[{task_id}] Persistent table created successfully: {table_name}")

            # 获取元数据（在同一连接中）
            metadata_snapshot = build_table_metadata_snapshot(con, table_name)
            row_count = metadata_snapshot.get("row_count", 0)
            logger.info(f"Query result row count: {row_count}")

            columns_sql = f'DESCRIBE "{table_name}"'
            columns_info = con.execute(columns_sql).fetchall()
            columns = [{"name": col[0], "type": col[1]} for col in columns_info]
            logger.info(f"[{task_id}] Query result column count: {len(columns)}")

            logger.debug(f"[{task_id}] Resource release checkpoint - about to release connection")

            # 内存清理
            try:
                # 显式触发GC回收内存
                import gc

                gc.collect()
                logger.info("Memory cleanup completed")
            except Exception as cleanup_error:
                logger.warning(f"Memory cleanup failed: {str(cleanup_error)}")

            query_success = True
        # 连接池连接在这里释放

        # 取消检查点 2: 查询完成后检查
        if task_manager.is_cancellation_requested(task_id):
            logger.info(f"Task was cancelled after query completion: {task_id}, cleaning created table")
            # 使用新连接清理表
            with pool.get_connection() as con:
                try:
                    con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                    logger.info(f"Cleaned table for cancelled task: {table_name}")
                except Exception as drop_error:
                    logger.warning(f"Failed to clean table: {drop_error}")
            task_manager.mark_cancelled(task_id, "User cancelled after query completion")
            return

        # 第三步：保存元数据（连接池连接已释放，可以安全使用其他连接）
        logger.info(f"[ASYNC_DEBUG] [{task_id}] Step 3: Saving metadata")
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
            logger.info(f"Table metadata saved successfully: {source_id}")
        except Exception as meta_error:
            logger.warning(f"Failed to save table metadata (non-fatal): {str(meta_error)}")

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
        logger.info(f"[{task_id}] complete_task return result: {complete_result}")
        if not complete_result:
            # 检查当前状态，防止覆盖已取消或已完成的状态
            current_task = task_manager.get_task(task_id)
            current_status = current_task.status.value if current_task else "None"

            # 使用字符串值进行比较，避免Enum身份问题
            if current_status in ("cancelling", "cancelled", "failed"):
                # 任务被并发取消/失败，complete_task 因此被拒——本线程刚建好的表和
                # datasource 记录都不是任务的正式结果，撤销它们（回归 #8：此前只记
                # 日志，孤儿表和记录会残留）。与取消检查点 2 的清理动作保持一致。
                logger.info(
                    f"[{task_id}] complete_task rejected (status={current_status}); "
                    f"discarding orphaned result table and datasource"
                )
                _discard_persisted_result(task_id, table_name)
                if current_status == "cancelling":
                    task_manager.mark_cancelled(task_id, "User cancelled during result persistence")
            elif current_status in ("success", "completed"):
                logger.info(
                    f"[{task_id}] Task already final ({current_status}); keeping result table"
                )
            else:
                logger.warning(
                    f"[{task_id}] complete_task failed with abnormal status, executing force_fail_task"
                )
                # 使用 force_fail_task 确保任务状态被更新
                task_manager.force_fail_task(
                    task_id,
                    f"Task execution completed but status update failed, please check result table",
                    {"actual_result": task_info},
                )
                logger.error(f"[{task_id}] Unable to mark task as successful, force marked as failed")

        execution_time = time.time() - start_time
        logger.info(
            f"Async query task completed: {task_id}, elapsed time: {execution_time:.2f}s"
        )

    except duckdb.InterruptException:
        # 查询被中断（用户取消）
        logger.info(f"Task {task_id} query interrupted")

        # 清理可能已创建的表
        if table_name:
            try:
                with pool.get_connection() as con:
                    con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                    logger.info(f"Cleaned table for interrupted task: {table_name}")
            except Exception as drop_error:
                logger.warning(f"Failed to clean table: {drop_error}")

        # 标记为取消状态
        task_manager.mark_cancelled(task_id, "Query interrupted by user")

    except Exception as e:
        logger.error(f"Async query task failed: {task_id}, error: {str(e)}")
        logger.error(traceback.format_exc())

        # 检查是否因取消而异常
        if task_manager.is_cancellation_requested(task_id):
            task_manager.mark_cancelled(task_id, "Cancelled by user")
        else:
            if not task_manager.fail_task(task_id, str(e)):
                # fail_task 仅在 status IN (QUEUED, RUNNING) 时生效。若在上面的
                # is_cancellation_requested 检查(返回 False)之后、这次 UPDATE 之前,
                # 并发取消把状态推到了 CANCELLING,fail_task 守卫落空、只记日志会让
                # 任务卡在 CANCELLING 直到 60s 看门狗回收。重新判定一次:确已进入取消
                # 流程就推进到终态 CANCELLED(mark_cancelled 覆盖 CANCELLING);否则
                # (已是 COMPLETED/FAILED 等终态)保持只记日志,不覆盖既有终态。
                if task_manager.is_cancellation_requested(task_id):
                    task_manager.mark_cancelled(task_id, "Cancelled by user")
                else:
                    logger.error(f"Unable to mark task as failed: {task_id}")


def execute_async_federated_query(
    task_id: str,
    sql: str,
    custom_table_name: Optional[str] = None,
    task_type: str = "query",
    datasource: Optional[Dict[str, Any]] = None,
    attach_databases: Optional[List[Dict[str, str]]] = None,
    overwrite: bool = False,
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
    from core.database.duckdb_pool import get_connection_pool, interruptible_connection

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
            logger.error(f"Unable to start federated query task: {task_id}")
            return

        # 取消检查点 1
        if task_manager.is_cancellation_requested(task_id):
            logger.info(f"Federated query task cancelled after start: {task_id}")
            task_manager.mark_cancelled(task_id, "User cancelled (before start)")
            return

        logger.info(f"Starting async federated query task: {task_id}")
        logger.info(f"Databases to ATTACH: {attach_databases}")

        # 智能移除系统自动添加的LIMIT
        from routers.query_sql_utils import remove_auto_added_limit

        from core.common.sql_mysql_quotes import (
            normalize_mysql_double_quoted_strings_for_duckdb,
        )

        clean_sql = normalize_mysql_double_quoted_strings_for_duckdb(
            remove_auto_added_limit(sql)
        )
        if clean_sql != sql.strip():
            logger.info(f"Federated query removed auto-added LIMIT: {sql} -> {clean_sql}")
        else:
            logger.info(f"Federated query using original SQL: {clean_sql}")

        # 确定表名（洗空则回退 task_id 名，不建空名表）
        table_name, is_custom = _resolve_result_table_name(custom_table_name, task_id)
        logger.info(f"Federated query result will be stored in table: {table_name}")

        # 第二步：在同一连接中执行 ATTACH、查询、DETACH
        with interruptible_connection(task_id, clean_sql) as con:
            try:
                # 自定义名撞已有表且未显式允许覆盖 → 报错，绝不静默覆盖用户表
                if is_custom and not overwrite:
                    _raise_if_table_exists(con, table_name)

                # 2.1 执行 ATTACH 操作
                if attach_databases:
                    attached_aliases = _attach_external_databases(con, attach_databases)
                    logger.info(
                        f"Successfully ATTACHed {len(attached_aliases)} databases: {attached_aliases}"
                    )

                # 取消检查点 2: ATTACH 完成后检查
                if task_manager.is_cancellation_requested(task_id):
                    logger.info(f"Federated query task cancelled after ATTACH: {task_id}")
                    _detach_databases(con, attached_aliases)
                    task_manager.mark_cancelled(task_id, "User cancelled (after ATTACH)")
                    return

                # 2.2 执行查询并保存结果
                create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({clean_sql})'
                logger.info(f"Executing federated query: {create_sql[:200]}...")
                con.execute(create_sql)
                logger.info(f"Federated query result table created: {table_name}")

                # 2.3 获取元数据（在同一连接中）
                metadata_snapshot = build_table_metadata_snapshot(con, table_name)
                row_count = metadata_snapshot.get("row_count", 0)
                logger.info(f"Federated query result row count: {row_count}")

                columns_sql = f'DESCRIBE \"{table_name}\"'
                columns_info = con.execute(columns_sql).fetchall()
                columns = [{"name": col[0], "type": col[1]} for col in columns_info]
                logger.info(f"Federated query result column count: {len(columns)}")

                # 内存清理
                try:
                    # 显式触发GC回收内存
                    import gc

                    gc.collect()
                    logger.info("Memory cleanup completed")
                except Exception as cleanup_error:
                    logger.warning(f"Memory cleanup failed: {str(cleanup_error)}")

            finally:
                # 2.4 DETACH（无论成功失败都要执行）
                if attached_aliases:
                    logger.info(f"Starting DETACH cleanup: {attached_aliases}")
                    _detach_databases(con, attached_aliases)

        # 连接池连接在这里释放

        # 取消检查点 3: 查询完成后检查
        if task_manager.is_cancellation_requested(task_id):
            logger.info(f"Federated query task cancelled after completion: {task_id}, cleaning created table")
            with pool.get_connection() as con:
                try:
                    con.execute(f'DROP TABLE IF EXISTS \"{table_name}\"')
                    logger.info(f"Cleaned table for cancelled task: {table_name}")
                except Exception as drop_error:
                    logger.warning(f"Failed to clean table: {drop_error}")
            task_manager.mark_cancelled(task_id, "User cancelled after completion")
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
            logger.info(f"Federated query table metadata saved: {source_id}")
        except Exception as meta_error:
            logger.warning(f"Saving table metadata failed (non-fatal): {str(meta_error)}")

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

        logger.info(f"[{task_id}] (Federated) calling complete_task to update status")
        complete_result = task_manager.complete_task(task_id, task_info)
        logger.info(f"[{task_id}] (Federated) complete_task result: {complete_result}")
        if not complete_result:
            # 检查当前状态，防止覆盖已取消或已完成的状态
            current_task = task_manager.get_task(task_id)
            current_status = current_task.status.value if current_task else "None"

            # 使用字符串值进行比较，避免Enum身份问题
            if current_status in ("cancelling", "cancelled", "failed"):
                # 与非联邦路径同理（回归 #8）：被并发取消/失败时撤销孤儿表+datasource
                logger.info(
                    f"[{task_id}] (Federated) complete_task rejected (status={current_status}); "
                    f"discarding orphaned result table and datasource"
                )
                _discard_persisted_result(task_id, table_name)
                if current_status == "cancelling":
                    task_manager.mark_cancelled(task_id, "User cancelled during result persistence")
            elif current_status in ("success", "completed"):
                logger.info(
                    f"[{task_id}] (Federated) task already final ({current_status}); keeping result table"
                )
            else:
                logger.warning(
                    f"[{task_id}] (Federated) complete_task failed with abnormal status ({current_status}), executing force_fail_task"
                )
                # 使用 force_fail_task 确保任务状态被更新
                task_manager.force_fail_task(
                    task_id,
                    f"Federated query execution completed but status update failed, please check result table",
                    {"actual_result": task_info},
                )
                logger.error(f"[{task_id}] (Federated) Unable to mark task as successful, force marked as failed")

        execution_time = time.time() - start_time
        logger.info(
            f"Async federated query task completed: {task_id}, execution time: {execution_time:.2f}s, "
            f"attached databases: {attached_aliases}"
        )

    except duckdb.InterruptException:
        # 查询被中断（用户取消）
        logger.info(f"Federated query task {task_id} was interrupted")

        # 清理可能已创建的表
        if table_name:
            try:
                with pool.get_connection() as con:
                    con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                    logger.info(f"Cleaned table for interrupted federated query: {table_name}")
            except Exception as drop_error:
                logger.warning(f"Failed to clean table: {drop_error}")

        # 标记为取消状态
        task_manager.mark_cancelled(task_id, "Federated query interrupted by user")

    except Exception as e:
        logger.error(f"Async federated query task failed: {task_id}, error: {str(e)}")
        logger.error(traceback.format_exc())

        # 检查是否因取消而异常
        if task_manager.is_cancellation_requested(task_id):
            task_manager.mark_cancelled(task_id, "Cancelled by user")
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
            elif (
                "authentication" in error_str
                or "认证" in error_message
                or "密码" in error_message
            ):
                error_code = "AUTH_FAILED"
            else:
                error_code = "FEDERATED_QUERY_FAILED"

            # 使用 force_fail_task 保存详细错误信息到元数据
            error_metadata = {
                "error_code": error_code,
                "is_federated": True,
                "attached_databases": attached_aliases,
            }

            # 与非联邦分支一致的兜底:上面的取消检查之后、这里 force_fail 之前,若并发
            # 取消才落地(RUNNING->CANCELLING),force_fail_task 无状态守卫会把它无条件
            # 盖成 FAILED、丢掉这次取消(与非联邦分支"卡在 CANCELLING"相反的失效模式)。
            # 先复查一次:确已进入取消流程就推进到终态 CANCELLED,否则才按失败落库。
            if task_manager.is_cancellation_requested(task_id):
                task_manager.mark_cancelled(task_id, "Cancelled by user")
            elif not task_manager.force_fail_task(
                task_id, error_message, metadata_update=error_metadata
            ):
                logger.error(f"Unable to mark federated query task as failed: {task_id}")


def generate_download_file(task_id: str, format: str = "csv", target_path: Optional[str] = None):
    """
    按需生成下载文件 - 基于持久DuckDB表进行COPY导出
    避免重复加载数据到内存

    target_path(桌面直写导出用):未命中缓存时让 DuckDB 直接 COPY 到该路径,
    单遍磁盘写、不产生 exports 缓存副本;命中缓存时仍返回缓存文件(调用方拷贝)。
    """
    try:
        # 获取任务信息
        task_info = task_manager.get_task(task_id)
        if not task_info:
            # 尝试从文件系统恢复任务信息
            task_info = task_utils.recover_task_from_files(task_id)
            if not task_info:
                raise ValueError(f"Task does not exist")

        # 检查任务状态
        if not task_utils.is_task_completed(task_info):
            raise ValueError(f"Task {task_id} not completed, cannot generate download file")

        # 检查是否已经有生成的文件
        if task_info.result_file_path and os.path.exists(task_info.result_file_path):
            existing_file = task_info.result_file_path
            existing_format = existing_file.split(".")[-1]

            # 如果请求的格式与现有文件格式相同，直接返回
            if existing_format == format:
                logger.info(f"Using existing file: {existing_file}")
                return existing_file

            # 如果格式不同，需要转换
            logger.info(f"Format conversion needed: {existing_format} -> {format}")

        # 从result_info中获取表名
        if not task_info.result_info:
            raise ValueError(f"Task {task_id} missing result information")

        table_name = task_info.result_info.get("table_name")
        if not table_name:
            raise ValueError(f"Task {task_id} missing table name information")

        # 使用连接池获取连接
        from core.database.duckdb_pool import get_connection_pool

        pool = get_connection_pool()

        with pool.get_connection() as con:
            # 验证表是否存在
            try:
                con.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()
            except Exception as e:
                raise ValueError(f"Table does not exist or has been deleted: {str(e)}")

            # 生成文件路径:默认写 exports 缓存;桌面直写导出传入 target_path 时
            # 一步写到用户选定路径(单遍磁盘写,不产生缓存副本)
            result_file_path = target_path or task_utils.generate_file_path(task_id, format)

            # 使用COPY命令基于持久表生成文件（流式处理，避免内存加载）。
            # 路径按 SQL 单引号字符串字面量嵌入('→'' 转义):用户可选路径可含
            # 空格/中文/引号;旧写法用双引号包路径在 DuckDB 里是标识符语法,纯属侥幸。
            escaped_path = str(result_file_path).replace("'", "''")
            if format == "csv":
                copy_sql = f"COPY \"{table_name}\" TO '{escaped_path}' WITH (FORMAT CSV, HEADER true)"
            else:
                copy_sql = f"COPY \"{table_name}\" TO '{escaped_path}' WITH (FORMAT PARQUET)"

            logger.info(f"Starting download file generation: {result_file_path}")
            con.execute(copy_sql)
            logger.info(f"Download file generated successfully: {result_file_path}")

            # 仅写缓存位置时登记任务文件元数据;直写用户路径不算缓存
            if target_path is None:
                task_utils.update_task_file_info(task_info, result_file_path, format)

            return result_file_path

    except Exception as e:
        import traceback

        logger.error(f"Failed to generate download file, error: {str(e)}")
        logger.error(f"Full stack trace: {traceback.format_exc()}")
        raise Exception(f"Failed to generate download file: {str(e)}")


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

        # 清理exports目录中的旧文件（含异步 task-* 与同步导出的 {uuid} 文件）
        if os.path.exists(EXPORTS_DIR):
            for file_path in glob.glob(
                os.path.join(EXPORTS_DIR, "*.csv")
            ) + glob.glob(os.path.join(EXPORTS_DIR, "*.parquet")):
                try:
                    # 检查文件修改时间
                    file_mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
                    if file_mtime < cutoff_time:
                        os.remove(file_path)
                        cleaned_count += 1
                        logger.info(f"Cleaning up expired file: {file_path}")
                except Exception as e:
                    logger.warning(f"Failed to clean up file, error: {str(e)}")

        # 清理过期的DuckDB表
        try:
            from core.database.duckdb_pool import get_connection_pool

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
                                logger.info(f"Cleaned expired table: {table_name}")
                                cleaned_count += 1
                    except Exception as e:
                        logger.warning(f"Failed to clean table: {table_name}, error: {str(e)}")

        except Exception as e:
            logger.warning(f"Failed to clean DuckDB tables: {str(e)}")

        logger.info(f"File cleanup completed, cleaned {cleaned_count} files/tables")
        return cleaned_count

    except Exception as e:
        logger.error(f"File cleanup failed: {str(e)}")
        return 0
