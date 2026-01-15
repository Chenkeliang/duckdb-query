"""
DuckDB自定义SQL查询路由
基于已加载到DuckDB中的表进行SQL查询
"""

import logging
import traceback
import os
import time
import re
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Form, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import duckdb
import uuid

from core.common.config_manager import config_manager
from core.database.duckdb_engine import (
    get_db_connection,
    create_persistent_table,
    build_attach_sql,
)
from core.database.duckdb_pool import interruptible_connection
from core.common.utils import normalize_dataframe_output
from core.common.timezone_utils import format_storage_time_for_response
from core.services.resource_manager import save_upload_file
from core.data.file_datasource_manager import (
    file_datasource_manager,
    build_table_metadata_snapshot,
)
from core.common.timezone_utils import get_current_time_iso
from core.services.visual_query_generator import get_table_metadata
from core.database.database_manager import db_manager
from core.security.encryption import password_encryptor
from models.query_models import FederatedQueryRequest, FederatedQueryResponse
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()


def contains_keyword(sql_text: str, keyword: str) -> bool:
    """检测SQL文本中是否包含独立的关键字（忽略字符串字面量内的内容）"""
    pattern = rf"\b{keyword}\b"
    return re.search(pattern, sql_text) is not None


def fix_table_names_in_sql(sql: str, available_tables: List[str]) -> str:
    """
    修复SQL中的表名，为包含特殊字符的表名添加引号
    注意：如果表名已经被引用了，则跳过处理以避免双引号嵌套

    Args:
        sql: 原始SQL查询
        available_tables: 可用的表名列表

    Returns:
        修复后的SQL查询
    """
    if not available_tables:
        return sql

    # 创建表名映射，将包含特殊字符的表名映射到带引号的版本
    table_mapping = {}
    for table_name in available_tables:
        # 检查表名是否包含特殊字符（连字符、点号等）
        if re.search(r"[-\.]", table_name):
            # 检查SQL中是否已经存在带引号的表名
            quoted_pattern = f'"{table_name}"'
            if quoted_pattern in sql:
                # 表名已经被引用了，跳过处理
                continue
            table_mapping[table_name] = f'"{table_name}"'

    if not table_mapping:
        return sql

    # 替换SQL中的表名
    fixed_sql = sql
    for original_name, quoted_name in table_mapping.items():
        # 使用单词边界确保只替换完整的表名，避免部分匹配
        pattern = r"\b" + re.escape(original_name) + r"\b"
        fixed_sql = re.sub(pattern, quoted_name, fixed_sql, flags=re.IGNORECASE)

    return fixed_sql


class DuckDBQueryRequest(BaseModel):
    """DuckDB查询请求模型"""

    sql: str
    save_as_table: Optional[str] = None  # 可选：将查询结果保存为新表
    is_preview: Optional[bool] = True  # 标准化为 is_preview 标志


class DuckDBQueryResponse(BaseModel):
    """DuckDB查询响应模型"""

    success: bool
    columns: List[str] = []
    data: List[Dict[str, Any]] = []
    row_count: int = 0
    execution_time_ms: float = 0
    sql_executed: str = ""
    available_tables: List[str] = []
    saved_table: Optional[str] = None
    message: str = ""


