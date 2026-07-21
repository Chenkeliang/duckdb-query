# pylint: disable=too-many-lines,broad-exception-caught,logging-fstring-interpolation,import-outside-toplevel,line-too-long,unused-argument,bare-except
"""Set operations HTTP routes (extracted from join_query.py)."""
import logging
import os
import uuid
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Iterator, Optional, Set

import duckdb
from core.common.config_manager import config_manager
from core.common.sql_identifiers import quote_identifier
from core.common.utils import describe_query_column_types
from core.database.duckdb_engine import (
    timed_fetch_query_records,
    with_duckdb_connection,
)
from core.database.duckdb_pool import interruptible_connection
from core.database.federated_attach import (
    attach_databases_on_connection,
    detach_databases_on_connection,
    resolve_attach_configs,
)
from core.services.set_operation_generator import format_set_table_reference
from core.services.set_operation_generator import (
    estimate_set_operation_rows,
    generate_set_operation_sql,
)
from fastapi import APIRouter, Header
from models.set_operation_models import (
    SetOperationConfig,
    SetOperationExportRequest,
    SetOperationRequest,
    SetOperationType,
    UnionOperationRequest,
)
from utils.safe_filename import safe_filename_base
from utils.response_helpers import (
    MessageCode,
    create_success_response,
    error_json_response,
)
from core.common.error_codes import classify_exception

logger = logging.getLogger(__name__)


def _timed_execute_fetch(con: Any, sql: str) -> tuple:
    """执行 SQL 并记录慢查询 / 自动 EXPLAIN，返回 (columns, records)。"""
    columns, records, _cursor_types = timed_fetch_query_records(con, sql)
    return columns, records


def _xlsx_safe_projection(con: Any, sql: str) -> str:
    """xlsx 数字单元格物理上是 float64:高精度 DECIMAL(p>15)/(U)BIGINT/HUGEINT
    直接写入会静默失真(如 DECIMAL(38,9) 变 1.23e+19)。这些列 CAST 成文本导出
    (Excel 里显示为文本单元格,但数值逐位精确——财务铁律优先于单元格类型美观)。
    DESCRIBE 失败(多语句等)时原样返回,由 COPY 自行处理。
    """
    try:
        described = con.execute(f"DESCRIBE ({sql.rstrip().rstrip(';')})").fetchall()
    except Exception:  # pylint: disable=broad-exception-caught
        return sql
    projections = []
    needs_wrap = False
    for row in described:
        name, dtype = str(row[0]), str(row[1]).upper()
        quoted = '"' + name.replace('"', '""') + '"'
        lossy = "HUGEINT" in dtype or dtype.startswith(("BIGINT", "UBIGINT"))
        if dtype.startswith(("DECIMAL", "NUMERIC")):
            digits = dtype[dtype.find("(") + 1 : dtype.find(",")] if "(" in dtype else "38"
            try:
                lossy = int(digits) > 15  # float64 有效十进制位约 15-17
            except ValueError:
                lossy = True
        if lossy:
            projections.append(f"CAST({quoted} AS VARCHAR) AS {quoted}")
            needs_wrap = True
        else:
            projections.append(quoted)
    if not needs_wrap:
        return sql
    return f"SELECT {', '.join(projections)} FROM ({sql.rstrip().rstrip(';')})"


router = APIRouter()


@contextmanager
def _set_operation_connection(
    request: SetOperationRequest,
    query_id: Optional[str] = None,
) -> Iterator[tuple[Any, Optional[Set[str]]]]:
    """DuckDB 连接；有 attach_databases 时 ATTACH 并在退出时 DETACH。"""
    conn_ctx = (
        interruptible_connection(query_id, "")
        if query_id
        else with_duckdb_connection()
    )
    with conn_ctx as con:
        attached_aliases: list[str] = []
        alias_set: Optional[Set[str]] = None
        try:
            if request.attach_databases:
                attach_configs = resolve_attach_configs(request.attach_databases)
                attached_aliases = attach_databases_on_connection(con, attach_configs)
                alias_set = {alias.strip() for alias in attached_aliases if alias}
            yield con, alias_set
        finally:
            if attached_aliases:
                detach_databases_on_connection(con, attached_aliases)


