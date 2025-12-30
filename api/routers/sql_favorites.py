import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel

from core.metadata_manager import metadata_manager
from core.timezone_utils import get_current_time

router = APIRouter()
logger = logging.getLogger(__name__)


# SQL收藏数据模型
class SQLFavorite(BaseModel):
    id: str
    name: str
    sql: str
    type: str  # 'mysql' 或 'duckdb'
    description: Optional[str] = ""
    tags: List[str] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    usage_count: int = 0


class CreateSQLFavoriteRequest(BaseModel):
    name: str
    sql: str
    type: str  # 'mysql' 或 'duckdb'
    description: Optional[str] = ""
    tags: List[str] = []


class UpdateSQLFavoriteRequest(BaseModel):
    name: Optional[str] = None
    sql: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None


@router.get("/api/sql-favorites", tags=["SQL Favorites"])
async def get_sql_favorites():
    """获取所有SQL收藏"""
    try:
        favorites = metadata_manager.list_sql_favorites()
        return {"success": True, "data": favorites}
    except Exception as e:
        logger.error(f"获取SQL收藏失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取SQL收藏失败: {str(e)}")


@router.post("/api/sql-favorites", tags=["SQL Favorites"])
async def create_sql_favorite(request: CreateSQLFavoriteRequest = Body(...)):
    """创建新的SQL收藏"""
    try:
        # 检查名称是否已存在
        # 注意：这里做了一个全量扫描，性能较差，但考虑到收藏数量通常很少，暂时可以接受
        # 理想情况下应该在数据库层面做唯一约束检查
        existing_favorites = metadata_manager.list_sql_favorites()
        if any(fav["name"] == request.name for fav in existing_favorites):
            raise HTTPException(status_code=400, detail="收藏名称已存在")

        # 创建新的收藏项
        new_id = str(uuid.uuid4())
        current_time = get_current_time()
        
        new_favorite = {
            "id": new_id,
            "name": request.name,
            "sql": request.sql,
            "type": request.type,
            "description": request.description or "",
            "tags": request.tags or [],
            "created_at": current_time,
            "updated_at": current_time,
            "usage_count": 0,
        }

        success = metadata_manager.save_sql_favorite(new_favorite)
        if not success:
             raise Exception("保存到数据库失败")

        return {"success": True, "data": new_favorite}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建SQL收藏失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"创建SQL收藏失败: {str(e)}")


@router.put("/api/sql-favorites/{favorite_id}", tags=["SQL Favorites"])
async def update_sql_favorite(
    favorite_id: str, request: UpdateSQLFavoriteRequest = Body(...)
):
    """更新SQL收藏"""
    try:
        # 检查是否存在
        existing = metadata_manager.get_sql_favorite(favorite_id)
        if not existing:
             raise HTTPException(status_code=404, detail="SQL收藏不存在")

        # 检查名称是否与其他收藏冲突
        if request.name and request.name != existing["name"]:
            all_favorites = metadata_manager.list_sql_favorites()
            for fav in all_favorites:
                if fav["id"] != favorite_id and fav["name"] == request.name:
                    raise HTTPException(status_code=400, detail="收藏名称已存在")

        # 构建更新数据
        updates = {}
        if request.name is not None:
            updates["name"] = request.name
        if request.sql is not None:
            updates["sql"] = request.sql
        if request.type is not None:
            updates["type"] = request.type
        if request.description is not None:
            updates["description"] = request.description
        if request.tags is not None:
            updates["tags"] = request.tags

        updates["updated_at"] = get_current_time()

        success = metadata_manager.update_sql_favorite(favorite_id, updates)
        if not success:
             raise Exception("更新数据库失败")

        # 获取更新后的完整数据返回
        updated_favorite = metadata_manager.get_sql_favorite(favorite_id)
        return {"success": True, "data": updated_favorite}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新SQL收藏失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"更新SQL收藏失败: {str(e)}")


@router.delete("/api/sql-favorites/{favorite_id}", tags=["SQL Favorites"])
async def delete_sql_favorite(favorite_id: str):
    """删除SQL收藏"""
    try:
        # 检查是否存在
        existing = metadata_manager.get_sql_favorite(favorite_id)
        if not existing:
             raise HTTPException(status_code=404, detail="SQL收藏不存在")

        success = metadata_manager.delete_sql_favorite(favorite_id)
        if not success:
             raise Exception("从数据库删除失败")

        return {"success": True, "data": {"id": favorite_id}}
    except HTTPException:
        raise
        raise HTTPException(status_code=500, detail=f"删除SQL收藏失败: {str(e)}")


@router.post("/api/sql-favorites/{favorite_id}/use", tags=["SQL Favorites"])
async def increment_favorite_usage(favorite_id: str):
    """增加SQL收藏的使用次数"""
    try:
        # 获取当前信息
        existing = metadata_manager.get_sql_favorite(favorite_id)
        if not existing:
             raise HTTPException(status_code=404, detail="SQL收藏不存在")

        # 计算新次数
        current_count = existing.get("usage_count", 0)
        new_count = current_count + 1

        # 更新数据库
        success = metadata_manager.update_sql_favorite(favorite_id, {"usage_count": new_count})
        if not success:
             raise Exception("更新使用次数失败")

        return {"success": True, "usage_count": new_count}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新使用次数失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"更新使用次数失败: {str(e)}")
