from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from typing import Dict, List, Any, Optional
import httpx
import logging
from pydantic import BaseModel, Field
import os
import io
from datetime import datetime

router = APIRouter()
logger = logging.getLogger(__name__)

# 定义数据模型
class JoinCondition(BaseModel):
    left_column: str
    right_column: str
    operator: str = "="

class Join(BaseModel):
    left_source_id: str
    right_source_id: str
    join_type: str = "inner"
    conditions: List[JoinCondition]

class DataSourceParams(BaseModel):
    path: Optional[str] = None
    connectionId: Optional[str] = None
    query: Optional[str] = None

class DataSource(BaseModel):
    id: str
    type: str
    params: DataSourceParams

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
                converted_sources.append({
                    "id": source.get("id"),
                    "type": "file",
                    "params": {
                        "path": f"temp_files/{source.get('path') or source.get('name')}"
                    }
                })
            # 转换数据库数据源
            elif source.get("sourceType") == "database" or "sql" in source.get("type", "").lower():
                converted_sources.append({
                    "id": source.get("id"),
                    "type": source.get("type"),
                    "params": {
                        "connectionId": source.get("connectionId")
                    }
                })
            # 其他类型，尝试构建通用格式
            else:
                converted_sources.append({
                    "id": source.get("id"),
                    "type": source.get("type", "file"),
                    "params": {
                        "path": f"temp_files/{source.get('path') or source.get('name')}"
                    }
                })
        
        # 转换 JOIN 格式
        converted_joins = []
        for join in raw_data.get("joins", []):
            # 检查是否已经有正确格式
            if "conditions" in join:
                converted_joins.append(join)
                continue
                
            # 转换 JOIN 条件
            converted_joins.append({
                "left_source_id": join.get("left_source_id"),
                "right_source_id": join.get("right_source_id"),
                "join_type": join.get("how") or join.get("join_type") or "inner",
                "conditions": [
                    {
                        "left_column": join.get("left_on"),
                        "right_column": join.get("right_on"),
                        "operator": "="
                    }
                ]
            })
        
        # 构建转换后的请求
        converted_request = {
            "sources": converted_sources,
            "joins": converted_joins
        }
        
        logger.info(f"转换后的查询请求: {converted_request}")
        
        # 发送到实际的查询 API（动态获取服务器地址，避免端口不匹配问题）
        # 从请求中获取主机信息
        host = request.headers.get("host", "localhost:8000")
        scheme = "https" if request.headers.get("x-forwarded-proto") == "https" else "http"
        base_url = f"{scheme}://{host}"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{base_url}/api/query",
                json=converted_request,
                timeout=60.0
            )
            
            # 返回原始响应，添加代理标识
            result = response.json()
            # 添加代理处理标识
            result["_proxy_processed"] = True
            result["_proxy_timestamp"] = str(datetime.now())
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
                converted_sources.append({
                    "id": source.get("id"),
                    "type": "file",
                    "params": {
                        "path": f"temp_files/{source.get('path') or source.get('name')}"
                    }
                })
            elif source.get("sourceType") == "database" or source.get("type") in ["mysql", "postgresql", "sqlite"]:
                # 数据库数据源
                converted_sources.append({
                    "id": source.get("id"),
                    "type": source.get("type"),
                    "params": source.get("params") or {
                        "connectionId": source.get("connectionId")
                    }
                })
            else:
                # 其他情况，尝试保持原格式
                converted_sources.append(source)

        # 转换 JOIN 格式
        converted_joins = []
        for join in raw_data.get("joins", []):
            # 检查是否已经有正确格式
            if "conditions" in join:
                converted_joins.append(join)
                continue

            # 转换 JOIN 条件
            converted_joins.append({
                "left_source_id": join.get("left_source_id"),
                "right_source_id": join.get("right_source_id"),
                "join_type": join.get("how") or join.get("join_type") or "inner",
                "conditions": [
                    {
                        "left_column": join.get("left_on"),
                        "right_column": join.get("right_on"),
                        "operator": "="
                    }
                ]
            })

        # 构建转换后的请求
        converted_request = {
            "sources": converted_sources,
            "joins": converted_joins,
            "select_columns": raw_data.get("select_columns"),
            "where_conditions": raw_data.get("where_conditions"),
            "order_by": raw_data.get("order_by"),
            "limit": raw_data.get("limit")
        }

        logger.info(f"转换后的下载请求: {converted_request}")

        # 发送到实际的下载 API（动态获取服务器地址，避免端口不匹配问题）
        # 从请求中获取主机信息
        host = request.headers.get("host", "localhost:8000")
        scheme = "https" if request.headers.get("x-forwarded-proto") == "https" else "http"
        base_url = f"{scheme}://{host}"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{base_url}/api/download",
                json=converted_request,
                timeout=60.0
            )

            # 返回原始响应（文件流）
            return StreamingResponse(
                io.BytesIO(response.content),
                media_type=response.headers.get("content-type", "application/octet-stream"),
                headers=dict(response.headers)
            )

    except Exception as e:
        logger.error(f"下载代理错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"下载代理错误: {str(e)}")
