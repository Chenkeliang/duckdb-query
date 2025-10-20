"""
DuckDB自定义SQL查询路由
基于已加载到DuckDB中的表进行SQL查询
"""

import logging
import traceback
import pandas as pd
import os
import time
import re
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.config_manager import config_manager
from core.duckdb_engine import (
    get_db_connection,
    handle_non_serializable_data,
    create_persistent_table,
)
from core.utils import jsonable_encoder
from core.resource_manager import save_upload_file
from core.file_datasource_manager import file_datasource_manager
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
async def get_available_tables():
    """获取DuckDB中所有可用的表"""
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

        # 获取每个表的详细信息
        table_info = []
        for _, row in tables_df.iterrows():
            table_name = row["name"]
            try:
                # 获取表结构
                schema_df = con.execute(f'DESCRIBE "{table_name}"').fetchdf()
                # 获取行数
                count_result = con.execute(
                    f'SELECT COUNT(*) as count FROM "{table_name}"'
                ).fetchone()
                row_count = count_result[0] if count_result else 0

                metadata = file_datasource_manager.get_file_datasource(table_name)
                logger.info(f"Metadata for table {table_name}: {metadata}")
                createdAt = metadata.get("created_at") if metadata else None
                column_profiles = metadata.get("column_profiles", []) if metadata else []

                columns = []
                if column_profiles:
                    for profile in column_profiles:
                        name = profile.get("name")
                        duckdb_type = profile.get("duckdb_type") or profile.get("type")
                        columns.append(
                            {
                                "name": name,
                                "type": duckdb_type,
                                "dataType": duckdb_type,
                                "rawType": profile.get("raw_type"),
                                "normalizedType": profile.get("normalized_type"),
                                "precision": profile.get("precision"),
                                "scale": profile.get("scale"),
                                "nullable": profile.get("nullable"),
                                "statistics": profile.get("statistics"),
                                "sampleValues": profile.get("sample_values"),
                            }
                        )
                else:
                    for _, row in schema_df.iterrows():
                        columns.append(
                            {
                                "name": row["column_name"],
                                "type": row["column_type"],
                                "dataType": row["column_type"],
                                "sampleValues": None,
                            }
                        )

                table_info.append(
                    {
                        "table_name": table_name,
                        "columns": columns,
                        "column_count": len(columns),
                        "row_count": row_count,
                        "created_at": createdAt,  # 使用标准的 created_at 字段
                        "column_profiles": column_profiles,
                    }
                )
            except Exception as table_error:
                logger.warning(f"获取表 {table_name} 信息失败: {str(table_error)}")

                # 尝试从元数据获取列信息
                metadata = file_datasource_manager.get_file_datasource(table_name)
                createdAt = metadata.get("created_at") if metadata else None

                # 处理元数据中的列信息
                columns = []
                fallback_profiles = metadata.get("column_profiles") if metadata else []
                if fallback_profiles:
                    for profile in fallback_profiles:
                        name = profile.get("name")
                        duckdb_type = profile.get("duckdb_type") or profile.get("type")
                        if name:
                            columns.append(
                                {
                                    "name": name,
                                    "type": duckdb_type or "UNKNOWN",
                                    "dataType": duckdb_type or "UNKNOWN",
                                    "rawType": profile.get("raw_type"),
                                    "normalizedType": profile.get("normalized_type"),
                                    "precision": profile.get("precision"),
                                    "scale": profile.get("scale"),
                                    "nullable": profile.get("nullable"),
                                    "statistics": profile.get("statistics"),
                                    "sampleValues": profile.get("sample_values"),
                                }
                            )
                elif metadata and metadata.get("columns"):
                    metadata_columns = metadata["columns"]
                    if isinstance(metadata_columns, list) and len(metadata_columns) > 0:
                        if isinstance(metadata_columns[0], str):
                            columns = [
                                {"name": col, "type": "VARCHAR", "dataType": "VARCHAR", "sampleValues": None}
                                for col in metadata_columns
                            ]
                        elif isinstance(metadata_columns[0], dict):
                            columns = metadata_columns

                # 尝试获取行数
                row_count = 0
                if metadata:
                    row_count = metadata.get("row_count", 0)

                table_info.append(
                    {
                        "table_name": table_name,
                        "columns": columns,
                        "column_count": len(columns),
                        "row_count": row_count,
                        "created_at": createdAt,
                        "error": str(table_error),
                    }
                )

        # 按创建时间排序：最新的在前，没有创建时间的在最后
        def sort_key(table):
            created_at = table.get("created_at")
            if created_at is None:
                return "1970-01-01T00:00:00"  # 没有创建时间的排在最后
            return created_at

        table_info.sort(key=sort_key, reverse=True)  # 降序排列，最新的在前

        return {"success": True, "tables": table_info, "count": len(table_info)}

    except Exception as e:
        logger.error(f"获取DuckDB表信息失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表信息失败: {str(e)}")