@router.get("/api/duckdb/tables", tags=["DuckDB Query"])
async def list_duckdb_tables_summary():
    """获取DuckDB中所有可用表的概要信息"""
    try:
        con = get_db_connection()

        # 获取所有表
        tables_df = con.execute("SHOW TABLES").fetchdf()

        if tables_df.empty:
            return {
                "success": True,
                "tables": [],
                "count": 0,
                "message": "当前DuckDB中没有可用的表，请先上传文件或连接数据库",
            }

        # 获取每个表的概要信息
        table_info = []
        for _, row in tables_df.iterrows():
            table_name = row["name"]
            if table_name.lower().startswith("system_"):
                continue
            try:
                # 获取列数量
                schema_df = con.execute(f'DESCRIBE "{table_name}"').fetchdf()
                column_count = len(schema_df) if not schema_df.empty else 0

                # 获取行数
                count_result = con.execute(
                    f'SELECT COUNT(*) as count FROM "{table_name}"'
                ).fetchone()
                row_count = int(count_result[0]) if count_result else 0

                metadata = file_datasource_manager.get_file_datasource(table_name)
                raw_created_at = metadata.get("created_at") if metadata else None
                if isinstance(raw_created_at, datetime):
                    created_at = raw_created_at.isoformat()
                elif raw_created_at is not None:
                    created_at = str(raw_created_at)
                else:
                    created_at = None

                table_info.append(
                    {
                        "table_name": table_name,
                        "column_count": column_count,
                        "row_count": row_count,
                        "created_at": created_at,
                    }
                )
            except Exception as table_error:
                logger.warning(f"获取表 {table_name} 信息失败: {str(table_error)}")

                # 尝试从元数据获取列信息
                metadata = file_datasource_manager.get_file_datasource(table_name)
                raw_created_at = metadata.get("created_at") if metadata else None
                if isinstance(raw_created_at, datetime):
                    created_at = raw_created_at.isoformat()
                elif raw_created_at is not None:
                    created_at = str(raw_created_at)
                else:
                    created_at = None

                # 尝试获取行数
                row_count = 0
                if metadata:
                    row_count = metadata.get("row_count", 0)

                table_info.append(
                    {
                        "table_name": table_name,
                        "column_count": metadata.get("column_count") if metadata else 0,
                        "row_count": row_count,
                        "created_at": created_at,
                        "error": str(table_error),
                    }
                )

        # 按创建时间排序：最新的在前，没有创建时间的在最后
        from dateutil import parser as date_parser
        
        def sort_key(table):
            created_at = table.get("created_at")
            if created_at is None:
                return datetime(1900, 1, 1)
            # 如果是字符串，转换为 datetime
            if isinstance(created_at, str):
                try:
                    parsed = date_parser.parse(created_at)
                    return parsed.replace(tzinfo=None)
                except Exception:
                    return datetime(1900, 1, 1)
            # 如果已经是 datetime，移除时区信息
            if hasattr(created_at, 'replace'):
                return created_at.replace(tzinfo=None) if created_at.tzinfo else created_at
            return datetime(1900, 1, 1)

        table_info.sort(key=sort_key, reverse=True)  # 降序排列，最新的在前

        return {"success": True, "tables": table_info, "count": len(table_info)}

    except Exception as e:
        logger.error(f"获取DuckDB表信息失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表信息失败: {str(e)}")


def _ensure_table_exists(con, table_name: str) -> None:
    tables_df = con.execute("SHOW TABLES").fetchdf()
    available_tables = tables_df["name"].tolist() if not tables_df.empty else []
    if table_name not in available_tables:
        raise HTTPException(status_code=404, detail=f"数据表 {table_name} 不存在")


