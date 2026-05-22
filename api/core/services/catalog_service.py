"""
外部库元数据（Catalog）编排。

Canonical 表详情路径：`GET /api/datasources/databases/{id}/tables/detail`
Legacy 路径：`GET /api/database_table_details/{id}/{table}` 由 router 委托同一实现。
"""

from __future__ import annotations

from typing import Any, Dict, Optional

async def get_external_table_detail(
    connection_id: str,
    table_name: str,
    schema: Optional[str] = None,
) -> Dict[str, Any]:
    """
    获取外部连接下单表详情（列、索引、注释等）。
    委托 database_tables.get_table_details，保证 legacy 与 canonical 路径行为一致。
    """
    from routers.database_tables import get_table_details

    result = await get_table_details(connection_id, table_name, schema)
    # get_table_details 可能返回 JSONResponse 或 dict
    if hasattr(result, "body"):
        return result
    return result