async def execute_duckdb_query(request: DuckDBQueryRequest) -> DuckDBQueryResponse:
    """
    执行DuckDB自定义SQL查询

    支持的功能：
    - 基于已加载的表进行查询
    - 自动添加LIMIT限制
    - 可选择将结果保存为新表
    - 返回执行时间和表信息
    """
    import time

    try:
        con = get_db_connection()
        start_time = time.time()

        # 获取当前可用的表
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

        # 自动添加LIMIT限制（如果SQL中没有LIMIT）
        limit = getattr(request, "limit", 10000)  # 默认限制10000行
        if "LIMIT" not in sql_upper_clean and limit > 0:
            sql_query = f"{sql_query.rstrip(';')} LIMIT {limit}"

        logger.info(f"执行DuckDB查询: {sql_query}")
        logger.info(f"可用表: {available_tables}")

        # 执行查询
        result_df = con.execute(sql_query).fetchdf()

        execution_time = (time.time() - start_time) * 1000

        # 处理数据类型转换
        for col in result_df.columns:
            if result_df[col].dtype == "object":
                result_df[col] = result_df[col].astype(str)

        # 可选：保存查询结果为新表
        saved_table = None
        if request.save_as_table:
            table_name = request.save_as_table.strip()
            if table_name:
                try:
                    # 创建新表
                    create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({sql_query.rstrip(";").replace(f"LIMIT {limit}", "")})'
                    con.execute(create_sql)
                    saved_table = table_name
                    logger.info(f"查询结果已保存为表: {table_name}")
                except Exception as save_error:
                    logger.warning(f"保存查询结果为表失败: {str(save_error)}")

        # 构建响应
        response = DuckDBQueryResponse(
            success=True,
            columns=result_df.columns.tolist(),
            data=result_df.to_dict(orient="records"),
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

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DuckDB查询执行失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"查询执行失败: {str(e)}")


@router.post("/api/duckdb/execute", tags=["DuckDB Query"])
async def execute_duckdb_sql(request: DuckDBQueryRequest) -> DuckDBQueryResponse:
    """
    执行DuckDB SQL查询 (兼容增强SQL执行器)
    这是 /api/duckdb/query 的别名端点，保持API兼容性
    """
    return await execute_duckdb_query(request)


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
            from core.file_datasource_manager import file_datasource_manager

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
        from core.duckdb_pool import get_connection_pool

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
        from core.duckdb_pool import get_connection_pool

        pool = get_connection_pool()

        # 关闭所有连接
        pool.close_all()

        # 重新初始化连接池
        from core.duckdb_pool import _connection_pool

        global _connection_pool
        _connection_pool = None

        return {"success": True, "message": "连接池已重置"}
    except Exception as e:
        logger.error(f"重置连接池失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


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

        raise
    except Exception as e:
        logger.error(f"删除DuckDB表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除表失败: {str(e)}")
