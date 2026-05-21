"""
数据库连接别名生成（与 frontend/src/utils/sqlUtils.ts `generateDatabaseAlias` 对齐）
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


def normalize_connection_id(datasource_id: str) -> str:
    """去掉前端可能带的 `db_` 前缀，得到连接配置 ID。"""
    if not datasource_id:
        return ""
    raw = str(datasource_id).strip()
    if raw.startswith("db_"):
        return raw[3:]
    return raw


def generate_connection_alias(
    connection: Any,
    existing_aliases: Optional[Set[str]] = None,
) -> str:
    """
    生成 DuckDB ATTACH 别名，规则与前端 `generateDatabaseAlias` 一致。
    """
    db_type = (
        connection.type.value
        if hasattr(connection.type, "value")
        else str(connection.type)
    )
    name = getattr(connection, "name", None) or getattr(connection, "id", "external")
    base = f"{db_type}_{name}".lower()
    base = re.sub(r"[^a-z0-9_]", "_", base)
    base = re.sub(r"_+", "_", base).strip("_")
    safe = base if re.match(r"^[a-z]", base) else (f"db_{base}" if base else "db_external")

    if existing_aliases is not None and safe in existing_aliases:
        counter = 1
        candidate = f"{safe}_{counter}"
        while candidate in existing_aliases:
            counter += 1
            candidate = f"{safe}_{counter}"
        safe = candidate

    return safe


def build_attach_list_from_datasource(
    datasource: Optional[Dict[str, Any]],
) -> Optional[List[Dict[str, str]]]:
    """
    从请求中的 datasource 字典构建单库 attach 配置。
    仅支持 mysql / postgresql / sqlite。
    """
    if not isinstance(datasource, dict):
        return None

    datasource_type = (datasource.get("type") or "").lower()
    supported = {"mysql", "postgresql", "sqlite"}
    if datasource_type not in supported:
        return None

    raw_id = datasource.get("id")
    if not raw_id:
        return None

    connection_id = normalize_connection_id(str(raw_id))
    if not connection_id:
        return None

    from core.database.database_manager import db_manager

    connection = db_manager.get_connection(connection_id)
    if not connection:
        raise ValueError(f"Data source connection not found: {connection_id}")

    alias = generate_connection_alias(connection)
    return [{"alias": alias, "connection_id": connection_id}]


def resolve_attach_databases_for_async(
    attach_databases: Optional[List[Any]],
    datasource: Optional[Dict[str, Any]],
) -> tuple[List[Dict[str, str]], bool]:
    """
    解析异步任务应使用的 attach 列表。

    优先级：显式 attach_databases > 从 datasource 自动推导 > 非联邦。
    """
    if attach_databases:
        resolved = []
        for db in attach_databases:
            if hasattr(db, "alias"):
                resolved.append(
                    {
                        "alias": db.alias.strip(),
                        "connection_id": db.connection_id.strip(),
                    }
                )
            elif isinstance(db, dict):
                resolved.append(
                    {
                        "alias": str(db.get("alias", "")).strip(),
                        "connection_id": str(db.get("connection_id", "")).strip(),
                    }
                )
        if resolved:
            return resolved, True

    built = build_attach_list_from_datasource(datasource)
    if built:
        logger.info(
            "Auto-derived attach_databases from datasource for async federated query: %s",
            [b["alias"] for b in built],
        )
        return built, True

    return [], False
