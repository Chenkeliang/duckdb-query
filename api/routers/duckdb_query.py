"""
DuckDB自定义SQL查询路由
基于已加载到DuckDB中的表进行SQL查询
"""

import logging
import traceback
import pandas as pd
import os
import time
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

logger = logging.getLogger(__name__)
router = APIRouter()


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


@router.get("/api/duckdb/available_tables", tags=["DuckDB Query"])
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

                table_info.append(
                    {
                        "table_name": table_name,
                        "columns": schema_df.to_dict("records"),
                        "column_count": len(schema_df),
                        "row_count": row_count,
                    }
                )
            except Exception as table_error:
                logger.warning(f"获取表 {table_name} 信息失败: {str(table_error)}")
                table_info.append(
                    {
                        "table_name": table_name,
                        "columns": [],
                        "column_count": 0,
                        "row_count": 0,
                        "error": str(table_error),
                    }
                )

        return {"success": True, "tables": table_info, "count": len(table_info)}

    except Exception as e:
        logger.error(f"获取DuckDB表信息失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表信息失败: {str(e)}")


@router.post("/api/duckdb/query", tags=["DuckDB Query"])
async def execute_duckdb_query(request: DuckDBQueryRequest) -> DuckDBQueryResponse:
    """
    执行DuckDB自定义SQL查询
    """
    start_time = time.time()

    try:
        con = get_db_connection()
        app_config = config_manager.get_app_config()

        available_tables_df = con.execute("SHOW TABLES").fetchdf()
        available_tables = (
            available_tables_df["name"].tolist() if len(available_tables_df) > 0 else []
        )

        sql_to_execute = request.sql.strip()
        if not sql_to_execute:
            raise HTTPException(status_code=400, detail="SQL查询不能为空")

        # 自动添加LIMIT限制（如果SQL中没有LIMIT且是预览模式）
        sql_for_preview = sql_to_execute
        if request.is_preview and "LIMIT" not in sql_to_execute.upper():
            limit = app_config.max_query_rows
            sql_for_preview = f"{sql_to_execute.rstrip(';')} LIMIT {limit}"

        logger.info(f"执行DuckDB查询: {sql_for_preview}")

        # 执行查询
        result_df = con.execute(sql_for_preview).fetchdf()

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
                    # 创建新表时使用原始SQL（不带LIMIT）
                    create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({sql_to_execute})'
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
            sql_executed=sql_for_preview,
            available_tables=available_tables,
            saved_table=saved_table,
            message=f"查询成功，返回 {len(result_df)} 行数据",
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DuckDB查询执行失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"查询执行失败: {str(e)}")


@router.post("/api/duckdb/execute", tags=["DuckDB Query"])
async def execute_duckdb_sql(request: DuckDBQueryRequest) -> DuckDBQueryResponse:
    """
    执行DuckDB SQL查询 (兼容增强SQL执行器)
    这是 /api/duckdb/query 的别名端点，保持API兼容性
    """
    return await execute_duckdb_query(request)


@router.post("/api/duckdb/explain", tags=["DuckDB Query"])
async def explain_duckdb_query(request: dict = Body(...)):
    """
    解释DuckDB查询执行计划
    """
    try:
        con = get_db_connection()
        sql_query = request.get("sql", "").strip()

        if not sql_query:
            raise HTTPException(status_code=400, detail="SQL查询不能为空")

        # 执行EXPLAIN
        explain_sql = f"EXPLAIN {sql_query}"
        explain_result = con.execute(explain_sql).fetchdf()

        return {
            "success": True,
            "explain_result": explain_result.to_dict(orient="records"),
            "sql": sql_query,
        }

    except Exception as e:
        logger.error(f"查询计划解释失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"查询计划解释失败: {str(e)}")


@router.get("/api/duckdb/table_schema/{table_name}", tags=["DuckDB Query"])
async def get_table_schema(table_name: str):
    """获取指定表的结构信息"""
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

        # 获取表结构
        schema_df = con.execute(f'DESCRIBE "{table_name}"').fetchdf()

        # 获取表统计信息
        count_result = con.execute(
            f'SELECT COUNT(*) as count FROM "{table_name}"'
        ).fetchone()
        row_count = count_result[0] if count_result else 0

        # 获取示例数据
        sample_df = con.execute(f'SELECT * FROM "{table_name}" LIMIT 5').fetchdf()
        sample_df = handle_non_serializable_data(sample_df)

        return {
            "success": True,
            "table_name": table_name,
            "schema": schema_df.to_dict(orient="records"),
            "row_count": row_count,
            "column_count": len(schema_df),
            "sample_data": sample_df.to_dict(orient="records"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取表结构失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表结构失败: {str(e)}")


@router.post("/api/duckdb/upload-file", tags=["DuckDB Query"])
async def upload_file_to_duckdb(
    file: UploadFile = File(...), table_alias: str = Form(...)
):
    """上传文件并直接创建DuckDB表"""
    try:
        logger.info(f"开始上传文件到DuckDB: {file.filename} -> {table_alias}")

        # 保存上传的文件
        file_path = await save_upload_file(file)
        logger.info(f"文件已保存到: {file_path}")

        # 读取文件数据
        file_extension = os.path.splitext(file.filename)[1].lower()

        if file_extension == ".csv":
            df = pd.read_csv(file_path)
        elif file_extension in [".xlsx", ".xls"]:
            df = pd.read_excel(file_path)
        elif file_extension == ".json":
            df = pd.read_json(file_path)
        elif file_extension in [".parquet", ".pq"]:
            df = pd.read_parquet(file_path)
        else:
            raise HTTPException(
                status_code=400, detail=f"不支持的文件格式: {file_extension}"
            )

        logger.info(f"成功读取文件数据: {len(df)} 行, {len(df.columns)} 列")

        # 获取DuckDB连接
        con = get_db_connection()

        # 创建表
        logger.info(f"开始创建DuckDB表: {table_alias}")
        success = create_persistent_table(table_alias, df, con)

        if success:
            # 获取表信息
            row_count = len(df)
            columns = df.columns.tolist()

            logger.info(f"成功创建DuckDB表: {table_alias}")

            # 清理临时文件
            try:
                os.remove(file_path)
                logger.info(f"已清理临时文件: {file_path}")
            except Exception as cleanup_e:
                logger.warning(f"清理临时文件失败: {cleanup_e}")

            return {
                "success": True,
                "message": f"文件上传成功，已创建表: {table_alias}",
                "table_alias": table_alias,
                "row_count": row_count,
                "columns": columns,
            }
        else:
            # 清理临时文件
            try:
                os.remove(file_path)
            except:
                pass
            raise HTTPException(
                status_code=500, detail=f"创建DuckDB表失败: {table_alias}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"上传文件到DuckDB失败: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")


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