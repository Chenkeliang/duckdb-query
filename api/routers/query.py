from fastapi import APIRouter, Body, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from models.query_models import QueryRequest
from core.duckdb_engine import get_db_connection, execute_query
import pandas as pd
import numpy as np
import io
import os
import traceback
import logging
import re

# 设置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

router = APIRouter()


def get_join_type_sql(join_type):
    """将前端的join类型转换为正确的SQL JOIN语法"""
    join_type = join_type.lower()
    if join_type == "inner":
        return "INNER JOIN"
    elif join_type == "left":
        return "LEFT JOIN"
    elif join_type == "right":
        return "RIGHT JOIN"
    elif join_type == "outer":
        return "FULL OUTER JOIN"  # 外连接的正确SQL语法
    else:
        return "INNER JOIN"  # 默认使用内连接


def safe_alias(table, col):
    import re

    col_safe = re.sub(r"[^a-zA-Z0-9_]", "_", col)
    alias = f"{table}_{col_safe}"
    # 保证别名以字母或下划线开头
    if not re.match(r"^[a-zA-Z_]", alias):
        alias = f"col_{alias}"
    return f'"{alias}"'


@router.post("/api/query", tags=["Query"])
async def perform_query(query_request: QueryRequest):
    """Performs a join query on the specified data sources."""
    con = get_db_connection()

    try:
        # 确保文件存在并可访问
        for source in query_request.sources:
            if source.type == "file":
                file_path = source.params["path"]
                if not os.path.exists(file_path):
                    raise ValueError(f"文件不存在: {file_path}")

                logger.info(f"注册数据源: {source.id}, 路径: {file_path}")

                # 优先尝试用duckdb的EXCEL扩展直接读取
                try:
                    con.execute("INSTALL excel;")
                except Exception:
                    pass
                try:
                    con.execute("LOAD excel;")
                except Exception:
                    pass
                try:
                    duckdb_query = f"SELECT * FROM EXCEL_SCAN('{file_path}') LIMIT 1"
                    con.execute(duckdb_query).fetchdf()
                    con.execute(
                        f"CREATE OR REPLACE TABLE \"{source.id}\" AS SELECT * FROM EXCEL_SCAN('{file_path}')"
                    )
                    logger.info(f"使用duckdb EXCEL_SCAN 注册表: {source.id}")
                except Exception as duckdb_exc:
                    logger.warning(
                        f"duckdb EXCEL_SCAN 读取失败，降级为pandas: {duckdb_exc}"
                    )
                    df = pd.read_excel(file_path, dtype=str)
                    con.register(source.id, df)
                    logger.info(
                        f"已用pandas.read_excel注册表: {source.id}, shape: {df.shape}"
                    )

        # 获取当前可用的表
        available_tables = con.execute("SHOW TABLES").fetchdf()
        available_table_names = (
            available_tables["name"].tolist() if not available_tables.empty else []
        )
        logger.info(f"当前DuckDB中的表: {available_tables.to_string()}")

        # 构建查询 - 确保表名使用双引号括起来
        if len(query_request.joins) > 0:
            join = query_request.joins[0]
            left_table_id = join.left_source_id.strip('"')
            right_table_id = join.right_source_id.strip('"')
            # 直接用注册的表名
            left_alias = left_table_id
            right_alias = right_table_id
            left_cols = (
                con.execute(f"PRAGMA table_info('{left_table_id}')")
                .fetchdf()["name"]
                .tolist()
            )
            right_cols = (
                con.execute(f"PRAGMA table_info('{right_table_id}')")
                .fetchdf()["name"]
                .tolist()
            )
            # 拼接select字段，字段名和别名都用英文双引号包裹
            left_select = [
                f'"{left_alias}"."{col}" AS "A_{i+1}"'
                for i, col in enumerate(left_cols)
            ]
            right_select = [
                f'"{right_alias}"."{col}" AS "B_{i+1}"'
                for i, col in enumerate(right_cols)
            ]
            select_fields = left_select + right_select
            select_clause = ", ".join(select_fields)
            join_type_sql = get_join_type_sql(join.how)
            # ON条件部分也用双引号包裹表名和字段名
            on_clause = (
                f'"{left_alias}"."{join.left_on}" = "{right_alias}"."{join.right_on}"'
            )
            query = f'SELECT {select_clause} FROM "{left_alias}" {join_type_sql} "{right_alias}" ON {on_clause}'
        else:
            source_id = query_request.sources[0].id.strip('"')
            if source_id not in available_table_names:
                error_msg = f"无法执行查询，表 '{source_id}' 不存在。可用的表: {', '.join(available_table_names)}"
                logger.error(error_msg)
                raise ValueError(error_msg)
            query = f'SELECT * FROM "{source_id}"'

        logger.info(f"执行查询: {query}")

        # 执行查询
        result_df = execute_query(query, con)
        logger.info(f"查询完成，结果形状: {result_df.shape}")

        # Replace NaN/inf with None, which is JSON serializable to null
        result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        # 更彻底地将所有NaN转为None，防止JSON序列化报错
        result_df = result_df.astype(object).where(pd.notnull(result_df), None)

        # Convert non-serializable types to strings
        for col in result_df.columns:
            if result_df[col].dtype == "object":
                result_df[col] = result_df[col].astype(str)

        result = {
            "data": result_df.to_dict(orient="records"),
            "columns": result_df.columns.tolist(),
            "index": result_df.index.tolist(),
            "sql": query,  # 返回完整SQL
        }

        return jsonable_encoder(result)
    except Exception as e:
        logger.error(f"查询失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"查询处理失败: {str(e)}")


@router.post("/api/download", tags=["Query"])
async def download_results(query_request: QueryRequest):
    """Performs a query and returns the results as an Excel file."""
    con = get_db_connection()

    try:
        # Register all data sources with DuckDB
        for source in query_request.sources:
            if source.type == "file":
                file_path = source.params["path"]
                if not os.path.exists(file_path):
                    raise ValueError(f"文件不存在: {file_path}")

                # 优先尝试用duckdb的EXCEL扩展直接读取
                try:
                    con.execute("INSTALL excel;")
                except Exception:
                    pass
                try:
                    con.execute("LOAD excel;")
                except Exception:
                    pass
                try:
                    duckdb_query = f"SELECT * FROM EXCEL_SCAN('{file_path}') LIMIT 1"
                    con.execute(duckdb_query).fetchdf()
                    con.execute(
                        f"CREATE OR REPLACE TABLE \"{source.id}\" AS SELECT * FROM EXCEL_SCAN('{file_path}')"
                    )
                    logger.info(f"使用duckdb EXCEL_SCAN 注册表: {source.id}")
                except Exception as duckdb_exc:
                    logger.warning(
                        f"duckdb EXCEL_SCAN 读取失败，降级为pandas: {duckdb_exc}"
                    )
                    df = pd.read_excel(file_path, dtype=str)
                    con.register(source.id, df)
                    logger.info(
                        f"已用pandas.read_excel注册表: {source.id}, shape: {df.shape}"
                    )

        # Build the query based on joins - 确保表名使用双引号括起来
        if len(query_request.joins) > 0:
            join = query_request.joins[
                0
            ]  # For simplicity, we're using the first join only
            # 使用双引号括起表名，避免数字表名的语法错误
            left_table_id = join.left_source_id.strip('"')
            right_table_id = join.right_source_id.strip('"')
            join_type_sql = get_join_type_sql(join.how)
            query = f'SELECT * FROM "{left_table_id}" {join_type_sql} "{right_table_id}" ON "{left_table_id}".{join.left_on} = "{right_table_id}".{join.right_on}'
        else:
            # 使用双引号括起表名，同时确保去除可能存在的引号
            source_id = query_request.sources[0].id.strip('"')
            query = f'SELECT * FROM "{source_id}"'

        # Execute query
        result_df = execute_query(query, con)

        # Replace NaN/inf with None, which is JSON serializable to null
        result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        result_df = result_df.where(pd.notnull(result_df), None)

        # Convert to Excel
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            result_df.to_excel(writer, index=False)
        output.seek(0)

        # Return as downloadable file
        filename = "query_results.xlsx"
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers,
        )
    except Exception as e:
        logger.error(f"下载失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"下载处理失败: {str(e)}")


@router.post("/api/execute_sql", tags=["Query"])
async def execute_sql(request: dict = Body(...)):
    """直接执行SQL查询语句，主要用于调试和验证数据源"""
    con = get_db_connection()
    sql_query = request.get("sql", "")
    datasource = request.get("datasource", {})

    try:
        logger.info(f"request type: {type(request)}, content: {request}")
        # 兼容 dict、Pydantic/BaseModel、FormData
        if isinstance(request, dict):
            sql_query = request.get("sql", "")
            datasource = request.get("datasource", {})
        else:
            sql_query = getattr(request, "sql", "")
            datasource = getattr(request, "datasource", {})
        logger.info(f"sql_query: {sql_query}, datasource: {datasource}")
        logger.info(
            f"datasource type: {getattr(datasource, 'type', None) if not isinstance(datasource, dict) else datasource.get('type')}"
        )
        logger.info(
            f"datasource id: {getattr(datasource, 'id', None) if not isinstance(datasource, dict) else datasource.get('id')}"
        )
        logger.info(
            f"datasource params: {getattr(datasource, 'params', None) if not isinstance(datasource, dict) else datasource.get('params')}"
        )
        # 支持 file 类型数据源
        if isinstance(datasource, dict) and datasource.get("type") == "file":
            file_path = datasource["params"]["path"]
            table_id = datasource["id"]
            # 读取文件并注册到 DuckDB
            if file_path.endswith(".csv"):
                df = pd.read_csv(file_path)
            elif file_path.endswith((".xls", ".xlsx")):
                df = pd.read_excel(file_path)
            else:
                raise ValueError("不支持的文件类型")
            con.register(table_id, df)

        # 如果是数据库类型的数据源
        elif isinstance(datasource, dict) and datasource.get("type") in [
            "mysql",
            "postgresql",
            "sqlite",
            "duckdb",
        ]:
            # 注册数据库连接或使用已有连接
            pass
        else:
            raise HTTPException(
                status_code=400, detail=f"不支持的数据库类型: {datasource.get('type')}"
            )

        # 执行SQL查询
        result_df = execute_query(sql_query, con)
        logger.info(f"SQL查询执行完成，结果形状: {result_df.shape}")

        # Replace NaN/inf with None, which is JSON serializable to null
        result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        # 更彻底地将所有NaN转为None，防止JSON序列化报错
        result_df = result_df.astype(object).where(pd.notnull(result_df), None)

        # 将所有不可序列化的数据类型转换为字符串
        for col in result_df.columns:
            # 检查是否有不可序列化的对象类型列
            if result_df[col].dtype == "object":
                # 将可能不可序列化的对象转换为字符串
                result_df[col] = result_df[col].astype(str)

        # 使用to_dict方法，确保所有数据都是可JSON序列化的
        data_records = result_df.to_dict(orient="records")

        # 确保所有列名是字符串类型
        columns_list = [str(col) for col in result_df.columns.tolist()]

        # 返回结果 - 只使用简单的数据结构
        result = {
            "success": True,
            "data": data_records,
            "columns": columns_list,
            "rowCount": len(result_df),
        }

        return result
    except Exception as e:
        logger.error(f"SQL执行失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"SQL执行失败: {str(e)}")
