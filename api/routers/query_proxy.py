"""
查询代理路由
自动转换前后端请求格式，解决422错误
"""

import logging
import json
import traceback
from datetime import datetime
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
import numpy as np
from pydantic import BaseModel  # 补充 BaseModel 导入

from core.database.duckdb_engine import get_db_connection
from core.common.timezone_utils import get_current_time  # 导入时区工具
from models.query_models import QueryRequest, QueryResponse

logger = logging.getLogger(__name__)

router = APIRouter()


class DataSource(BaseModel):
    id: str
    type: str
    params: Optional[Dict[str, Any]] = None


class Join(BaseModel):
    left_source_id: str
    right_source_id: str
    join_type: str
    conditions: List[Dict[str, Any]]


class QueryRequest(BaseModel):
    sources: List[DataSource]
    joins: List[Join]