@router.get("/api/duckdb/tables/detail/{table_name}", tags=["DuckDB Query"])
async def get_duckdb_table_detail(table_name: str):
    """获取指定表的列级详细信息"""
    try:
        con = get_db_connection()
        _ensure_table_exists(con, table_name)
        metadata = get_table_metadata(table_name, con)
        metadata_dict = (
            metadata.model_dump()
            if hasattr(metadata, "model_dump")
            else metadata.dict()
        )
        return {
            "success": True,
            "table": metadata_dict,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("获取表元数据失败: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取表元数据失败: {str(exc)}")


@router.get("/api/duckdb/tables/{table_name}", tags=["DuckDB Query"])
async def get_duckdb_table(table_name: str):
    """获取指定表的详细信息（别名端点）"""
    return await get_duckdb_table_detail(table_name)


@router.post("/api/duckdb/table/{table_name}/refresh", tags=["DuckDB Query"])
async def refresh_duckdb_table_metadata(table_name: str):
    """刷新指定表的元数据缓存并返回最新详细信息"""
    try:
        con = get_db_connection()
        _ensure_table_exists(con, table_name)
        metadata = get_table_metadata(table_name, con, use_cache=False)
        metadata_dict = (
            metadata.model_dump()
            if hasattr(metadata, "model_dump")
            else metadata.dict()
        )
        return {
            "success": True,
            "table": metadata_dict,
            "refreshed": True,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("刷新表元数据失败: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"刷新表元数据失败: {str(exc)}")


async def execute_duckdb_query(
    request: DuckDBQueryRequest, 
    request_id: Optional[str] = None
) -> DuckDBQueryResponse:
    """
    执行DuckDB自定义SQL查询

    支持的功能：
    - 基于已加载的表进行查询
    - 自动添加LIMIT限制
    - 可选择将结果保存为新表
    - 返回执行时间和表信息
    - 支持查询取消（通过 request_id）
    """
    import time

    # 生成 query_id（如果有 request_id，使用 sync: 前缀）
    query_id = f"sync:{request_id}" if request_id else None
    start_time = time.time()
    
    try:
        # 先获取可用表（这个操作很快，不需要可中断）
        con = get_db_connection()
        available_tables_df = con.execute("SHOW TABLES").fetchdf()
        available_tables = (
            available_tables_df["name"].tolist() if len(available_tables_df) > 0 else []
        )

        # 验证SQL查询
        sql_query = request.sql.strip()
        if not sql_query:
            raise HTTPException(status_code=400, detail="SQL查询不能为空")

        # 检查是否是简单的SELECT查询（不需要表）
        sql_upper = sql_query.upper().strip()
        sql_upper_clean = re.sub(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"", " ", sql_upper)
        is_simple_select = (
            sql_upper_clean.startswith("SELECT")
            and "FROM" not in sql_upper_clean
            and not any(
                contains_keyword(sql_upper_clean, keyword)
                for keyword in [
                    "DROP",
                    "DELETE",
                    "TRUNCATE",
                    "ALTER",
                    "CREATE",
                    "INSERT",
                    "UPDATE",
                ]
            )
        )

        # 如果没有可用的表且不是简单SELECT查询，则报错
        if not available_tables and not is_simple_select:
            raise HTTPException(
                status_code=400, detail="DuckDB中没有可用的表，请先上传文件或连接数据库"
            )

        # 检查SQL中是否包含危险操作（已在上面检查过）
        dangerous_keywords = [
            "DROP",
            "DELETE",
            "TRUNCATE",
            "ALTER",
            "CREATE",
            "INSERT",
            "UPDATE",
        ]

        # 如果要保存为表，允许CREATE操作
        if not request.save_as_table:
            for keyword in dangerous_keywords:
                if keyword != "CREATE" and contains_keyword(sql_upper_clean, keyword):
                    raise HTTPException(
                        status_code=400,
                        detail=f"不允许执行 {keyword} 操作，仅支持查询操作",
                    )

        # 自动添加LIMIT限制（如果SQL中没有LIMIT且是预览模式）
        limit = None
        if request.is_preview and "LIMIT" not in sql_upper_clean:
            from core.common.config_manager import config_manager
            limit = config_manager.get_app_config().max_query_rows
            sql_query = f"{sql_query.rstrip(';')} LIMIT {limit}"
            logger.info(f"预览模式，已应用LIMIT {limit}")

        logger.info(f"执行DuckDB查询: {sql_query}")
        logger.info(f"可用表: {available_tables}")

        # 使用可中断连接执行查询（如果有 query_id）
        if query_id:
            with interruptible_connection(query_id, sql_query) as conn:
                result_df = conn.execute(sql_query).fetchdf()
                
                # 可选：保存查询结果为新表（在同一连接上下文内）
                saved_table = None
                if request.save_as_table:
                    table_name = request.save_as_table.strip()
                    if table_name:
                        try:
                            save_sql = sql_query.rstrip(";")
                            if limit:
                                save_sql = save_sql.replace(f" LIMIT {limit}", "")
                            create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({save_sql})'
                            conn.execute(create_sql)
                            saved_table = table_name
                            logger.info(f"查询结果已保存为表: {table_name}")
                            
                            # 保存表元数据（含创建时间）
                            try:
                                metadata_snapshot = build_table_metadata_snapshot(conn, table_name)
                                table_metadata = {
                                    "source_id": table_name,
                                    "filename": f"sql_query_result",
                                    "file_path": f"duckdb://{table_name}",
                                    "file_type": "duckdb_sql_query",
                                    "created_at": get_current_time_iso(),
                                    "source_sql": save_sql,
                                    "schema_version": 2,
                                    **metadata_snapshot,
                                }
                                file_datasource_manager.save_file_datasource(table_metadata)
                                logger.info(f"SQL save_as_table 元数据保存成功: {table_name}")
                            except Exception as meta_error:
                                logger.warning(f"保存表元数据失败（非致命）: {str(meta_error)}")
                        except Exception as save_error:
                            logger.warning(f"保存查询结果为表失败: {str(save_error)}")
        else:
            # 无 request_id 时使用普通连接（向后兼容）
            result_df = con.execute(sql_query).fetchdf()
            
            saved_table = None
            if request.save_as_table:
                table_name = request.save_as_table.strip()
                if table_name:
                    try:
                        save_sql = sql_query.rstrip(";")
                        if limit:
                            save_sql = save_sql.replace(f" LIMIT {limit}", "")
                        create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({save_sql})'
                        con.execute(create_sql)
                        saved_table = table_name
                        logger.info(f"查询结果已保存为表: {table_name}")
                        
                        # 保存表元数据（含创建时间）
                        try:
                            metadata_snapshot = build_table_metadata_snapshot(con, table_name)
                            table_metadata = {
                                "source_id": table_name,
                                "filename": f"sql_query_result",
                                "file_path": f"duckdb://{table_name}",
                                "file_type": "duckdb_sql_query",
                                "created_at": get_current_time_iso(),
                                "source_sql": save_sql,
                                "schema_version": 2,
                                **metadata_snapshot,
                            }
                            file_datasource_manager.save_file_datasource(table_metadata)
                            logger.info(f"SQL save_as_table 元数据保存成功: {table_name}")
                        except Exception as meta_error:
                            logger.warning(f"保存表元数据失败（非致命）: {str(meta_error)}")
                    except Exception as save_error:
                        logger.warning(f"保存查询结果为表失败: {str(save_error)}")

        execution_time = (time.time() - start_time) * 1000

        # 构建响应
        response = DuckDBQueryResponse(
            success=True,
            columns=result_df.columns.tolist(),
            data=normalize_dataframe_output(result_df),
            row_count=len(result_df),
            execution_time_ms=execution_time,
            sql_executed=sql_query,
            available_tables=available_tables,
            saved_table=saved_table,
            message=f"查询成功，返回 {len(result_df)} 行数据",
        )

        # 性能日志
        if execution_time > 1000:  # 超过1秒的查询
            logger.warning(f"慢查询检测: 耗时 {execution_time:.2f}ms")
        else:
            logger.info(f"查询执行完成，耗时: {execution_time:.2f}ms")

        return response

    except duckdb.InterruptException:
        logger.info(f"Query {query_id} was cancelled by user")
        raise HTTPException(status_code=499, detail="Query cancelled by client")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DuckDB查询执行失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"查询执行失败: {str(e)}")


@router.post("/api/duckdb/execute", tags=["DuckDB Query"])
async def execute_duckdb_sql(
    request: DuckDBQueryRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID")
) -> DuckDBQueryResponse:
    """
    执行DuckDB SQL查询 (兼容增强SQL执行器)
    这是 /api/duckdb/query 的别名端点，保持API兼容性
    支持通过 X-Request-ID 头实现查询取消
    """
    return await execute_duckdb_query(request, x_request_id)


@router.delete("/api/duckdb/tables/{table_name}", tags=["DuckDB Query"])
async def delete_duckdb_table(table_name: str):
    """删除指定的DuckDB表"""
    try:
        con = get_db_connection()

        # 检查表是否存在
        tables_df = con.execute("SHOW TABLES").fetchdf()
        available_tables = tables_df["name"].tolist() if not tables_df.empty else []

        if table_name not in available_tables:
            raise HTTPException(
                status_code=404,
                detail=f"表 '{table_name}' 不存在。可用的表: {', '.join(available_tables)}",
            )

        # 删除表
        drop_sql = f'DROP TABLE IF EXISTS "{table_name}"'
        con.execute(drop_sql)

        logger.info(f"成功删除DuckDB表: {table_name}")

        # 同时尝试删除文件数据源记录
        try:
            from core.data.file_datasource_manager import file_datasource_manager

            file_datasource_manager.delete_file_datasource(table_name)
            logger.info(f"已删除文件数据源记录: {table_name}")
        except Exception as e:
            logger.warning(f"删除文件数据源记录失败: {str(e)}")
        return {
            "success": True,
            "message": f"表 '{table_name}' 已成功删除",
            "deleted_table": table_name,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除DuckDB表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除表失败: {str(e)}")


# 新增连接池状态监控接口
@router.get("/api/duckdb/pool/status", tags=["DuckDB Management"])
async def get_connection_pool_status():
    """获取连接池状态"""
    try:
        from core.database.duckdb_pool import get_connection_pool

        pool = get_connection_pool()
        stats = pool.get_stats()

        return {"success": True, "pool_status": stats, "timestamp": time.time()}
    except Exception as e:
        logger.error(f"获取连接池状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/duckdb/pool/reset", tags=["DuckDB Management"])
async def reset_connection_pool():
    """重置连接池"""
    try:
        from core.database.duckdb_pool import get_connection_pool

        pool = get_connection_pool()

        # 关闭所有连接
        pool.close_all()

        # 重新初始化连接池
        from core.database.duckdb_pool import _connection_pool

        global _connection_pool
        _connection_pool = None

        return {"success": True, "message": "连接池已重置"}
    except Exception as e:
        logger.error(f"重置连接池失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/duckdb/migrate/created_at", tags=["DuckDB Management"])
async def migrate_created_at_field():
    """迁移 created_at 字段：为现有表填充创建时间"""
    try:
        from core.database.duckdb_engine import with_duckdb_connection
        from datetime import datetime
        
        with with_duckdb_connection() as conn:
            # 检查需要迁移的记录数
            result = conn.execute("""
                SELECT COUNT(*) 
                FROM system_file_datasources 
                WHERE created_at IS NULL
            """).fetchone()
            
            count = result[0] if result else 0
            logger.info(f"发现 {count} 条记录需要填充 created_at 字段")
            
            if count == 0:
                return {
                    "success": True,
                    "message": "所有记录的 created_at 字段已填充，无需迁移",
                    "migrated_count": 0
                }
            
            # 使用 upload_time 填充 created_at
            conn.execute("""
                UPDATE system_file_datasources
                SET created_at = COALESCE(upload_time, CURRENT_TIMESTAMP)
                WHERE created_at IS NULL
            """)
            
            # 同时填充 updated_at
            conn.execute("""
                UPDATE system_file_datasources
                SET updated_at = COALESCE(upload_time, CURRENT_TIMESTAMP)
                WHERE updated_at IS NULL
            """)
            
            logger.info(f"成功迁移 {count} 条记录的 created_at 字段")
            
            # 验证迁移结果
            result = conn.execute("""
                SELECT COUNT(*) 
                FROM system_file_datasources 
                WHERE created_at IS NULL
            """).fetchone()
            
            remaining = result[0] if result else 0
            
            return {
                "success": True,
                "message": f"成功迁移 {count} 条记录的 created_at 字段",
                "migrated_count": count,
                "remaining_null": remaining
            }
            
    except Exception as e:
        logger.error(f"迁移 created_at 字段失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"迁移失败: {str(e)}")


# 新增错误统计接口
@router.get("/api/errors/statistics", tags=["System Management"])
async def get_error_statistics():
    """获取错误统计信息"""
    try:
        error_handler = get_error_handler()
        stats = error_handler.get_error_statistics()

        return {"success": True, "error_statistics": stats}
    except Exception as e:
        logger.error(f"获取错误统计失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/errors/clear", tags=["System Management"])
async def clear_old_errors(days: int = 30):
    """清理旧错误记录"""
    try:
        error_handler = get_error_handler()
        error_handler.clear_old_errors(days)

        return {"success": True, "message": f"已清理 {days} 天前的错误记录"}
    except Exception as e:
        logger.error(f"清理错误记录失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/duckdb/federated-query", tags=["DuckDB Query"])
async def execute_federated_query(
    request: FederatedQueryRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID")
) -> FederatedQueryResponse:
    """
    执行联邦查询，支持跨数据库 ATTACH
    
    流程：
    1. 验证请求参数
    2. 获取外部数据库连接配置
    3. 执行 ATTACH 语句
    4. 执行用户 SQL
    5. 执行 DETACH 清理
    6. 返回结果
    
    支持通过 X-Request-ID 头实现查询取消
    """
    start_time = time.time()
    attached_aliases = []
    warnings = []
    query_id = f"sync:{x_request_id}" if x_request_id else None
    
    # 预先准备 ATTACH 配置（在连接外验证，避免占用连接时间）
    attach_configs = []
    if request.attach_databases:
        for attach_db in request.attach_databases:
            connection = db_manager.get_connection(attach_db.connection_id)
            if not connection:
                raise HTTPException(
                    status_code=404,
                    detail=f"数据库连接 '{attach_db.connection_id}' 不存在"
                )
            
            db_config = connection.params.copy()
            password = db_config.get('password', '')
            if password and password_encryptor.is_encrypted(password):
                db_config['password'] = password_encryptor.decrypt_password(password)
            
            db_config['type'] = connection.type.value if hasattr(connection.type, 'value') else str(connection.type)
            attach_configs.append((attach_db.alias, db_config))
    
    # 处理 SQL 查询
    sql_query = request.sql.strip()
    sql_upper = sql_query.upper()
    
    if request.is_preview and "LIMIT" not in sql_upper:
        limit = config_manager.get_app_config().max_query_rows
        sql_query = f"{sql_query.rstrip(';')} LIMIT {limit}"
        logger.info(f"预览模式，已应用 LIMIT {limit}")
    
    logger.info(f"执行联邦查询: {sql_query}")
    
    def execute_in_connection(conn):
        """在连接内执行 ATTACH/QUERY/DETACH"""
        nonlocal attached_aliases, warnings
        
        # 1. ATTACH 所有外部数据库
        for alias, db_config in attach_configs:
            try:
                attach_sql = build_attach_sql(alias, db_config)
                # 打印完整的 ATTACH SQL（密码已在 build_attach_sql 中处理）
                # 为安全起见，再次屏蔽密码
                masked_sql = attach_sql
                if 'password' in attach_sql.lower():
                    import re
                    masked_sql = re.sub(r"password\s*[=:]\s*'[^']*'", "password='***'", attach_sql, flags=re.IGNORECASE)
                logger.info(f"执行 ATTACH: {alias}")
                logger.info(f"ATTACH SQL: {masked_sql}")
                conn.execute(attach_sql)
                attached_aliases.append(alias)
                logger.info(f"成功 ATTACH 数据库: {alias}")
            except Exception as attach_error:
                logger.error(f"ATTACH 数据库 {alias} 失败: {attach_error}")
                raise HTTPException(
                    status_code=500,
                    detail=f"连接外部数据库 '{alias}' 失败: {str(attach_error)}"
                )
        
        logger.info(f"已 ATTACH 的数据库: {attached_aliases}")
        
        # 2. 执行用户 SQL
        result_df = conn.execute(sql_query).fetchdf()
        
        # 3. 可选：保存查询结果为新表
        if request.save_as_table:
            table_name = request.save_as_table.strip()
            if table_name:
                try:
                    save_sql = request.sql.strip().rstrip(';')
                    create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({save_sql})'
                    conn.execute(create_sql)
                    logger.info(f"查询结果已保存为表: {table_name}")
                except Exception as save_error:
                    logger.warning(f"保存查询结果为表失败: {str(save_error)}")
                    warnings.append(f"保存结果为表失败: {str(save_error)}")
        
        # 4. DETACH 清理
        for alias in attached_aliases:
            try:
                conn.execute(f'DETACH "{alias}"')
                logger.info(f"成功 DETACH 数据库: {alias}")
            except Exception as detach_error:
                logger.warning(f"DETACH {alias} 失败: {detach_error}")
        
        return result_df
    
    try:
        # 使用可中断连接（如果有 query_id）
        if query_id:
            with interruptible_connection(query_id, sql_query) as conn:
                result_df = execute_in_connection(conn)
        else:
            # 向后兼容
            con = get_db_connection()
            try:
                result_df = execute_in_connection(con)
            finally:
                # 确保 DETACH 清理（在异常情况下）
                for alias in attached_aliases:
                    try:
                        con.execute(f'DETACH "{alias}"')
                    except:
                        pass
        
        execution_time = (time.time() - start_time) * 1000
        
        response = FederatedQueryResponse(
            success=True,
            columns=result_df.columns.tolist(),
            data=normalize_dataframe_output(result_df),
            row_count=len(result_df),
            execution_time_ms=execution_time,
            attached_databases=attached_aliases,
            message=f"联邦查询成功，返回 {len(result_df)} 行数据",
            sql_query=sql_query,
            warnings=warnings if warnings else None,
        )
        
        if execution_time > 1000:
            logger.warning(f"慢查询检测: 联邦查询耗时 {execution_time:.2f}ms")
        else:
            logger.info(f"联邦查询执行完成，耗时: {execution_time:.2f}ms")
        
        return response
        
    except duckdb.InterruptException:
        logger.info(f"Federated query {query_id} was cancelled by user")
        # 取消时也尝试清理 ATTACH
        try:
            con = get_db_connection()
            for alias in attached_aliases:
                try:
                    con.execute(f'DETACH "{alias}"')
                    logger.info(f"取消后清理 DETACH: {alias}")
                except:
                    pass
        except:
            pass
        raise HTTPException(status_code=499, detail="Query cancelled by client")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"联邦查询执行失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"联邦查询执行失败: {str(e)}")
