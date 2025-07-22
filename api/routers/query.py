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
    elif join_type == "outer" or join_type == "full_outer":
        return "FULL OUTER JOIN"  # 外连接的正确SQL语法
    elif join_type == "cross":
        return "CROSS JOIN"
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

                # 根据文件扩展名选择合适的读取方法
                file_extension = file_path.lower().split(".")[-1]

                if file_extension in ["xlsx", "xls"]:
                    # Excel文件处理
                    try:
                        con.execute("INSTALL excel;")
                        con.execute("LOAD excel;")
                        duckdb_query = (
                            f"SELECT * FROM EXCEL_SCAN('{file_path}') LIMIT 1"
                        )
                        con.execute(duckdb_query).fetchdf()
                        con.execute(
                            f"CREATE OR REPLACE TABLE \"{source.id}\" AS SELECT * FROM EXCEL_SCAN('{file_path}')"
                        )
                        logger.info(f"使用duckdb EXCEL_SCAN 注册Excel表: {source.id}")
                    except Exception as duckdb_exc:
                        logger.warning(
                            f"duckdb EXCEL_SCAN 读取失败，降级为pandas: {duckdb_exc}"
                        )
                        df = pd.read_excel(file_path, dtype=str)
                        con.register(source.id, df)
                        logger.info(
                            f"已用pandas.read_excel注册表: {source.id}, shape: {df.shape}"
                        )

                elif file_extension == "csv":
                    # CSV文件处理
                    try:
                        # 使用DuckDB的CSV读取功能
                        con.execute(
                            f"CREATE OR REPLACE TABLE \"{source.id}\" AS SELECT * FROM read_csv_auto('{file_path}')"
                        )
                        logger.info(f"使用duckdb read_csv_auto 注册CSV表: {source.id}")
                    except Exception as duckdb_exc:
                        logger.warning(
                            f"duckdb read_csv_auto 读取失败，降级为pandas: {duckdb_exc}"
                        )
                        df = pd.read_csv(file_path, dtype=str)
                        con.register(source.id, df)
                        logger.info(
                            f"已用pandas.read_csv注册表: {source.id}, shape: {df.shape}"
                        )

                else:
                    # 其他文件类型，尝试pandas通用读取
                    logger.warning(f"未知文件类型: {file_extension}，尝试pandas读取")
                    try:
                        df = pd.read_csv(file_path, dtype=str)  # 默认尝试CSV
                        con.register(source.id, df)
                        logger.info(
                            f"已用pandas.read_csv注册表: {source.id}, shape: {df.shape}"
                        )
                    except Exception:
                        df = pd.read_excel(file_path, dtype=str)  # 再尝试Excel
                        con.register(source.id, df)
                        logger.info(
                            f"已用pandas.read_excel注册表: {source.id}, shape: {df.shape}"
                        )

            elif source.type in ["mysql", "postgresql", "sqlite"]:
                # 处理数据库数据源 - 支持两种模式：connectionId 和 直接连接参数
                connection_id = source.params.get("connectionId")

                if connection_id:
                    # 模式1：使用预先保存的数据库连接
                    logger.info(
                        f"处理数据库数据源: {source.id}, 连接ID: {connection_id}"
                    )

                    from core.database_manager import db_manager

                    try:
                        # 获取数据库连接配置
                        db_connection = db_manager.get_connection(connection_id)
                        if not db_connection:
                            raise ValueError(f"未找到数据库连接: {connection_id}")

                        # 执行查询获取数据
                        if hasattr(db_connection.params, "query"):
                            query = db_connection.params.get(
                                "query", "SELECT * FROM dy_order LIMIT 1000"
                            )
                        else:
                            query = "SELECT * FROM dy_order LIMIT 1000"  # 默认查询

                        df = db_manager.execute_query(connection_id, query)
                        con.register(source.id, df)
                        logger.info(f"已注册数据库表: {source.id}, shape: {df.shape}")

                    except Exception as db_error:
                        logger.error(f"数据库连接处理失败: {db_error}")
                        raise ValueError(
                            f"数据库连接处理失败: {source.id}, 错误: {str(db_error)}"
                        )
                else:
                    # 模式2：直接使用连接参数
                    logger.info(f"处理直接连接数据库数据源: {source.id}")

                    try:
                        from sqlalchemy import create_engine

                        # 获取连接参数
                        host = source.params.get("host", "localhost")
                        port = source.params.get(
                            "port", 3306 if source.type == "mysql" else 5432
                        )
                        user = source.params.get("user", "")
                        password = source.params.get("password", "")
                        database = source.params.get("database", "")
                        query = source.params.get("query", "SELECT 1 as test")

                        if not all([host, user, database, query]):
                            raise ValueError(f"数据库连接参数不完整: {source.id}")

                        # 创建连接字符串
                        if source.type == "mysql":
                            connection_str = f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"
                        elif source.type == "postgresql":
                            connection_str = f"postgresql://{user}:{password}@{host}:{port}/{database}"
                        elif source.type == "sqlite":
                            connection_str = f"sqlite:///{database}"
                        else:
                            raise ValueError(f"不支持的数据库类型: {source.type}")

                        # 创建引擎并执行查询
                        engine = create_engine(connection_str)
                        df = pd.read_sql(query, engine)

                        # 注册到DuckDB
                        con.register(source.id, df)
                        logger.info(
                            f"已注册直接连接数据库表: {source.id}, shape: {df.shape}"
                        )

                    except Exception as direct_db_error:
                        logger.error(f"直接数据库连接失败: {direct_db_error}")
                        raise ValueError(
                            f"直接数据库连接失败: {source.id}, 错误: {str(direct_db_error)}"
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
            join_type_sql = get_join_type_sql(join.join_type)
            # ON条件部分也用双引号包裹表名和字段名
            if join.conditions and len(join.conditions) > 0:
                condition = join.conditions[0]  # 使用第一个条件
                on_clause = f'"{left_alias}"."{condition.left_column}" {condition.operator} "{right_alias}"."{condition.right_column}"'
            else:
                # 如果没有条件，使用默认的 CROSS JOIN
                on_clause = "1=1"
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
            join_type_sql = get_join_type_sql(join.join_type)

            # 构建 JOIN 条件
            if join.conditions and len(join.conditions) > 0:
                condition = join.conditions[0]  # 使用第一个条件
                left_column = condition.left_column
                right_column = condition.right_column
                operator = condition.operator
                query = f'SELECT * FROM "{left_table_id}" {join_type_sql} "{right_table_id}" ON "{left_table_id}".{left_column} {operator} "{right_table_id}".{right_column}'
            else:
                # 如果没有条件，使用 CROSS JOIN
                query = f'SELECT * FROM "{left_table_id}" CROSS JOIN "{right_table_id}"'
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
            # 支持多种参数格式
            if "params" in datasource and "path" in datasource["params"]:
                file_path = datasource["params"]["path"]
            elif "path" in datasource:
                file_path = datasource["path"]
            else:
                # 如果没有指定路径，尝试从temp_files目录查找
                filename = datasource.get("filename") or datasource.get("id", "")
                if filename:
                    temp_dir = os.path.join(
                        os.path.dirname(os.path.dirname(__file__)), "temp_files"
                    )
                    file_path = os.path.join(temp_dir, filename)
                else:
                    raise ValueError("缺少文件路径参数")

            table_id = datasource.get("id", "temp_table")

            # 检查文件是否存在
            if not os.path.exists(file_path):
                raise ValueError(f"文件不存在: {file_path}")

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


@router.post("/api/execute_simple_sql", tags=["Query"])
async def execute_simple_sql(request: dict = Body(...)):
    """简化的SQL执行，支持对已上传文件的查询"""
    con = get_db_connection()
    sql_query = request.get("sql", "")
    filename = request.get("filename", "")

    try:
        logger.info(f"执行简单SQL: {sql_query}, 文件: {filename}")

        # 验证SQL查询不为空
        if not sql_query or sql_query.strip() == "":
            raise ValueError("SQL查询不能为空")

        if filename:
            # 构建文件路径
            temp_dir = os.path.join(
                os.path.dirname(os.path.dirname(__file__)), "temp_files"
            )
            file_path = os.path.join(temp_dir, filename)

            if not os.path.exists(file_path):
                raise ValueError(f"文件不存在: {filename}")

            # 读取文件并注册到 DuckDB
            table_name = filename.split(".")[0]  # 使用文件名作为表名

            if file_path.endswith(".csv"):
                df = pd.read_csv(file_path)
            elif file_path.endswith((".xls", ".xlsx")):
                df = pd.read_excel(file_path)
            else:
                raise ValueError("不支持的文件类型")

            con.register(table_name, df)
            logger.info(f"已注册表: {table_name}, 行数: {len(df)}")

        # 执行SQL查询
        result_df = execute_query(sql_query, con)
        logger.info(f"SQL查询执行完成，结果形状: {result_df.shape}")

        # 处理数据类型
        result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        result_df = result_df.astype(object).where(pd.notnull(result_df), None)

        for col in result_df.columns:
            if result_df[col].dtype == "object":
                result_df[col] = result_df[col].astype(str)

        data_records = result_df.to_dict(orient="records")
        columns_list = [str(col) for col in result_df.columns.tolist()]

        result = {
            "success": True,
            "data": data_records,
            "columns": columns_list,
            "rowCount": len(result_df),
        }

        return result
    except Exception as e:
        logger.error(f"简单SQL执行失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"简单SQL执行失败: {str(e)}")


@router.post("/api/multi_table_query", tags=["Query"])
async def multi_table_query(request: dict = Body(...)):
    """多表查询API，支持JOIN操作"""
    con = get_db_connection()

    try:
        files = request.get("files", [])
        sql_query = request.get("sql", "")

        logger.info(f"多表查询: {sql_query}")
        logger.info(f"涉及文件: {files}")

        # 注册所有文件到DuckDB
        temp_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "temp_files"
        )

        for filename in files:
            file_path = os.path.join(temp_dir, filename)
            if not os.path.exists(file_path):
                raise ValueError(f"文件不存在: {filename}")

            table_name = filename.split(".")[0]  # 使用文件名作为表名

            if file_path.endswith(".csv"):
                df = pd.read_csv(file_path)
            elif file_path.endswith((".xls", ".xlsx")):
                df = pd.read_excel(file_path)
            else:
                raise ValueError(f"不支持的文件类型: {filename}")

            con.register(table_name, df)
            logger.info(f"已注册表: {table_name}, 行数: {len(df)}")

        # 执行SQL查询
        result_df = execute_query(sql_query, con)
        logger.info(f"多表查询执行完成，结果形状: {result_df.shape}")

        # 处理数据类型
        result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        result_df = result_df.astype(object).where(pd.notnull(result_df), None)

        for col in result_df.columns:
            if result_df[col].dtype == "object":
                result_df[col] = result_df[col].astype(str)

        data_records = result_df.to_dict(orient="records")
        columns_list = [str(col) for col in result_df.columns.tolist()]

        result = {
            "success": True,
            "data": data_records,
            "columns": columns_list,
            "rowCount": len(result_df),
        }

        return result
    except Exception as e:
        logger.error(f"多表查询失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"多表查询失败: {str(e)}")


@router.post("/api/export_simple", tags=["Query"])
async def export_simple(request: dict = Body(...)):
    """简化的数据导出API"""
    con = get_db_connection()

    try:
        filename = request.get("filename", "")
        sql_query = request.get("sql", "SELECT * FROM table_name LIMIT 100")
        export_format = request.get("format", "excel")  # excel, csv

        if not filename:
            raise ValueError("缺少文件名参数")

        if not sql_query or sql_query.strip() == "":
            raise ValueError("SQL查询不能为空")

        # 注册文件到DuckDB
        temp_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "temp_files"
        )
        file_path = os.path.join(temp_dir, filename)

        if not os.path.exists(file_path):
            raise ValueError(f"文件不存在: {filename}")

        table_name = filename.split(".")[0]

        if file_path.endswith(".csv"):
            df = pd.read_csv(file_path)
        elif file_path.endswith((".xls", ".xlsx")):
            df = pd.read_excel(file_path)
        else:
            raise ValueError(f"不支持的文件类型: {filename}")

        con.register(table_name, df)

        # 执行查询
        result_df = execute_query(sql_query, con)

        # 导出数据
        if export_format.lower() == "excel":
            try:
                output = io.BytesIO()
                with pd.ExcelWriter(output, engine="openpyxl") as writer:
                    result_df.to_excel(writer, index=False, sheet_name="Data")
                output.seek(0)

                return StreamingResponse(
                    io.BytesIO(output.read()),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={
                        "Content-Disposition": f"attachment; filename=export_{table_name}.xlsx"
                    },
                )
            except Exception as excel_error:
                logger.warning(f"Excel导出失败，降级为JSON: {excel_error}")
                # 如果Excel导出失败，降级为JSON格式
                return {
                    "success": True,
                    "data": result_df.to_dict(orient="records"),
                    "columns": result_df.columns.tolist(),
                    "rowCount": len(result_df),
                    "message": f"Excel导出失败，已转为JSON格式: {str(excel_error)}",
                }

        elif export_format.lower() == "csv":
            output = io.StringIO()
            result_df.to_csv(output, index=False)
            output.seek(0)

            return StreamingResponse(
                io.BytesIO(output.getvalue().encode("utf-8")),
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename=export_{table_name}.csv"
                },
            )

        else:
            return {
                "success": True,
                "data": result_df.to_dict(orient="records"),
                "columns": result_df.columns.tolist(),
                "rowCount": len(result_df),
                "message": "数据导出成功（JSON格式）",
            }

    except Exception as e:
        logger.error(f"数据导出失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"数据导出失败: {str(e)}")


@router.post("/api/save_query_result_as_datasource", tags=["Query"])
async def save_query_result_as_datasource(request: dict = Body(...)):
    """将SQL查询结果保存为新的数据源"""
    con = get_db_connection()
    sql_query = request.get("sql", "")
    datasource_name = request.get("datasource_name", "")
    original_datasource = request.get("datasource", {})

    try:
        logger.info(f"保存查询结果为数据源: {datasource_name}")

        # 验证输入参数
        if not sql_query or sql_query.strip() == "":
            raise ValueError("SQL查询不能为空")

        if not datasource_name or datasource_name.strip() == "":
            raise ValueError("数据源名称不能为空")

        # 首先注册原始数据源（如果需要）
        if original_datasource:
            await register_datasource_for_query(con, original_datasource)

        # 执行SQL查询获取结果
        result_df = execute_query(sql_query, con)

        if result_df.empty:
            raise ValueError("查询结果为空，无法保存为数据源")

        # 生成唯一的数据源ID
        import uuid

        datasource_id = f"query_result_{uuid.uuid4().hex[:8]}"

        # 将查询结果注册为新的数据源
        con.register(datasource_id, result_df)

        # 保存到临时文件以便持久化
        temp_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "temp_files"
        )
        os.makedirs(temp_dir, exist_ok=True)

        # 保存为CSV文件
        csv_filename = f"{datasource_id}.csv"
        csv_path = os.path.join(temp_dir, csv_filename)
        result_df.to_csv(csv_path, index=False)

        logger.info(f"查询结果已保存为数据源: {datasource_id}, 文件: {csv_filename}")

        return {
            "success": True,
            "message": f"查询结果已保存为数据源: {datasource_name}",
            "datasource_id": datasource_id,
            "datasource_name": datasource_name,
            "filename": csv_filename,
            "rowCount": len(result_df),
            "columns": result_df.columns.tolist(),
            "datasource": {
                "id": datasource_id,
                "name": datasource_name,
                "type": "file",
                "filename": csv_filename,
                "status": "active",
            },
        }

    except Exception as e:
        logger.error(f"保存查询结果失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"保存查询结果失败: {str(e)}")


async def register_datasource_for_query(con, datasource):
    """为查询注册数据源的辅助函数"""
    try:
        if datasource.get("type") == "file":
            # 处理文件数据源
            filename = datasource.get("filename", "")
            if filename:
                temp_dir = os.path.join(
                    os.path.dirname(os.path.dirname(__file__)), "temp_files"
                )
                file_path = os.path.join(temp_dir, filename)

                if os.path.exists(file_path):
                    if file_path.endswith(".csv"):
                        df = pd.read_csv(file_path)
                    elif file_path.endswith((".xls", ".xlsx")):
                        df = pd.read_excel(file_path)
                    else:
                        raise ValueError("不支持的文件类型")

                    con.register(datasource["id"], df)
                    logger.info(f"已注册文件数据源: {datasource['id']}")

        elif datasource.get("type") == "database":
            # 处理数据库数据源
            from core.database_manager import db_manager

            connection_id = datasource.get("connection_id")
            if connection_id:
                query = datasource.get("query", "SELECT * FROM table LIMIT 1000")
                df = db_manager.execute_query(connection_id, query)
                con.register(datasource["id"], df)
                logger.info(f"已注册数据库数据源: {datasource['id']}")

    except Exception as e:
        logger.error(f"注册数据源失败: {str(e)}")
        raise


@router.get("/api/available_tables", tags=["Query"])
async def get_available_tables():
    """获取当前可用的表名列表，用于SQL查询提示"""
    con = get_db_connection()

    try:
        # 获取DuckDB中当前注册的所有表
        tables_df = con.execute("SHOW TABLES").fetchdf()
        table_names = tables_df["name"].tolist() if not tables_df.empty else []

        logger.info(f"当前可用表: {table_names}")

        return {"success": True, "tables": table_names, "count": len(table_names)}

    except Exception as e:
        logger.error(f"获取表列表失败: {str(e)}")
        return {"success": False, "tables": [], "count": 0, "error": str(e)}
