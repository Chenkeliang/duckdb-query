"""
增强的数据源管理路由
使用DuckDB原生扩展实现更高效的数据库集成
"""

from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import JSONResponse
from models.query_models import DatabaseConnection, DataSourceType
from core.duckdb_engine import get_db_connection
from core.duckdb_native_connector import get_native_connector
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2", tags=["Enhanced Data Sources"])

# 获取DuckDB原生连接器
native_connector = get_native_connector()


@router.post("/database_connections/attach")
async def attach_database_native(connection: DatabaseConnection):
    """使用DuckDB原生扩展连接数据库"""
    try:
        logger.info(f"使用原生扩展连接数据库: {connection.type} - {connection.id}")
        
        if connection.type == DataSourceType.MYSQL:
            database_id = native_connector.attach_mysql_database(connection)
        elif connection.type == DataSourceType.POSTGRESQL:
            database_id = native_connector.attach_postgresql_database(connection)
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"不支持的数据库类型: {connection.type}"
            )
        
        # 获取数据库中的表列表
        tables = native_connector.list_tables(database_id)
        
        return {
            "success": True,
            "message": f"数据库 {database_id} 连接成功",
            "database_id": database_id,
            "tables": tables,
            "connection_type": "native"
        }
        
    except Exception as e:
        logger.error(f"原生数据库连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"数据库连接失败: {str(e)}")


@router.get("/database_connections/attached")
async def list_attached_databases():
    """列出已连接的数据库"""
    try:
        attached_dbs = native_connector.get_attached_databases()
        
        result = []
        for db_id, db_info in attached_dbs.items():
            try:
                tables = native_connector.list_tables(db_id)
                result.append({
                    "database_id": db_id,
                    "type": db_info["type"],
                    "connection": db_info["connection"].dict(),
                    "tables": tables,
                    "table_count": len(tables)
                })
            except Exception as e:
                logger.warning(f"获取数据库 {db_id} 信息失败: {str(e)}")
                result.append({
                    "database_id": db_id,
                    "type": db_info["type"],
                    "connection": db_info["connection"].dict(),
                    "tables": [],
                    "table_count": 0,
                    "error": str(e)
                })
        
        return {
            "success": True,
            "databases": result,
            "total_count": len(result)
        }
        
    except Exception as e:
        logger.error(f"获取已连接数据库列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取数据库列表失败: {str(e)}")


@router.get("/database_connections/{database_id}/tables")
async def get_database_tables(database_id: str):
    """获取指定数据库的表列表"""
    try:
        tables = native_connector.list_tables(database_id)
        
        # 获取每个表的详细信息
        table_details = []
        for table_name in tables:
            try:
                schema_info = native_connector.get_table_schema(database_id, table_name)
                table_details.append(schema_info)
            except Exception as e:
                logger.warning(f"获取表 {table_name} 信息失败: {str(e)}")
                table_details.append({
                    "database_id": database_id,
                    "table_name": table_name,
                    "columns": [],
                    "row_count": 0,
                    "error": str(e)
                })
        
        return {
            "success": True,
            "database_id": database_id,
            "tables": table_details,
            "table_count": len(table_details)
        }
        
    except Exception as e:
        logger.error(f"获取数据库表列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表列表失败: {str(e)}")


@router.get("/database_connections/{database_id}/tables/{table_name}/schema")
async def get_table_schema(database_id: str, table_name: str):
    """获取表结构信息"""
    try:
        schema_info = native_connector.get_table_schema(database_id, table_name)
        
        return {
            "success": True,
            "schema": schema_info
        }
        
    except Exception as e:
        logger.error(f"获取表结构失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表结构失败: {str(e)}")


@router.post("/database_connections/{database_id}/query")
async def execute_database_query(
    database_id: str, 
    query_request: Dict[str, Any] = Body(...)
):
    """在指定数据库上执行查询"""
    try:
        query = query_request.get("query", "")
        limit = query_request.get("limit", 1000)
        
        if not query:
            raise HTTPException(status_code=400, detail="查询语句不能为空")
        
        # 确保查询有LIMIT子句
        if "LIMIT" not in query.upper():
            query = f"{query} LIMIT {limit}"
        
        # 如果查询中没有数据库前缀，自动添加
        if f"{database_id}." not in query:
            import re
            # 简单的表名替换
            query = re.sub(
                r'\bFROM\s+(\w+)',
                f'FROM {database_id}.\\1',
                query,
                flags=re.IGNORECASE
            )
            query = re.sub(
                r'\bJOIN\s+(\w+)',
                f'JOIN {database_id}.\\1',
                query,
                flags=re.IGNORECASE
            )
        
        # 执行查询
        result_df = native_connector.execute_cross_database_query(query)
        
        return {
            "success": True,
            "query": query,
            "columns": result_df.columns.tolist(),
            "data": result_df.to_dict(orient="records"),
            "row_count": len(result_df)
        }
        
    except Exception as e:
        logger.error(f"数据库查询执行失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"查询执行失败: {str(e)}")


@router.post("/database_connections/cross_query")
async def execute_cross_database_query(query_request: Dict[str, Any] = Body(...)):
    """执行跨数据库查询"""
    try:
        query = query_request.get("query", "")
        optimize = query_request.get("optimize", True)
        
        if not query:
            raise HTTPException(status_code=400, detail="查询语句不能为空")
        
        # 查询优化
        if optimize:
            query = native_connector.optimize_query(query)
        
        # 执行跨数据库查询
        result_df = native_connector.execute_cross_database_query(query)
        
        return {
            "success": True,
            "query": query,
            "columns": result_df.columns.tolist(),
            "data": result_df.to_dict(orient="records"),
            "row_count": len(result_df),
            "optimized": optimize
        }
        
    except Exception as e:
        logger.error(f"跨数据库查询执行失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"跨数据库查询失败: {str(e)}")


@router.post("/database_connections/{database_id}/create_view")
async def create_view_from_database(
    database_id: str,
    view_request: Dict[str, Any] = Body(...)
):
    """从数据库查询创建视图"""
    try:
        view_name = view_request.get("view_name", "")
        query = view_request.get("query", "")
        
        if not view_name or not query:
            raise HTTPException(status_code=400, detail="视图名称和查询语句不能为空")
        
        # 创建视图
        native_connector.create_view_from_query(view_name, database_id, query)
        
        return {
            "success": True,
            "message": f"视图 {view_name} 创建成功",
            "view_name": view_name,
            "query": query
        }
        
    except Exception as e:
        logger.error(f"创建视图失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"创建视图失败: {str(e)}")


@router.delete("/database_connections/{database_id}")
async def detach_database(database_id: str):
    """断开数据库连接"""
    try:
        native_connector.detach_database(database_id)
        
        return {
            "success": True,
            "message": f"数据库 {database_id} 已断开连接"
        }
        
    except Exception as e:
        logger.error(f"断开数据库连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"断开连接失败: {str(e)}")


@router.post("/database_connections/test_native")
async def test_native_connection(connection: DatabaseConnection):
    """测试DuckDB原生数据库连接"""
    try:
        success = native_connector.test_connection(connection)
        
        if success:
            return {
                "success": True,
                "message": "数据库连接测试成功",
                "connection_type": "native"
            }
        else:
            return {
                "success": False,
                "message": "数据库连接测试失败",
                "connection_type": "native"
            }
        
    except Exception as e:
        logger.error(f"原生连接测试失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"连接测试失败: {str(e)}")


@router.get("/database_connections/extensions/status")
async def get_extensions_status():
    """获取DuckDB扩展状态"""
    try:
        return {
            "success": True,
            "installed_extensions": list(native_connector.installed_extensions),
            "attached_databases": list(native_connector.attached_databases.keys())
        }
        
    except Exception as e:
        logger.error(f"获取扩展状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取扩展状态失败: {str(e)}")
