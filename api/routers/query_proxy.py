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
import pandas as pd
import numpy as np
from pydantic import BaseModel  # 补充 BaseModel 导入

from core.duckdb_engine import get_db_connection
from core.timezone_utils import get_current_time  # 导入时区工具
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


@router.post("/api/query_proxy")
async def query_proxy(request: Request):
    """
    代理查询请求，自动转换格式
    """
    try:
        # 获取原始请求数据
        raw_data = await request.json()
        logger.info(f"收到原始查询请求: {raw_data}")

        # 转换数据源格式
        converted_sources = []
        for source in raw_data.get("sources", []):
            # 检查是否已经有正确格式
            if "params" in source:
                converted_sources.append(source)
                continue

            # 转换文件数据源
            if source.get("sourceType") == "file" or source.get("type") == "file":
                converted_sources.append(
                    {
                        "id": source.get("id"),
                        "type": "file",
                        "params": {
                            "path": f"temp_files/{source.get('path') or source.get('name')}"
                        },
                    }
                )
            elif source.get("sourceType") == "database" or source.get("type") in [
                "mysql",
                "postgresql",
                "sqlite",
            ]:
                # 数据库数据源
                converted_sources.append(
                    {
                        "id": source.get("id"),
                        "type": source.get("type"),
                        "params": source.get("params")
                        or {"connectionId": source.get("connectionId")},
                    }
                )
            elif source.get("sourceType") == "duckdb" or source.get("type") == "duckdb":
                # DuckDB数据源
                converted_sources.append(
                    {
                        "id": source.get("id"),
                        "type": "duckdb",
                        "params": {
                            "table_name": source.get("table_name") or source.get("id")
                        },
                    }
                )
            else:
                # 其他情况，尝试保持原格式
                converted_sources.append(source)

        # 转换JOIN格式
        converted_joins = []
        for join in raw_data.get("joins", []):
            # 检查是否已经是新格式
            if "conditions" in join:
                converted_joins.append(join)
                continue

            # 转换旧格式到新格式
            converted_join = {
                "left_source_id": join.get("left_source_id"),
                "right_source_id": join.get("right_source_id"),
                "join_type": join.get("how", "inner"),  # how -> join_type
                "conditions": [],
            }

            # 转换条件格式
            if "left_on" in join and "right_on" in join:
                converted_join["conditions"].append(
                    {
                        "left_column": join["left_on"],
                        "right_column": join["right_on"],
                        "operator": "=",
                    }
                )

            converted_joins.append(converted_join)

        # 构建转换后的请求
        converted_request = {"sources": converted_sources, "joins": converted_joins}

        # 添加其他可能的字段
        for key in ["limit", "where_conditions", "order_by"]:
            if key in raw_data:
                converted_request[key] = raw_data[key]

        logger.info(f"转换后的查询请求: {converted_request}")

        # 发送到实际的查询 API（动态获取服务器地址，避免端口不匹配问题）
        # 从请求中获取主机信息
        host = request.headers.get("host", "localhost:8000")
        scheme = (
            "https" if request.headers.get("x-forwarded-proto") == "https" else "http"
        )
        base_url = f"{scheme}://{host}"

        # 获取配置的超时时间
        from core.config_manager import config_manager

        app_config = config_manager.get_app_config()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{base_url}/api/query",
                json=converted_request,
                timeout=app_config.query_proxy_timeout,
            )

            # 返回原始响应，添加代理标识
            result = response.json()
            # 添加代理处理标识
            result["_proxy_processed"] = True
            result["_proxy_timestamp"] = str(get_current_time())
            return result

    except Exception as e:
        logger.error(f"查询代理错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"查询代理错误: {str(e)}")


@router.post("/api/download_proxy")
async def download_proxy(request: Request):
    """
    下载代理请求，自动转换格式
    """
    try:
        # 获取原始请求数据
        raw_data = await request.json()
        logger.info(f"收到原始下载请求: {raw_data}")

        # 转换数据源格式
        converted_sources = []
        for source in raw_data.get("sources", []):
            # 检查是否已经有正确格式
            if "params" in source:
                converted_sources.append(source)
                continue

            # 转换文件数据源
            if source.get("sourceType") == "file" or source.get("type") == "file":
                converted_sources.append(
                    {
                        "id": source.get("id"),
                        "type": "file",
                        "params": {
                            "path": f"temp_files/{source.get('path') or source.get('name')}"
                        },
                    }
                )
            elif source.get("sourceType") == "database" or source.get("type") in [
                "mysql",
                "postgresql",
                "sqlite",
            ]:
                # 数据库数据源
                converted_sources.append(
                    {
                        "id": source.get("id"),
                        "type": source.get("type"),
                        "params": source.get("params")
                        or {"connectionId": source.get("connectionId")},
                    }
                )
            elif (
                source.get("sourceType") == "duckdb"
                or source.get("type") in ["duckdb", "table"]
                or source.get("sourceType") == "table"
            ):
                # DuckDB数据源 - 支持多种格式
                converted_sources.append(
                    {
                        "id": source.get("id"),
                        "type": "duckdb",
                        "params": {
                            "table_name": source.get("table_name") or source.get("id")
                        },
                    }
                )
            else:
                # 其他情况，尝试保持原格式
                converted_sources.append(source)

        # 转换JOIN格式
        converted_joins = []
        for join in raw_data.get("joins", []):
            # 检查是否已经是新格式
            if "conditions" in join:
                converted_joins.append(join)
                continue

            # 转换旧格式到新格式
            converted_join = {
                "left_source_id": join.get("left_source_id"),
                "right_source_id": join.get("right_source_id"),
                "join_type": join.get("how", "inner"),  # how -> join_type
                "conditions": [],
            }

            # 转换条件格式
            if "left_on" in join and "right_on" in join:
                converted_join["conditions"].append(
                    {
                        "left_column": join["left_on"],
                        "right_column": join["right_on"],
                        "operator": "=",
                    }
                )

            converted_joins.append(converted_join)

        # 构建转换后的请求
        converted_request = {"sources": converted_sources, "joins": converted_joins}

        # 添加其他可能的字段
        for key in ["limit", "where_conditions", "order_by"]:
            if key in raw_data:
                converted_request[key] = raw_data[key]

        logger.info(f"转换后的下载请求: {converted_request}")

        # 直接导入并调用下载函数，避免HTTP循环调用
        from .query import download_results
        from models.query_models import QueryRequest

        # 将转换后的请求转换为QueryRequest对象
        try:
            query_request = QueryRequest(**converted_request)
            logger.info(f"转换为QueryRequest成功: {query_request}")

            # 直接调用下载函数
            return await download_results(query_request)

        except Exception as conversion_error:
            logger.error(f"QueryRequest转换失败: {str(conversion_error)}")
            logger.error(f"转换的请求数据: {converted_request}")
            raise HTTPException(
                status_code=400, detail=f"请求格式转换失败: {str(conversion_error)}"
            )

    except Exception as e:
        logger.error(f"下载代理错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"下载代理错误: {str(e)}")
