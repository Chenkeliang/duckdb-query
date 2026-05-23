"""ATTACH 外部库并在单连接内执行 SQL（供 pivot-query / join-query 复用）。"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional, Tuple

import pandas as pd

from core.database.database_manager import db_manager
from core.database.duckdb_engine import build_attach_sql, with_duckdb_connection
from core.database.duckdb_pool import interruptible_connection
from core.common.exceptions import DatabaseConnectionError, ResourceNotFoundError
from core.security.encryption import password_encryptor

logger = logging.getLogger(__name__)


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
        try:
            attach_sql = build_attach_sql(alias, db_config)
            logger.info("Executing ATTACH: %s", alias)
            conn.execute(attach_sql)
            attached.append(alias)
        except Exception as attach_error:
            logger.error("ATTACH database %s failed: %s", alias, attach_error)
            raise DatabaseConnectionError(
                f"Failed to connect to external database '{alias}': {attach_error}",
            ) from attach_error
    return attached


def detach_databases_on_connection(conn: Any, aliases: List[str]) -> None:
    for alias in aliases:
        try:
            conn.execute(f'DETACH "{alias}"')
        except Exception as detach_error:
            logger.warning("DETACH %s failed: %s", alias, detach_error)


def execute_sql_with_attach(
    sql: str,
    attach_databases: Optional[List[Any]] = None,
    query_id: Optional[str] = None,
) -> pd.DataFrame:
    """在 DuckDB 连接上 ATTACH → 执行 SQL → DETACH。"""
    attach_configs = resolve_attach_configs(attach_databases)
    cleaned_sql = sql.rstrip().rstrip(";")

    def _run(conn: Any) -> pd.DataFrame:
        attached: List[str] = []
        try:
            if attach_configs:
                attached = attach_databases_on_connection(conn, attach_configs)
            return conn.execute(cleaned_sql).fetchdf()
        finally:
            if attached:
                detach_databases_on_connection(conn, attached)

    if query_id:
        with interruptible_connection(query_id, cleaned_sql) as conn:
            return _run(conn)

    with with_duckdb_connection() as conn:
        return _run(conn)


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
