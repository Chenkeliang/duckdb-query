"""
DuckDB自定义SQL查询路由
基于已加载到DuckDB中的表进行SQL查询
"""

import logging
import traceback
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.duckdb_engine import get_db_connection, handle_non_serializable_data
from core.utils import jsonable_encoder

logger = logging.getLogger(__name__)
router = APIRouter()


class DuckDBQueryRequest(BaseModel):
    """DuckDB查询请求模型"""
    sql: str
    limit: int = 1000
    save_as_table: Optional[str] = None  # 可选：将查询结果保存为新表


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
                "message": "当前DuckDB中没有可用的表，请先上传文件或连接数据库"
            }
        
        # 获取每个表的详细信息
        table_info = []
        for _, row in tables_df.iterrows():
            table_name = row["name"]
            try:
                # 获取表结构
                schema_df = con.execute(f'DESCRIBE "{table_name}"').fetchdf()
                # 获取行数
                count_result = con.execute(f'SELECT COUNT(*) as count FROM "{table_name}"').fetchone()
                row_count = count_result[0] if count_result else 0
                
                table_info.append({
                    "table_name": table_name,
                    "columns": schema_df.to_dict('records'),
                    "column_count": len(schema_df),
                    "row_count": row_count
                })
            except Exception as table_error:
                logger.warning(f"获取表 {table_name} 信息失败: {str(table_error)}")
                table_info.append({
                    "table_name": table_name,
                    "columns": [],
                    "column_count": 0,
                    "row_count": 0,
                    "error": str(table_error)
                })
        
        return {
            "success": True,
            "tables": table_info,
            "count": len(table_info)
        }
        
    except Exception as e:
        logger.error(f"获取DuckDB表信息失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表信息失败: {str(e)}")


@router.post("/api/duckdb/query", tags=["DuckDB Query"])
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
        available_tables = available_tables_df["name"].tolist() if len(available_tables_df) > 0 else []

        # 验证SQL查询
        sql_query = request.sql.strip()
        if not sql_query:
            raise HTTPException(status_code=400, detail="SQL查询不能为空")

        # 检查是否是简单的SELECT查询（不需要表）
        sql_upper = sql_query.upper().strip()
        is_simple_select = (
            sql_upper.startswith('SELECT') and
            'FROM' not in sql_upper and
            not any(keyword in sql_upper for keyword in ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'INSERT', 'UPDATE'])
        )

        # 如果没有可用的表且不是简单SELECT查询，则报错
        if not available_tables and not is_simple_select:
            raise HTTPException(
                status_code=400,
                detail="DuckDB中没有可用的表，请先上传文件或连接数据库"
            )

        # 检查SQL中是否包含危险操作（已在上面检查过）
        dangerous_keywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'INSERT', 'UPDATE']
        
        # 如果要保存为表，允许CREATE操作
        if not request.save_as_table:
            for keyword in dangerous_keywords:
                if keyword in sql_upper and keyword != 'CREATE':
                    raise HTTPException(
                        status_code=400, 
                        detail=f"不允许执行 {keyword} 操作，仅支持查询操作"
                    )
        
        # 自动添加LIMIT限制（如果SQL中没有LIMIT）
        if 'LIMIT' not in sql_upper and request.limit > 0:
            sql_query = f"{sql_query.rstrip(';')} LIMIT {request.limit}"
        
        logger.info(f"执行DuckDB查询: {sql_query}")
        logger.info(f"可用表: {available_tables}")
        
        # 执行查询
        result_df = con.execute(sql_query).fetchdf()
        
        execution_time = (time.time() - start_time) * 1000
        
        # 处理数据类型转换
        for col in result_df.columns:
            if result_df[col].dtype == 'object':
                result_df[col] = result_df[col].astype(str)
        
        # 可选：保存查询结果为新表
        saved_table = None
        if request.save_as_table:
            table_name = request.save_as_table.strip()
            if table_name:
                try:
                    # 创建新表
                    create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({sql_query.rstrip(";").replace(f"LIMIT {request.limit}", "")})'
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
            message=f"查询成功，返回 {len(result_df)} 行数据"
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
            "sql": sql_query
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
                detail=f"表 '{table_name}' 不存在。可用的表: {', '.join(available_tables)}"
            )
        
        # 获取表结构
        schema_df = con.execute(f'DESCRIBE "{table_name}"').fetchdf()
        
        # 获取表统计信息
        count_result = con.execute(f'SELECT COUNT(*) as count FROM "{table_name}"').fetchone()
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
            "sample_data": sample_df.to_dict(orient="records")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取表结构失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表结构失败: {str(e)}")
