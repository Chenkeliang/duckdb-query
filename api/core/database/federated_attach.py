"""ATTACH 外部库并在单连接内执行 SQL（供 pivot-query / join-query 复用）。"""

from __future__ import annotations

import logging
import re
import uuid
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional, Tuple

import pandas as pd

from core.database.database_manager import db_manager
from core.database.duckdb_engine import (
    build_attach_sql,
    fetch_query_dataframe,
    with_duckdb_connection,
)
from core.database.duckdb_pool import interruptible_connection
from core.common.exceptions import DatabaseConnectionError, ResourceNotFoundError
from core.security.encryption import password_encryptor

logger = logging.getLogger(__name__)

# DuckDB 的 mysql/postgres 扩展在 ATTACH 失败时会把整条连接串原样回显进错误信息，
# 其中 password=明文 是空格分隔的一段 token。password 值本身不含空格（build_attach_sql
# 不对其加引号，含空格的口令本就会破坏连接串），故 \S+ 正好匹配这一段。
_CONN_SECRET_RE = re.compile(r"(password=)\S+", re.IGNORECASE)


def redact_connection_secrets(text: Any) -> str:
    """把连接串里回显的明文口令替换成 password=***。

    ATTACH 失败的原始错误会流向日志、异常消息、任务元数据乃至 MCP/LLM 调用方；
    在错误离开 ATTACH 现场之前先脱敏，避免明文口令外泄（回归 #19）。
    """
    return _CONN_SECRET_RE.sub(r"\1***", str(text))


def _is_database_already_attached_error(error: Exception) -> bool:
    """DuckDB 连接池复用时，残留 ATTACH 会触发 Binder already exists。"""
    return "already exists" in str(error).lower()


def _quote_identifier(identifier: str) -> str:
    """转义内嵌双引号并加引号包裹单个 SQL 标识符（保留非 ASCII，如中文表名）。"""
    escaped = str(identifier).replace('"', '""')
    return f'"{escaped}"'


def resolve_attach_configs(
    attach_databases: Optional[List[Any]],
) -> List[Tuple[str, Dict[str, Any]]]:
    """将 AttachDatabase 列表解析为 (alias, db_config)。"""
    if not attach_databases:
        return []

    configs: List[Tuple[str, Dict[str, Any]]] = []
    for attach_db in attach_databases:
        connection_id = getattr(attach_db, "connection_id", None) or (
            attach_db.get("connection_id") if isinstance(attach_db, dict) else None
        )
        alias = getattr(attach_db, "alias", None) or (
            attach_db.get("alias") if isinstance(attach_db, dict) else None
        )
        if not connection_id or not alias:
            continue

        connection = db_manager.get_connection(str(connection_id))
        if not connection:
            raise ResourceNotFoundError("Database connection", str(connection_id))

        db_config = dict(connection.params or {})
        password = db_config.get("password", "")
        if password and password_encryptor.is_encrypted(password):
            db_config["password"] = password_encryptor.decrypt_password(password)

        db_config["type"] = (
            connection.type.value
            if hasattr(connection.type, "value")
            else str(connection.type)
        )
        configs.append((str(alias), db_config))
    return configs


def attach_databases_on_connection(
    conn: Any, attach_configs: List[Tuple[str, Dict[str, Any]]]
) -> List[str]:
    """在已有连接上 ATTACH，返回成功 alias 列表。"""
    attached: List[str] = []
    for alias, db_config in attach_configs:
        # 连接池复用：先尝试卸掉同名库，避免「already exists」
        try:
            conn.execute(f'DETACH {_quote_identifier(alias)}')
        except Exception as detach_error:
            logger.debug("Pre-ATTACH DETACH %s skipped: %s", alias, detach_error)

        try:
            attach_sql = build_attach_sql(alias, db_config)
            logger.info("Executing ATTACH: %s", alias)
            conn.execute(attach_sql)
            attached.append(alias)
        except Exception as attach_error:
            if _is_database_already_attached_error(attach_error):
                logger.warning(
                    "Database %s still attached after pre-DETACH, reusing",
                    alias,
                )
                attached.append(alias)
                continue
            safe_error = redact_connection_secrets(attach_error)
            logger.error("ATTACH database %s failed: %s", alias, safe_error)
            # from None：切断 __cause__ 链，否则未脱敏的原始异常仍会随
            # traceback.format_exc() 一起被打印/存储
            raise DatabaseConnectionError(
                f"Failed to connect to external database '{alias}': {safe_error}",
            ) from None
    return attached


def detach_databases_on_connection(conn: Any, aliases: List[str]) -> None:
    for alias in aliases:
        try:
            conn.execute(f'DETACH {_quote_identifier(alias)}')
        except Exception as detach_error:
            logger.warning("DETACH %s failed: %s", alias, detach_error)


def execute_sql_with_attach(
    sql: str,
    attach_databases: Optional[List[Any]] = None,
    query_id: Optional[str] = None,
) -> pd.DataFrame:
    """在 DuckDB 连接上 ATTACH → 执行 SQL → DETACH。"""
    from core.common.sql_mysql_quotes import (
        normalize_mysql_double_quoted_strings_for_duckdb,
    )

    attach_configs = resolve_attach_configs(attach_databases)
    cleaned_sql = normalize_mysql_double_quoted_strings_for_duckdb(
        sql.rstrip().rstrip(";")
    )

    def _run(conn: Any) -> pd.DataFrame:
        attached: List[str] = []
        try:
            if attach_configs:
                attached = attach_databases_on_connection(conn, attach_configs)
            return fetch_query_dataframe(conn, cleaned_sql)
        finally:
            if attached:
                detach_databases_on_connection(conn, attached)

    if query_id:
        with interruptible_connection(query_id, cleaned_sql) as conn:
            return _run(conn)

    with with_duckdb_connection() as conn:
        return _run(conn)


