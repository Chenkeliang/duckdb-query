"""DuckDB 文件连接：统一 storage_compatibility_version（支持 VARIANT 等 v1.5+ 类型）。"""

from __future__ import annotations

import logging
from typing import Any, Dict

import duckdb

logger = logging.getLogger(__name__)

# 与 DuckDB 文档一致：'latest' 使用当前客户端支持的最新存储格式（v1.5.x → storage 68）
DUCKDB_STORAGE_COMPATIBILITY_VERSION = "latest"


def duckdb_connect_config() -> Dict[str, str]:
    return {"storage_compatibility_version": DUCKDB_STORAGE_COMPATIBILITY_VERSION}


def connect_duckdb_database(
    db_path: str,
    *,
    read_only: bool = False,
) -> duckdb.DuckDBPyConnection:
    """打开持久化 DuckDB 文件（新库将按 latest 存储格式创建）。"""
    kwargs: Dict[str, Any] = {
        "database": db_path,
        "config": duckdb_connect_config(),
    }
    if read_only:
        kwargs["read_only"] = True
    return duckdb.connect(**kwargs)
