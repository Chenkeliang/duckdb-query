"""列 cast 数据感知推断。

在(可筛选的)真实数据上刻画一列作为数值 cast 目标的安全性,供透视文本聚合 / JOIN
类型冲突做「安全推荐 + 可手填」。DECIMAL 标度取自实际最大小数位,而非固定常量,从根上
避免舍入假匹配(Codex 复审)。路由负责持连接→ATTACH→采样,分析函数不自开连接。
"""
import logging
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from core.common.sql_identifiers import quote_identifier
from core.data.ingestion_precision import analyze_numeric_cast
from core.database.duckdb_engine import with_duckdb_connection
from core.database.federated_attach import (
    attach_databases_on_connection,
    detach_databases_on_connection,
    format_qualified_table_reference,
    resolve_attach_configs,
)
from core.services.pivot_query_sql_common import _build_where_clause
from models.pivot_query_models import FilterConfig
from models.query_models import AttachDatabase
from utils.response_helpers import MessageCode, create_success_response

logger = logging.getLogger(__name__)
router = APIRouter()


class InferCastRequest(BaseModel):
    table_name: str = Field(..., min_length=1)
    column: str = Field(..., min_length=1)
    filters: List[FilterConfig] = Field(default_factory=list)
    attach_databases: Optional[List[AttachDatabase]] = None


def _table_ref(table_name: str) -> str:
    ref = (table_name or "").strip()
    if "." in ref:
        return format_qualified_table_reference(ref)
    return quote_identifier(ref.strip('"'))


@router.post("/api/columns/infer-cast", tags=["Columns"])
def infer_column_cast(request: InferCastRequest):
    """返回该列(在给定筛选下)作为数值 cast 目标的安全推荐 + 统计:
    {recommended: 'BIGINT'|'DECIMAL(38,s)'|None, total, numeric, non_numeric,
     max_int_digits, max_frac_digits, fits_decimal38}。"""
    qcol = quote_identifier(request.column)
    where = _build_where_clause(request.filters or [])
    base = f"(SELECT {qcol} FROM {_table_ref(request.table_name)} {where})"

    attached: List[str] = []
    with with_duckdb_connection() as con:
        try:
            if request.attach_databases:
                attached = attach_databases_on_connection(
                    con, resolve_attach_configs(request.attach_databases)
                )
            result = analyze_numeric_cast(con, base, request.column)
        finally:
            if attached:
                detach_databases_on_connection(con, attached)

    return create_success_response(data=result, message_code=MessageCode.OPERATION_SUCCESS)