def execute_sql_and_persist(
    sql: str,
    table_name: str,
    attach_databases: Optional[List[Any]] = None,
    query_id: Optional[str] = None,
    reject_empty: bool = False,
) -> Dict[str, Any]:
    """在一个连接内 ATTACH(如有)→ 执行到临时表 → 视 reject_empty 决定是否
    DROP+RENAME 覆盖目标表 → 取行数/列信息 → DETACH。

    不经过 pandas DataFrame,避免大结果集的 DuckDB→pandas→DuckDB 双重序列化。

    先写到临时表、确认结果后再原子替换目标表,而不是直接
    CREATE OR REPLACE TABLE <target>:后者会在还没确认新结果有效前就冲掉
    target 下任何已有数据——一旦执行失败、或(reject_empty=True 时)新结果
    为空,target 早已被空表/半途状态覆盖,调用方即便随后拒绝这次保存,
    target 下原有的数据也已经回不来了。reject_empty=True 且结果为空时,
    本函数只清理临时表、绝不触碰 target,调用方可以放心地把"拒绝空结果"
    当纯粹的校验判断,而不必担心这个判断前 target 已经被写坏。
    reject_empty=False(默认)时任何行数都提交,匹配 async 任务那条已验证
    过的 CTAS 路径的语义(0 行结果也是合法结果)。

    mysql 双引号规整只在存在 ATTACH 时应用(纯本地 DuckDB 原生 SQL 不会出现
    MySQL 客户端习惯写法,无条件应用只会对合法的双引号中文标识符引入误伤风险)。
    """
    from core.common.sql_mysql_quotes import (
        normalize_mysql_double_quoted_strings_for_duckdb,
    )
    from core.data.file_datasource_manager import build_table_metadata_snapshot

    attach_configs = resolve_attach_configs(attach_databases)
    cleaned_sql = sql.rstrip().rstrip(";")
    if attach_configs:
        cleaned_sql = normalize_mysql_double_quoted_strings_for_duckdb(cleaned_sql)
    quoted_table = _quote_identifier(table_name)
    staging_name = f"__stage_{uuid.uuid4().hex}"
    quoted_staging = _quote_identifier(staging_name)

    def _run(conn: Any) -> Dict[str, Any]:
        attached: List[str] = []
        try:
            if attach_configs:
                attached = attach_databases_on_connection(conn, attach_configs)
            conn.execute(f'CREATE OR REPLACE TABLE {quoted_staging} AS ({cleaned_sql})')
            try:
                snapshot = build_table_metadata_snapshot(conn, staging_name)
            except Exception:
                conn.execute(f'DROP TABLE IF EXISTS {quoted_staging}')
                raise
            if reject_empty and snapshot["row_count"] == 0:
                conn.execute(f'DROP TABLE IF EXISTS {quoted_staging}')
            else:
                # DROP+RENAME 包在真事务里：ALTER 失败(如取消/中断)时 ROLLBACK
                # 撤销 DROP，target 不会凭空消失。与 file_datasource_manager.py
                # 的 _create_table_atomically 用同一模式。
                conn.execute("BEGIN TRANSACTION")
                try:
                    conn.execute(f'DROP TABLE IF EXISTS {quoted_table}')
                    conn.execute(f'ALTER TABLE {quoted_staging} RENAME TO {quoted_table}')
                    conn.execute("COMMIT")
                except Exception:
                    conn.execute("ROLLBACK")
                    raise
            return snapshot
        finally:
            if attached:
                detach_databases_on_connection(conn, attached)

    if query_id:
        with interruptible_connection(query_id, cleaned_sql) as conn:
            return _run(conn)

    with with_duckdb_connection() as conn:
        return _run(conn)


def federated_source_sql_alias(table_ref: str, attach_aliases: set[str]) -> str:
    """
    ATTACH 后 DuckDB 可见的短表名（一般为物理表名，不含 attach 前缀）。

    例：mysql_sorder.iget_order + attach mysql_sorder → iget_order
    """
    trimmed = (table_ref or "").strip().strip('"')
    if not trimmed:
        raise ValueError("Table reference cannot be empty")
    parts = [part.strip().strip('"') for part in trimmed.split(".") if part.strip()]
    if len(parts) >= 2 and parts[0] in attach_aliases:
        return parts[-1]
    return parts[-1] if parts else trimmed


def format_qualified_table_reference(table_ref: str) -> str:
    """将 `alias.schema.table` 或 `table` 格式化为带引号的 SQL 表引用。"""
    trimmed = (table_ref or "").strip().strip('"')
    if not trimmed:
        raise ValueError("Table reference cannot be empty")
    if "." in trimmed:
        parts = [part.strip().strip('"') for part in trimmed.split(".") if part.strip()]
        return ".".join(f'"{p.replace(chr(34), chr(34) * 2)}"' for p in parts)
    safe = trimmed.replace('"', '""')
    return f'"{safe}"'
