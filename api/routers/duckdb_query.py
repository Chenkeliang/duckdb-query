# pylint: disable=duplicate-code
"""
DuckDB自定义SQL查询路由
基于已加载到DuckDB中的表进行SQL查询
"""

import logging
import os
import re
import threading
import time
import traceback
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

import duckdb
import sqlglot
from sqlglot import exp
from core.common.enhanced_error_handler import get_error_handler
from core.common.config_manager import config_manager
from core.common.sql_identifiers import quote_identifier
from core.common.timezone_utils import (
    format_storage_time_for_response,
    get_current_time_iso,
)
from core.services import table_registry
from core.common.utils import describe_query_column_types
from core.common.sql_mysql_quotes import (
    normalize_mysql_double_quoted_strings_for_duckdb,
)
from core.data.file_datasource_manager import (
    build_table_metadata_snapshot,
    file_datasource_manager,
)
from core.database.database_manager import db_manager
from core.database.duckdb_engine import (
    _is_federated_connection_lost as is_federated_connection_lost,
    _is_read_only_query as is_read_only_query,
    fetch_query_records,
    with_duckdb_connection,
)
from core.database.federated_attach import (
    attach_databases_on_connection,
    configure_mysql_fresh_connections,
    detach_databases_on_connection,
    mysql_remote_cancellation_scope,
    resolve_attach_configs,
    single_threaded_mysql_persistence,
)
from core.database.duckdb_pool import interruptible_connection
from core.database.connection_registry import connection_registry
from core.database.federated_optimizer import optimize_federated_sql
from core.services.resource_manager import save_upload_file
from core.services.table_metadata_service import get_table_metadata
from core.common.exceptions import (
    BaseAPIException,
    DatabaseConnectionError,
    ResourceNotFoundError,
    ValidationError as APIValidationError,
)
from fastapi import APIRouter, Body, File, Form, Header, UploadFile
from models.query_models import FederatedQueryRequest
from pydantic import BaseModel
from routers.query_sql_utils import (
    ensure_query_has_limit,
    has_top_level_limit,
    statement_accepts_limit,
)
from utils.response_helpers import (
    MessageCode,
    create_list_response,
    create_success_response,
    error_json_response,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _log_query_metrics_in_conn(conn, sql: str, start_time: float, row_count: int) -> float:
    """在**连接仍被本请求持有**时记录慢查询指标(可能执行 EXPLAIN)并返回耗时 ms。

    必须在 with interruptible_connection/with_duckdb_connection 块内调用:
    块退出后连接已归还池,可能立刻被并发请求取走,再在其上跑 EXPLAIN 会与
    对方的查询争用同一 DuckDB 连接(结果串号甚至崩溃)。
    """
    from core.database.query_metrics import log_query_duration

    execution_time = (time.time() - start_time) * 1000
    explain_threshold = max(
        config_manager.get_app_config().duckdb_auto_explain_threshold_ms or 0, 0
    )
    log_query_duration(
        conn, sql, execution_time, row_count, explain_threshold_ms=explain_threshold
    )
    return execution_time


def contains_keyword(sql_text: str, keyword: str) -> bool:
    """检测SQL文本中是否包含独立的关键字（忽略字符串字面量内的内容）"""
    pattern = rf"\b{keyword}\b"
    return re.search(pattern, sql_text) is not None


def _uses_mysql_query_table_function(sql: str) -> bool:
    """判断 SQL 是否真实调用 mysql_query，而非仅在注释或字面量中出现。"""
    try:
        tree = sqlglot.parse_one(sql, read="duckdb")
    except Exception:  # pylint: disable=broad-exception-caught
        return False
    return any(
        node.name.lower() == "mysql_query"
        for node in tree.find_all(exp.Anonymous)
    )


_DANGEROUS_KEYWORDS = ("DROP", "DELETE", "TRUNCATE", "ALTER", "CREATE", "INSERT", "UPDATE")


_SQL_CLEAN_RE = re.compile(
    r"--[^\n]*|/\*.*?\*/|'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"", re.S
)


def _strip_sql_literals_upper(sql: str) -> str:
    """大写化并抹平注释与单/双引号字面量内容。用于危险关键字判定与 LIMIT 判定:
    - 抹字面量:避免把字符串里的关键字误判为写操作;
    - 抹注释:避免 `-- LIMIT 5` / `/* LIMIT */` 里的 LIMIT 让 auto-LIMIT 失效
      导致预览无上限(Codex P1-10)。"""
    return _SQL_CLEAN_RE.sub(" ", (sql or "").upper())


def assert_no_dangerous_write(sql_upper_cleaned: str, save_as_table: Optional[str]) -> None:
    """拒绝写操作;save_as_table 时放行 CREATE(其 CTAS 由服务端包装)。
    入参须为已剥离字面量的大写 SQL。execute 与 federated 端点共用,避免任一路径漏拦。"""
    if save_as_table:
        return
    for keyword in _DANGEROUS_KEYWORDS:
        if keyword != "CREATE" and contains_keyword(sql_upper_cleaned, keyword):
            raise APIValidationError(
                f"{keyword} operation is not allowed. Only query operations are supported."
            )


def _main_table_create_target(sql: str) -> tuple[Optional[str], bool]:
    """返回直写 CREATE TABLE 的 main 表名及 IF NOT EXISTS 标记。"""
    try:
        tree = sqlglot.parse_one(sql, read="duckdb")
    except Exception:  # pylint: disable=broad-exception-caught
        return None, False
    if not isinstance(tree, exp.Create) or str(tree.args.get("kind", "")).upper() != "TABLE":
        return None, False
    if tree.find(exp.TemporaryProperty) is not None:
        return None, False
    target = tree.this
    if isinstance(target, exp.Schema):
        target = target.this
    if not isinstance(target, exp.Table) or target.catalog:
        return None, False
    schema_name = str(target.db or "")
    if schema_name and schema_name.lower() != "main":
        return None, False
    return target.name or None, bool(tree.args.get("exists"))


def _run_query_maybe_save(conn, sql_query, save_as_table, limit, original_sql=None):
    """执行查询;若指定 save_as_table 则先 CTAS 物化(原查询只执行这一次),
    预览行改从已建的表读取——既避免为预览重跑昂贵/有副作用的查询,也保证预览行
    与落库数据一致(非确定性查询如 random()/now() 不再"预览≠落库",Codex P1-11)。
    保存失败不再静默:save_error 带回,由调用方放进响应,前端据 saved_table 决定提示。
    返回 (columns, records, cursor_types, column_types, saved_table, save_error)。
    execute 与其两条连接路径共用,消除历史两处重复块。

    CTAS 用【原始查询 original_sql】(未被追加预览 LIMIT 的版本),而非从带 LIMIT 的文本里
    replace 反推——后者是全局子串替换,会误删字符串字面量内的 " LIMIT n"(如 'keep LIMIT 5'
    被改成 'keep',静默改数据,复审 P1)。落库即全量(不带预览 LIMIT),与联邦路由一致。
    """
    def _types(cur_types, describe_sql):
        return describe_query_column_types(conn, describe_sql) or [
            {"name": n, "duckdb_type": t} for n, t in cur_types
        ]

    table_name = (save_as_table or "").strip()
    if table_name:
        save_sql = (original_sql if original_sql is not None else sql_query).strip().rstrip(";")
        try:
            conn.execute(
                f"CREATE OR REPLACE TABLE {quote_identifier(table_name)} AS ({save_sql})"
            )
            logger.info("Query result saved as table: %s", table_name)
            try:
                snapshot = build_table_metadata_snapshot(conn, table_name)
                file_datasource_manager.save_file_datasource({
                    "source_id": table_name,
                    "filename": "sql_query_result",
                    "file_path": f"duckdb://{table_name}",
                    "file_type": "duckdb_sql_query",
                    "created_at": get_current_time_iso(),
                    "source_sql": save_sql,
                    "schema_version": 2,
                    **snapshot,
                })
            except Exception as meta_error:  # pylint: disable=broad-except
                logger.warning("Failed to save table metadata (non-fatal): %s", meta_error)
            preview_sql = f"SELECT * FROM {quote_identifier(table_name)}"
            if limit:
                preview_sql = f"{preview_sql} LIMIT {limit}"
            cols, recs, cur_types = fetch_query_records(conn, preview_sql)
            return cols, recs, cur_types, _types(cur_types, preview_sql), table_name, None
        except Exception as save_error:  # pylint: disable=broad-except
            logger.warning("Failed to save query result as table: %s", save_error)
            # 保存失败 → 退回直接执行原查询,至少把数据返回,并将错误带回响应
            cols, recs, cur_types = fetch_query_records(conn, sql_query)
            return cols, recs, cur_types, _types(cur_types, sql_query), None, str(save_error)

    created_table, if_not_exists = _main_table_create_target(sql_query)
    table_existed = False
    if created_table and if_not_exists:
        existing_names = conn.execute(
            "SELECT table_name FROM duckdb_tables() WHERE NOT internal "
            "AND database_name = current_database() AND schema_name = 'main'"
        ).fetchall()
        ascii_fold = str.maketrans(
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"
        )
        target_key = created_table.translate(ascii_fold)
        table_existed = any(
            str(row[0]).translate(ascii_fold) == target_key for row in existing_names
        )

    cols, recs, cur_types = fetch_query_records(conn, sql_query)
    if created_table and not (if_not_exists and table_existed):
        table_registry.record_creation(created_table)
    return cols, recs, cur_types, _types(cur_types, sql_query), None, None


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
def list_duckdb_tables_summary():
    """获取DuckDB中所有可用表的概要信息"""
    try:
        with with_duckdb_connection() as con:
            # 一次性从 DuckDB 元数据目录取行数估计与列数，
            # 避免逐表 DESCRIBE + COUNT(*)（N+1，且 COUNT 是全表扫描）
            table_rows = con.execute(
                """
                SELECT table_name AS name, estimated_size, column_count, table_oid
                FROM duckdb_tables()
                WHERE NOT internal AND database_name = current_database()
                  AND schema_name = 'main'
                ORDER BY table_oid DESC
                """
            ).fetchall()

            if not table_rows:
                return create_list_response(
                    items=[],
                    total=0,
                    message_code=MessageCode.TABLES_RETRIEVED,
                    message="No tables available in DuckDB. Please upload a file or connect to a database first.",
                )

            # 获取每个表的概要信息
            table_info = []
            physical_names = [
                r[0] for r in table_rows if not r[0].lower().startswith("system_")
            ]
            # 顺序唯一权威 = 登记表 sort_seq(单调持久,免疫 oid 漂移/时区/同秒);
            # created_at 仅展示。sync 失败返回空 map → 降级为目录序
            registry = table_registry.sync(
                physical_names, created_lookup=file_datasource_manager.get_file_datasource
            )
            for table_name, est, col_count, _table_oid in table_rows:
                if table_name.lower().startswith("system_"):
                    continue
                # 行数估计 + 列数直接来自 duckdb_tables()（无逐表扫描）
                row_count = int(est) if est is not None else 0
                column_count = int(col_count) if col_count is not None else 0

                entry = registry.get(table_name) or {}
                created_dt = entry.get("created_at")
                # created_at 以应用时区 ISO 返回(§7.3:存储 UTC、响应本地)
                created_at = (
                    format_storage_time_for_response(created_dt)
                    if isinstance(created_dt, datetime)
                    else None
                )

                table_info.append(
                    {
                        "table_name": table_name,
                        "column_count": column_count,
                        "row_count": row_count,
                        "created_at": created_at,
                        "_seq": entry.get("sort_seq") or 0,
                    }
                )

            table_info.sort(key=lambda t: t["_seq"], reverse=True)
            for info in table_info:
                info.pop("_seq", None)

            return create_list_response(
                items=table_info,
                total=len(table_info),
                message_code=MessageCode.TABLES_RETRIEVED,
            )

    except Exception as e:
        logger.error(f"Failed to get DuckDB table info: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to get table info: {str(e)}",
        )


def _ensure_table_exists(con, table_name: str) -> None:
    available_tables = [row[0] for row in con.execute("SHOW TABLES").fetchall()]
    if table_name not in available_tables:
        raise ResourceNotFoundError("Table", table_name)


@router.get("/api/duckdb/tables/detail/{table_name}", tags=["DuckDB Query"])
def get_duckdb_table_detail(table_name: str):
    """获取指定表的列级详细信息"""
    try:
        with with_duckdb_connection() as con:
            _ensure_table_exists(con, table_name)
            metadata = get_table_metadata(table_name, con)
            metadata_dict = (
                metadata.model_dump()
                if hasattr(metadata, "model_dump")
                else metadata.dict()
            )
            return create_success_response(
                data={"table": metadata_dict},
                message_code=MessageCode.TABLE_RETRIEVED,
            )
    except BaseAPIException:
        raise
    except Exception as exc:
        logger.error("Failed to get table metadata: %s", exc, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to get table metadata: {str(exc)}",
        )


@router.get("/api/duckdb/tables/{table_name}", tags=["DuckDB Query"])
def get_duckdb_table(table_name: str):
    """获取指定表的详细信息（别名端点）"""
    return get_duckdb_table_detail(table_name)


@router.post("/api/duckdb/table/{table_name}/refresh", tags=["DuckDB Query"])
def refresh_duckdb_table_metadata(table_name: str):
    """刷新指定表的元数据缓存并返回最新详细信息"""
    try:
        with with_duckdb_connection() as con:
            _ensure_table_exists(con, table_name)
            metadata = get_table_metadata(table_name, con, use_cache=False)
            metadata_dict = (
                metadata.model_dump()
                if hasattr(metadata, "model_dump")
                else metadata.dict()
            )
            return create_success_response(
                data={"table": metadata_dict, "refreshed": True},
                message_code=MessageCode.TABLE_REFRESHED,
            )
    except BaseAPIException:
        raise
    except Exception as exc:
        logger.error("Failed to refresh table metadata: %s", exc, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to refresh table metadata: {str(exc)}",
        )


def execute_duckdb_query(
    request: DuckDBQueryRequest, request_id: Optional[str] = None
):
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
        sql_query = request.sql.strip()
        if not sql_query:
            raise APIValidationError("SQL query cannot be empty")

        with with_duckdb_connection() as con:
            available_tables = [
                row[0] for row in con.execute("SHOW TABLES").fetchall()
            ]

        # 检查是否是简单的SELECT查询（不需要表）。sql_upper_clean 同时抹掉注释
        # 与字面量,供 is_simple_select / 危险关键字 / LIMIT 三处判定共用
        sql_upper = sql_query.upper().strip()
        sql_upper_clean = _strip_sql_literals_upper(sql_query).strip()
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
            raise APIValidationError(
                "No tables available in DuckDB. Please upload a file or connect to a database first."
            )

        # 拒绝写操作(save_as_table 时放行 CREATE);与 federated 端点共用同一 helper
        assert_no_dangerous_write(sql_upper_clean, request.save_as_table)

        # 预览模式:最外层缺用户 LIMIT 时补系统默认(INSTALL/LOAD/ATTACH 等语句不接 LIMIT)。
        # 判定走 has_top_level_limit(sqlglot AST):仅子查询里的 LIMIT 属于用户业务 SQL,
        # 不算"最外层已有"——保留它并在最外层补默认;旧的 `"LIMIT" not in sql` 子串判断会
        # 因子查询 LIMIT 而完全跳过外层默认(复审 P1)。换行追加,行尾注释安全。
        limit = None
        if request.is_preview and statement_accepts_limit(sql_query) and not has_top_level_limit(sql_query):
            from core.common.config_manager import config_manager

            limit = config_manager.get_app_config().max_query_rows
            sql_query = ensure_query_has_limit(sql_query, limit)
            logger.info(f"Preview mode, applied LIMIT {limit}")

        logger.info(f"Executing DuckDB query: {sql_query}")
        # 完整表清单每查询约 1KB,DEBUG 级即可(桌面 stderr 日志减负)
        logger.debug(f"Available tables: {available_tables}")

        execution_time = 0.0
        query_column_types = []
        saved_table = None
        save_error = None
        # 使用可中断连接执行查询（如果有 query_id）
        if query_id:
            with interruptible_connection(query_id, sql_query) as conn:
                (result_columns, result_records, _cursor_types, query_column_types,
                 saved_table, save_error) = _run_query_maybe_save(
                    conn, sql_query, request.save_as_table, limit, original_sql=request.sql)
                execution_time = _log_query_metrics_in_conn(
                    conn, sql_query, start_time, len(result_records)
                )
        else:
            with with_duckdb_connection() as con:
                (result_columns, result_records, _cursor_types, query_column_types,
                 saved_table, save_error) = _run_query_maybe_save(
                    con, sql_query, request.save_as_table, limit, original_sql=request.sql)
                execution_time = _log_query_metrics_in_conn(
                    con, sql_query, start_time, len(result_records)
                )

        # 构建响应
        response_payload = {
            "columns": result_columns,
            "column_types": query_column_types,
            "data": result_records,
            "row_count": len(result_records),
            "execution_time_ms": execution_time,
            "sql_executed": sql_query,
            "available_tables": available_tables,
            "saved_table": saved_table,
            # 请求了 save_as_table 但落库失败时,saved_table 为 None 且此处带错误原因;
            # 前端据 saved_table 判断"是否真的建表成功",不再一律提示成功
            "save_error": save_error,
            # 仅当预览模式且服务端自动追加了 LIMIT 时有值，供前端判断是否可能截断
            "preview_limit_applied": limit,
        }

        return create_success_response(
            data=response_payload,
            message_code=MessageCode.QUERY_EXECUTED,
            message=f"Query successful, returned {len(result_records)} rows",
        )

    except duckdb.InterruptException as e:
        logger.info(f"Query {query_id} was cancelled by user")
        return error_json_response(
            499,
            MessageCode.QUERY_CANCELLED,
            "Query cancelled",
            details={"query_id": query_id, "error": str(e)},
        )
    except BaseAPIException:
        raise
    except Exception as e:
        logger.error(f"DuckDB query execution failed: {str(e)}")
        logger.error(f"Stack trace: {traceback.format_exc()}")
        return error_json_response(
            500,
            MessageCode.QUERY_FAILED,
            f"Query execution failed: {str(e)}",
            details={"query_id": query_id},
        )


@router.post("/api/duckdb/execute", tags=["DuckDB Query"])
def execute_duckdb_sql(
    request: DuckDBQueryRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """
    执行DuckDB SQL查询 (兼容增强SQL执行器)
    这是 /api/duckdb/query 的别名端点，保持API兼容性
    支持通过 X-Request-ID 头实现查询取消
    """
    return execute_duckdb_query(request, x_request_id)


@router.delete("/api/duckdb/tables/{table_name}", tags=["DuckDB Query"])
def delete_duckdb_table(table_name: str):
    """删除指定的DuckDB表"""
    try:
        with with_duckdb_connection() as con:
            available_tables = [
                row[0] for row in con.execute("SHOW TABLES").fetchall()
            ]

            if table_name not in available_tables:
                raise ResourceNotFoundError("Table", table_name)

            # 删除表
            drop_sql = f'DROP TABLE IF EXISTS {quote_identifier(table_name)}'
            con.execute(drop_sql)

            logger.info(f"Successfully deleted DuckDB table: {table_name}")

            # 同时尝试删除文件数据源记录
            try:
                from core.data.file_datasource_manager import file_datasource_manager

                file_datasource_manager.delete_file_datasource(table_name)
                logger.info(f"Deleted file datasource record: {table_name}")
            except Exception as e:
                logger.warning(f"Failed to delete file datasource record: {str(e)}")

            # 排序登记行同步删除(list 的 sync 也会兜底清理)
            table_registry.remove(table_name)

            return create_success_response(
                data={"deleted_table": table_name},
                message_code=MessageCode.TABLE_DELETED,
                message=f"Table '{table_name}' has been successfully deleted",
            )

    except BaseAPIException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete DuckDB table: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to delete table: {str(e)}",
        )


# 新增连接池状态监控接口
@router.get("/api/duckdb/pool/status", tags=["DuckDB Management"])
def get_connection_pool_status():
    """获取连接池状态"""
    try:
        from core.database.duckdb_pool import get_connection_pool

        pool = get_connection_pool()
        stats = pool.get_stats()

        return create_success_response(
            data={"pool_status": stats, "timestamp": time.time()},
            message_code=MessageCode.POOL_STATUS_RETRIEVED,
        )
    except Exception as e:
        logger.error(f"Failed to get connection pool status: {str(e)}")
        return error_json_response(500, MessageCode.OPERATION_FAILED, str(e))


@router.post("/api/duckdb/pool/reset", tags=["DuckDB Management"])
def reset_connection_pool():
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

        return create_success_response(
            data={},
            message_code=MessageCode.POOL_RESET_SUCCESS,
        )
    except Exception as e:
        logger.error(f"Failed to reset connection pool: {str(e)}")
        return error_json_response(500, MessageCode.OPERATION_FAILED, str(e))


@router.post("/api/duckdb/migrate/created_at", tags=["DuckDB Management"])
def migrate_created_at_field():
    """迁移 created_at 字段：为现有表填充创建时间"""
    try:
        from datetime import datetime

        with with_duckdb_connection() as conn:
            # 检查需要迁移的记录数
            result = conn.execute("""
                SELECT COUNT(*)
                FROM system_file_datasources
                WHERE created_at IS NULL
            """).fetchone()

            count = result[0] if result else 0
            logger.info(f"Found {count} records that need created_at field populated")

            if count == 0:
                return create_success_response(
                    data={"migrated_count": 0, "remaining_null": 0},
                    message_code=MessageCode.OPERATION_SUCCESS,
                    message="All records already have created_at field populated, no migration needed",
                )

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

            logger.info(f"Successfully migrated {count} records' created_at field")

            # 验证迁移结果
            result = conn.execute("""
                SELECT COUNT(*)
                FROM system_file_datasources
                WHERE created_at IS NULL
            """).fetchone()

            remaining = result[0] if result else 0

            return create_success_response(
                data={"migrated_count": count, "remaining_null": remaining},
                message_code=MessageCode.OPERATION_SUCCESS,
                message=f"Successfully migrated {count} records' created_at field",
            )

    except Exception as e:
        logger.error(f"Failed to migrate created_at field: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Migration failed: {str(e)}",
        )


# 新增错误统计接口
@router.get("/api/errors/statistics", tags=["System Management"])
def get_error_statistics():
    """获取错误统计信息"""
    try:
        error_handler = get_error_handler()
        stats = error_handler.get_error_statistics()

        return create_success_response(
            data={"error_statistics": stats},
            message_code=MessageCode.ERROR_STATS_RETRIEVED,
        )
    except Exception as e:
        logger.error(f"Failed to get error statistics: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to get error statistics: {str(e)}",
        )


@router.post("/api/errors/clear", tags=["System Management"])
def clear_old_errors(days: int = 30):
    """清理旧错误记录"""
    try:
        error_handler = get_error_handler()
        error_handler.clear_old_errors(days)

        return create_success_response(
            data={"days": days},
            message_code=MessageCode.ERRORS_CLEARED,
            message=f"Cleared error records older than {days} days",
        )
    except Exception as e:
        logger.error(f"Failed to clear error records: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to clear error records: {str(e)}",
        )


@router.post("/api/duckdb/federated-query", tags=["DuckDB Query"])
def execute_federated_query(
    request: FederatedQueryRequest,
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
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

    # 写拦截:此端点独立于 /execute,历史上漏了这道门,MCP federated_query
    # 可借多语句/CTE 绕过只读判定送达写操作(Codex P0-4)。与 /execute 同 helper。
    assert_no_dangerous_write(
        _strip_sql_literals_upper(request.sql), request.save_as_table
    )

    # 预先准备 ATTACH 配置（在连接外验证，避免占用连接时间）。
    # 与透视/集合共用 resolve_attach_configs：此处曾另写一份(多了 db_ 前缀归一化),
    # 两份实现对同一个 connection_id 给出不同结果,统一后归一化在公共函数里做。
    attach_configs = resolve_attach_configs(request.attach_databases)

    # 处理 SQL 查询（MySQL 风格双引号字符串 → DuckDB 单引号）
    sql_query = normalize_mysql_double_quoted_strings_for_duckdb(
        request.sql.strip()
    )
    # 预览:最外层缺用户 LIMIT 时补默认——判定走 has_top_level_limit(AST,注释/字面量/
    # 子查询天然正确),与本地 execute 同一口径(复审 P1);换行追加,行尾注释安全
    limit = None
    if request.is_preview and statement_accepts_limit(sql_query) and not has_top_level_limit(sql_query):
        limit = config_manager.get_app_config().max_query_rows
        sql_query = ensure_query_has_limit(sql_query, limit)
        logger.info(f"Preview mode, applied LIMIT {limit}")

    logger.info(f"Executing federated query: {sql_query}")

    # 捕获优化器输出（通过 dict 跨闭包传递，避免 nonlocal 嵌套问题）
    _opt = {"sql": sql_query, "suggestions": None}

    def execute_in_connection(conn):
        """在连接内执行 ATTACH/QUERY/DETACH"""
        nonlocal attached_aliases, warnings

        # 1. ATTACH 所有外部数据库（连接池复用时会容忍已挂载别名）
        if attach_configs:
            configure_mysql_fresh_connections(conn, attach_configs)
            attached_aliases = attach_databases_on_connection(conn, attach_configs)
            logger.info(f"Attached databases: {attached_aliases}")

        # DETACH 必须放 finally:查询/保存中途抛错时,若不清理,连接会带着
        # ATTACH 回到池里被后续请求复用(Codex S-13)
        try:
            for attempt in range(2):
                try:
                    with mysql_remote_cancellation_scope(conn, query_id, attach_configs):
                        # 2. 智能下推：半连接键下推(保持结果) + 时间界建议(不改 SQL)
                        attach_aliases = {alias for (alias, _cfg) in attach_configs}
                        mysql_aliases = {
                            alias
                            for alias, db_config in attach_configs
                            if str(db_config.get("type", "")).lower() == "mysql"
                        }
                        opt_sql, suggestions, opt_warnings = optimize_federated_sql(
                            conn,
                            sql_query,
                            attach_aliases,
                            config_manager.get_app_config(),
                            mysql_aliases=mysql_aliases,
                        )
                        _opt["sql"] = opt_sql
                        _opt["suggestions"] = suggestions or None
                        if opt_warnings:
                            warnings.extend(str(w) for w in opt_warnings)

                        # 3. 执行用户 SQL（使用优化后的语句）
                        result_triplet = fetch_query_records(
                            conn,
                            opt_sql,
                            # DESCRIBE(mysql_query(...)) 会在 MySQL 上真实执行 SQL，且使用
                            # 独立于事务扫描的连接；取消器无法精确命中。实际游标 description
                            # 已提供同样的列类型，因此该表函数直接执行一次即可。
                            describe_before_execute=not _uses_mysql_query_table_function(opt_sql),
                        )

                        # 4. 可选：保存查询结果为新表（使用原始 SQL，确保语义不变）
                        if request.save_as_table:
                            table_name = request.save_as_table.strip()
                            if table_name:
                                try:
                                    save_sql = request.sql.strip().rstrip(";")
                                    create_sql = (
                                        f'CREATE OR REPLACE TABLE {quote_identifier(table_name)} AS ({save_sql})'
                                    )
                                    conn.execute(create_sql)
                                    table_registry.record_creation(table_name)
                                    logger.info(f"Query result saved as table: {table_name}")
                                except Exception as save_error:
                                    logger.warning(f"Failed to save query result as table: {str(save_error)}")
                                    warnings.append(f"Failed to save result as table: {str(save_error)}")

                        return result_triplet
                except Exception as query_error:
                    if (
                        attempt > 0
                        or not is_read_only_query(sql_query)
                        or not is_federated_connection_lost(query_error)
                    ):
                        raise
                    logger.warning(
                        "Federated MySQL connection lost inside cancellation transaction; "
                        "clearing cache after rollback and retrying once"
                    )
                    conn.execute("CALL mysql_clear_cache()")
                    warnings.clear()
                    _opt["sql"] = sql_query
                    _opt["suggestions"] = None
        finally:
            # 5. DETACH 清理(无论成功失败)
            if attached_aliases:
                detach_databases_on_connection(conn, attached_aliases)

    timeout_s = int(config_manager.get_app_config().federated_query_timeout or 300)
    query_id = query_id or f"fed:{uuid4().hex}"
    timed_out = {"v": False}

    def _on_timeout():
        timed_out["v"] = True
        connection_registry.interrupt_with_remote(query_id)

    result_columns: list = []
    result_records: list = []
    query_column_types = []
    try:
        with single_threaded_mysql_persistence(attach_configs):
            with interruptible_connection(query_id, sql_query) as conn:
                timer = threading.Timer(timeout_s, _on_timeout)
                timer.start()
                try:
                    result_columns, result_records, cursor_types = (
                        execute_in_connection(conn)
                    )
                    query_column_types = describe_query_column_types(
                        conn, _opt["sql"]
                    ) or [
                        {"name": name, "duckdb_type": dtype}
                        for name, dtype in cursor_types
                    ]
                finally:
                    timer.cancel()
                execution_time = _log_query_metrics_in_conn(
                    conn, sql_query, start_time, len(result_records)
                )

        response_data = {
            "columns": result_columns,
            "column_types": query_column_types,
            "data": result_records,
            "row_count": len(result_records),
            "execution_time_ms": execution_time,
            "attached_databases": attached_aliases,
            "sql_query": sql_query,
            "optimized_sql": _opt["sql"],
            "suggestions": _opt["suggestions"],
            "warnings": warnings if warnings else None,
            "preview_limit_applied": limit,
        }

        return create_success_response(
            data=response_data,
            message_code=MessageCode.QUERY_EXECUTED,
            message=f"Federated query successful, returned {len(result_records)} rows",
        )

    except duckdb.InterruptException:
        if timed_out["v"]:
            logger.warning(f"Federated query {query_id} timed out after {timeout_s}s")
            return error_json_response(
                504, MessageCode.QUERY_TIMEOUT,
                f"Federated query exceeded {timeout_s}s and was aborted",
                details={"query_id": query_id, "timeout_s": timeout_s},
            )
        logger.info(f"Federated query {query_id} was cancelled by user")
        # 取消时也尝试清理 ATTACH
        try:
            with with_duckdb_connection() as con:
                for alias in attached_aliases:
                    try:
                        con.execute(f'DETACH "{alias}"')
                        logger.info(f"Cleanup DETACH after cancellation: {alias}")
                    except Exception:
                        pass
        except Exception:
            pass
        return error_json_response(
            499,
            MessageCode.QUERY_CANCELLED,
            "Query cancelled by client",
            details={"query_id": query_id},
        )
    except BaseAPIException:
        raise
    except Exception as e:
        logger.error(f"Federated query execution failed: {str(e)}")
        logger.error(f"Stack trace: {traceback.format_exc()}")
        return error_json_response(
            500,
            MessageCode.QUERY_FAILED,
            f"Federated query failed: {str(e)}",
            details={"query_id": query_id},
        )