@router.post("/api/set-operations/generate", tags=["Set Operations"])
def generate_set_operation_query(request: SetOperationRequest):
    """
    生成集合操作SQL查询

    支持UNION, UNION ALL, EXCEPT, INTERSECT等集合操作
    支持BY NAME模式进行列名映射
    """
    try:
        config = request.config

        with _set_operation_connection(request) as (con, alias_set):
            sql = generate_set_operation_sql(config, attach_aliases=alias_set)
            estimated_rows = estimate_set_operation_rows(
                config, con, alias_set
            )

        # 构建元数据
        metadata = {
            "operation_type": config.operation_type,
            "table_count": len(config.tables),
            "use_by_name": config.use_by_name,
            "estimated_rows": estimated_rows,
            "tables": [
                {
                    "table_name": table.table_name,
                    "selected_columns": table.selected_columns,
                    "alias": table.alias,
                }
                for table in config.tables
            ],
        }

        return create_success_response(
            data={
                "sql": sql,
                "errors": [],
                "warnings": [],
                "metadata": metadata if request.include_metadata else None,
                "estimated_rows": estimated_rows,
            },
            message_code=MessageCode.SET_OPERATION_GENERATED,
        )

    except ValueError as e:
        logger.warning(f"Failed to generate set operation query: {str(e)}")
        return error_json_response(
            400,
            MessageCode.VALIDATION_ERROR,
            str(e),
            details={"errors": [str(e)]},
        )
    except Exception as e:
        logger.error(f"Failed to generate set operation query: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to generate query: {str(e)}",
            details={"errors": [f"Failed to generate query: {str(e)}"]},
        )


@router.post("/api/set-operations/preview", tags=["Set Operations"])
def preview_set_operation(request: SetOperationRequest):
    """
    预览集合操作结果

    执行集合操作查询并返回前几行数据
    """
    try:
        config = request.config

        from core.common.config_manager import config_manager

        preview_limit = config_manager.get_app_config().max_query_rows

        with _set_operation_connection(request) as (con, alias_set):
            sql = generate_set_operation_sql(config, attach_aliases=alias_set)
            preview_sql = f"{sql} LIMIT {preview_limit}"
            _, preview_data = _timed_execute_fetch(con, preview_sql)
            estimated_rows = estimate_set_operation_rows(
                config, con, alias_set
            )

        return create_success_response(
            data={
                "data": preview_data,
                "row_count": len(preview_data),
                "estimated_total_rows": estimated_rows,
                "sql": preview_sql,
                "errors": [],
                "warnings": [],
            },
            message_code=MessageCode.SET_OPERATION_PREVIEWED,
        )

    except ValueError as e:
        logger.warning(f"Failed to preview set operation: {str(e)}")
        return error_json_response(
            400,
            MessageCode.VALIDATION_ERROR,
            str(e),
            details={"errors": [str(e)]},
        )
    except Exception as e:
        logger.error(f"Failed to preview set operation: {str(e)}")
        # 与 join-query 一致地分类（表不存在→404、语法错→400…），不再一律 500（回归 #16）
        code, status = classify_exception(str(e))
        return error_json_response(
            status,
            code,
            f"Failed to preview: {str(e)}",
            details={"errors": [f"Failed to preview: {str(e)}"]},
        )


@router.post("/api/set-operations/validate", tags=["Set Operations"])
def validate_set_operation(request: SetOperationRequest):
    """
    验证集合操作配置

    检查表是否存在、列是否兼容等
    """
    try:
        config = request.config

        errors = []
        warnings = []

        with _set_operation_connection(request) as (con, alias_set):
            for table in config.tables:
                try:
                    table_ref = format_set_table_reference(
                        table.table_name, alias_set
                    )
                    check_sql = f"SELECT COUNT(*) FROM {table_ref}"
                    con.execute(check_sql).fetchone()
                except Exception as e:
                    errors.append(
                        f"Table {table.table_name} does not exist或无法访问: {str(e)}"
                    )

            if not config.use_by_name:
                if len(config.tables) >= 2:
                    first_table = config.tables[0]
                    first_columns = first_table.selected_columns or []

                    for i, table in enumerate(config.tables[1:], 1):
                        table_columns = table.selected_columns or []
                        if len(first_columns) != len(table_columns):
                            errors.append(
                                f"Table {table.table_name} 的列数量({len(table_columns)}) "
                                f"与第一个Table {first_table.table_name} 的列数量({len(first_columns)})不匹配"
                            )

            if config.use_by_name and config.operation_type not in [
                SetOperationType.UNION,
                SetOperationType.UNION_ALL,
            ]:
                errors.append("只有UNION和UNION ALL支持BY NAME模式")

            if len(config.tables) > 5:
                warnings.append("表数量较多，查询性能可能较慢")

        is_valid = len(errors) == 0
        return create_success_response(
            data={
                "is_valid": is_valid,
                "errors": errors,
                "warnings": warnings,
                "table_count": len(config.tables),
                "operation_type": config.operation_type,
                "use_by_name": config.use_by_name,
            },
            message_code=MessageCode.SET_OPERATION_VALIDATED
            if is_valid
            else MessageCode.VALIDATION_ERROR,
        )

    except Exception as e:
        logger.error(f"Failed to validate set operation: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to validate: {str(e)}",
            details={"errors": [f"Failed to validate: {str(e)}"]},
        )


@router.post("/api/set-operations/execute", tags=["Set Operations"])
def execute_set_operation(
    request: SetOperationRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """
    执行集合操作查询

    执行完整的集合操作并返回结果
    """
    query_id = f"sync:{x_request_id}" if x_request_id else None
    try:
        config = request.config

        from core.common.config_manager import config_manager

        limit = config_manager.get_app_config().max_query_rows

        with _set_operation_connection(request, query_id) as (con, alias_set):
            # 基础 SQL 统一不带系统 LIMIT(分支/整体都不带):预览时只在最外层追加一次。
            # 旧写法既让生成器按 preview_limit 加、下面又拼一层,分支截断还会改变
            # EXCEPT/INTERSECT 的结果(复审验收 #11)。
            sql = generate_set_operation_sql(config, attach_aliases=alias_set)

            if request.preview:
                # 预览模式：使用配置的max_query_rows限制
                from core.common.config_manager import config_manager

                limit = config_manager.get_app_config().max_query_rows
                preview_sql = f"{sql} LIMIT {limit}"
                col_names, data = _timed_execute_fetch(con, preview_sql)
                # 列类型用 DESCRIBE 的真实 DuckDB 类型（此前的 pandas dtype
                # 字符串在保真帧下会大面积显示 "object"，信息是错的）
                described = {
                    c["name"]: c["duckdb_type"]
                    for c in describe_query_column_types(con, preview_sql)
                }
                columns = [
                    {"name": name, "type": described.get(name, "")}
                    for name in col_names
                ]

                return create_success_response(
                    data={
                        "data": data,
                        "row_count": len(data),
                        "column_count": len(columns),
                        "columns": columns,
                        "sql": sql,
                        "sqlQuery": sql,
                        "originalDatasource": {
                            "type": "set_operation",
                            "operation": config.operation_type,
                            "tables": [source.table_name for source in config.tables],
                        },
                        "isSetOperation": True,
                        "setOperationConfig": config.model_dump()
                        if hasattr(config, "model_dump")
                        else config.dict(),
                        "errors": [],
                        "warnings": [],
                    },
                    message_code=MessageCode.SET_OPERATION_PREVIEWED,
                )
            elif request.save_as_table:
                # 保存到表模式：直接创建表，不使用fetchdf避免内存溢出
                table_name = request.save_as_table.strip()
                logger.info(f"Starting to save set operation result to table: {table_name}")

                # 检查表名是否已存在
                existing_table_names = [
                    row[0] for row in con.execute("SHOW TABLES").fetchall()
                ]

                if table_name in existing_table_names:
                    logger.warning(f"Table {table_name} already exists，will be replaced")

                # 直接创建表，不使用fetchdf(表名走 quote_identifier 转义防注入)
                create_sql = f'CREATE OR REPLACE TABLE {quote_identifier(table_name)} AS ({sql})'
                logger.info(f"Executing create table SQL: {create_sql}")
                con.execute(create_sql)

                # 获取统计信息（不使用fetchdf）
                row_count_result = con.execute(
                    f'SELECT COUNT(*) FROM "{table_name}"'
                ).fetchone()
                row_count = row_count_result[0] if row_count_result else 0

                # 获取列信息（使用LIMIT 1避免大数据集问题）
                sample_sql = f'SELECT * FROM "{table_name}" LIMIT 1'
                sample_df = _timed_execute_fetch(con, sample_sql)
                columns = [
                    {"name": col, "type": str(sample_df[col].dtype)}
                    for col in sample_df.columns
                ]

                logger.info(f"Table {table_name} created successfully，rows: {row_count}")

                return create_success_response(
                    data={
                        "saved_table": table_name,
                        "table_alias": table_name,
                        "row_count": row_count,
                        "column_count": len(columns),
                        "columns": columns,
                        "sql": sql,
                        "sqlQuery": sql,
                        "originalDatasource": {
                            "type": "set_operation",
                            "operation": config.operation_type,
                            "tables": [source.table_name for source in config.tables],
                        },
                        "isSetOperation": True,
                        "setOperationConfig": config.model_dump()
                        if hasattr(config, "model_dump")
                        else config.dict(),
                        "errors": [],
                        "warnings": [],
                    },
                    message_code=MessageCode.SET_OPERATION_EXECUTED,
                    message=f"Set operation result has been saved to table: {table_name}, total {row_count:,} rows.",
                )
            else:
                # 默认行为：执行集合操作预览，使用配置的max_query_rows限制
                from core.common.config_manager import config_manager

                limit = config_manager.get_app_config().max_query_rows
                preview_sql = f"{sql} LIMIT {limit}"
                col_names, data = _timed_execute_fetch(con, preview_sql)
                # 列类型用 DESCRIBE 的真实 DuckDB 类型（此前的 pandas dtype
                # 字符串在保真帧下会大面积显示 "object"，信息是错的）
                described = {
                    c["name"]: c["duckdb_type"]
                    for c in describe_query_column_types(con, preview_sql)
                }
                columns = [
                    {"name": name, "type": described.get(name, "")}
                    for name in col_names
                ]

                return create_success_response(
                    data={
                        "data": data,
                        "row_count": len(data),
                        "column_count": len(columns),
                        "columns": columns,
                        "sql": sql,
                        "sqlQuery": sql,
                        "originalDatasource": {
                            "type": "set_operation",
                            "operation": config.operation_type,
                            "tables": [source.table_name for source in config.tables],
                        },
                        "isSetOperation": True,
                        "setOperationConfig": config.model_dump()
                        if hasattr(config, "model_dump")
                        else config.dict(),
                        "errors": [],
                        "warnings": [],
                    },
                    message_code=MessageCode.SET_OPERATION_EXECUTED,
                )

    except duckdb.InterruptException as e:
        logger.info("Set operation %s cancelled by user", query_id)
        return error_json_response(
            499,
            MessageCode.QUERY_CANCELLED,
            "Query cancelled",
            details={"query_id": query_id, "error": str(e)},
        )
    except ValueError as e:
        logger.warning(f"Failed to execute set operation: {str(e)}")
        return error_json_response(
            400,
            MessageCode.VALIDATION_ERROR,
            str(e),
            details={"errors": [str(e)]},
        )
    except Exception as e:
        logger.error(f"Failed to execute set operation: {str(e)}")
        code, status = classify_exception(str(e))
        return error_json_response(
            status,
            code,
            f"Failed to execute: {str(e)}",
            details={"errors": [f"Failed to execute: {str(e)}"]},
        )


@router.post("/api/set-operations/simple-union", tags=["Set Operations"])
def simple_union_operation(request: UnionOperationRequest):
    """
    简化的UNION操作

    提供简化的UNION操作接口，只需要表名列表
    """
    try:
        tables = request.tables
        operation_type = request.operation_type
        use_by_name = request.use_by_name
        column_mappings = request.column_mappings

        # 构建简化的配置
        table_configs = []
        for table_name in tables:
            table_config = {
                "table_name": table_name,
                "selected_columns": [],  # 使用所有列
                "alias": None,
            }

            # 如果有列映射，添加到配置中
            if use_by_name and column_mappings and table_name in column_mappings:
                table_config["column_mappings"] = column_mappings[table_name]

            table_configs.append(table_config)

        # 创建集合操作配置
        config = SetOperationConfig(
            operation_type=operation_type, tables=table_configs, use_by_name=use_by_name
        )

        # 生成SQL查询
        sql = generate_set_operation_sql(config)

        # 估算结果行数（简化 UNION 不支持 attach，无别名）
        with with_duckdb_connection() as con:
            estimated_rows = estimate_set_operation_rows(config, con)

        return create_success_response(
            data={
                "sql": sql,
                "estimated_rows": estimated_rows,
                "table_count": len(tables),
                "operation_type": operation_type,
                "use_by_name": use_by_name,
                "errors": [],
                "warnings": [],
            },
            message_code=MessageCode.SET_OPERATION_GENERATED,
        )

    except ValueError as e:
        logger.warning(f"Failed to simplify UNION operation: {str(e)}")
        return error_json_response(
            400,
            MessageCode.VALIDATION_ERROR,
            str(e),
            details={"errors": [str(e)]},
        )
    except Exception as e:
        logger.error(f"Failed to simplify UNION operation: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to operate: {str(e)}",
            details={"errors": [f"Failed to operate: {str(e)}"]},
        )


@router.post("/api/set-operations/export", tags=["Set Operations"])
def export_set_operation(request: SetOperationExportRequest):
    """
    集合操作异步导出 - 使用DuckDB COPY命令

    支持Excel、CSV、Parquet格式，使用DuckDB COPY命令直接导出完整数据，
    避免内存限制问题。
    """
    from concurrent.futures import ThreadPoolExecutor

    from core.services.task_manager import task_manager

    try:
        config = request.config
        export_format = request.format
        custom_filename = request.filename

        logger.info(
            f"Starting set operation export: format={export_format}, operation_type={config.operation_type}"
        )

        # 生成完整SQL（无LIMIT）
        sql = generate_set_operation_sql(config)
        logger.info(f"Generated complete SQL: {sql}")

        # 创建异步导出任务
        task_id = str(uuid.uuid4())

        # 生成文件名
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        operation_name = config.operation_type.replace(" ", "_").lower()
        # custom_filename 必须先清洗：它会拼进磁盘路径和 COPY ... TO '...'，
        # 未清洗可 ../ 穿越目录、单引号打断 COPY SQL（见 safe_filename_base）。
        # 清洗后为空则回退到生成名。
        base_filename = (
            safe_filename_base(custom_filename)
            or f"set_operation_{operation_name}_{timestamp}"
        )

        # 根据格式确定文件扩展名和DuckDB COPY格式
        if export_format == "csv":
            file_extension = "csv"
            copy_format = "CSV"
            copy_options = "HEADER"
        elif export_format == "parquet":
            file_extension = "parquet"
            copy_format = "PARQUET"
            copy_options = ""
        elif export_format == "excel":
            file_extension = "xlsx"
            copy_format = "CSV"  # 先导出为CSV，然后转换为Excel
            copy_options = "HEADER"
        else:
            raise ValueError(f"Unsupported export format: {export_format}")

        # 构建文件路径
        filename = f"{base_filename}.{file_extension}"
        exports_dir = str(config_manager.get_exports_dir())
        os.makedirs(exports_dir, exist_ok=True)
        file_path = os.path.join(exports_dir, filename)

        # 创建任务记录
        task_info = {
            "task_id": task_id,
            "type": "set_operation_export",
            "status": "running",
            "created_at": datetime.now().isoformat(),
            "config": config.dict(),
            "format": export_format,
            "filename": filename,
            "file_path": file_path,
            "progress": 0,
            "message": "正在准备导出...",
        }

        # 注册任务
        task_manager.add_task(task_id, task_info)

        # 在后台线程中执行导出任务
        def export_task():
            try:
                # 更新任务状态
                task_manager.update_task(
                    task_id,
                    {
                        "status": "running",
                        "progress": 10,
                        "message": "正在连接数据库...",
                    },
                )

                with with_duckdb_connection() as con:
                    task_manager.update_task(
                        task_id, {"progress": 30, "message": "正在执行查询..."}
                    )

                    if export_format == "excel":
                        # excel 扩展原生写 xlsx（桌面预置/Docker 预装）。
                        # 此前经 CSV 中转 + pandas 重读会丢类型语义且双倍 I/O
                        try:
                            con.execute("LOAD excel")
                        except Exception:  # 已加载时无害；真缺失由 COPY 报错
                            pass
                        xlsx_sql = _xlsx_safe_projection(con, sql)
                        copy_sql = (
                            f"COPY ({xlsx_sql}) TO '{file_path}' "
                            f"(FORMAT xlsx, HEADER true)"
                        )

                        logger.info(f"Executing Excel export: {copy_sql}")
                        con.execute(copy_sql)

                    else:
                        copy_sql = (
                            f"COPY ({sql}) TO '{file_path}' (FORMAT {copy_format}, {copy_options})"
                        )

                        logger.info(f"Executing export: {copy_sql}")
                        con.execute(copy_sql)

                    if not os.path.exists(file_path):
                        raise RuntimeError("Export file not created")

                    file_size = os.path.getsize(file_path)

                    task_manager.update_task(
                        task_id,
                        {
                            "status": "completed",
                            "progress": 100,
                            "message": f"导出完成，文件size: {file_size / 1024 / 1024:.2f} MB",
                            "file_size": file_size,
                            "download_url": f"/api/async-tasks/{task_id}/download",
                        },
                    )

                    logger.info(
                        f"Set operation export completed: {filename}, size: {file_size} bytes"
                    )

            except Exception as e:
                logger.error(f"Export taskFailed to execute: {str(e)}")
                task_manager.update_task(
                    task_id,
                    {
                        "status": "failed",
                        "progress": 0,
                        "message": f"导出失败: {str(e)}",
                        "error": str(e),
                    },
                )

        # 在后台线程中执行导出任务
        executor = ThreadPoolExecutor(max_workers=1)
        executor.submit(export_task)

        return create_success_response(
            data={
                "task_id": task_id,
                "filename": filename,
                "format": export_format,
            },
            message_code=MessageCode.SET_OPERATION_EXPORTED,
            message="Export task created, please check async task list later",
        )

    except Exception as e:
        logger.error(f"Failed to export set operation: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to create export task: {str(e)}",
            details={"error": str(e)},
        )
