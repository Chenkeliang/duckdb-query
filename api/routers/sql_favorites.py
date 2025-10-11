import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel

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
    created_at: str
    updated_at: str
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


def get_sql_favorites_file_path() -> Path:
    """获取SQL收藏配置文件路径"""
    # 优先使用环境变量，兼容 Docker 环境
    if os.getenv("CONFIG_DIR"):
        config_dir = Path(os.getenv("CONFIG_DIR"))
    else:
        config_dir = Path(__file__).parent.parent.parent / "config"
    return config_dir / "sql-favorites.json"


def load_sql_favorites() -> List[Dict[str, Any]]:
    """加载SQL收藏列表"""
    favorites_file = get_sql_favorites_file_path()

    if not favorites_file.exists():
        return []

    try:
        with open(favorites_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        raise HTTPException(status_code=500, detail=f"读取SQL收藏配置失败: {str(e)}")


def save_sql_favorites(favorites: List[Dict[str, Any]]) -> None:
    """保存SQL收藏列表"""
    favorites_file = get_sql_favorites_file_path()

    try:
        # 确保配置目录存在
        favorites_file.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"保存SQL收藏到文件: {favorites_file}")
        logger.info(f"收藏数量: {len(favorites)}")

        with open(favorites_file, "w", encoding="utf-8") as f:
            json.dump(favorites, f, ensure_ascii=False, indent=2)

        logger.info(f"SQL收藏保存成功")
    except IOError as e:
        logger.error(f"保存SQL收藏配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"保存SQL收藏配置失败: {str(e)}")


def get_current_time() -> str:
    """获取当前时间字符串"""
    return datetime.now().isoformat() + "Z"


@router.get("/api/sql-favorites", tags=["SQL Favorites"])
async def get_sql_favorites():
    """获取所有SQL收藏"""
    try:
        favorites = load_sql_favorites()
        return {"success": True, "data": favorites}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取SQL收藏失败: {str(e)}")


@router.post("/api/sql-favorites", tags=["SQL Favorites"])
async def create_sql_favorite(request: CreateSQLFavoriteRequest = Body(...)):
    """创建新的SQL收藏"""
    try:
        favorites = load_sql_favorites()

        # 检查名称是否已存在
        if any(fav["name"] == request.name for fav in favorites):
            raise HTTPException(status_code=400, detail="收藏名称已存在")

        # 创建新的收藏项
        new_favorite = {
            "id": str(uuid.uuid4()),
            "name": request.name,
            "sql": request.sql,
            "type": request.type,  # 添加类型字段
            "description": request.description or "",
            "tags": request.tags or [],
            "created_at": get_current_time(),
            "updated_at": get_current_time(),
            "usage_count": 0,
        }

        favorites.append(new_favorite)
        save_sql_favorites(favorites)

        return {"success": True, "data": new_favorite}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建SQL收藏失败: {str(e)}")


@router.put("/api/sql-favorites/{favorite_id}", tags=["SQL Favorites"])
async def update_sql_favorite(
    favorite_id: str, request: UpdateSQLFavoriteRequest = Body(...)
):
    """更新SQL收藏"""
    try:
        favorites = load_sql_favorites()

        # 查找要更新的收藏项
        favorite_index = None
        for i, fav in enumerate(favorites):
            if fav["id"] == favorite_id:
                favorite_index = i
                break

        if favorite_index is None:
            raise HTTPException(status_code=404, detail="SQL收藏不存在")

        # 检查名称是否与其他收藏冲突
        if request.name:
            for i, fav in enumerate(favorites):
                if i != favorite_index and fav["name"] == request.name:
                    raise HTTPException(status_code=400, detail="收藏名称已存在")

        # 更新收藏项
        favorite = favorites[favorite_index]
        if request.name is not None:
            favorite["name"] = request.name
        if request.sql is not None:
            favorite["sql"] = request.sql
        if request.type is not None:
            favorite["type"] = request.type
        if request.description is not None:
            favorite["description"] = request.description
        if request.tags is not None:
            favorite["tags"] = request.tags

        favorite["updated_at"] = get_current_time()

        save_sql_favorites(favorites)

        return {"success": True, "data": favorite}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新SQL收藏失败: {str(e)}")


@router.delete("/api/sql-favorites/{favorite_id}", tags=["SQL Favorites"])
async def delete_sql_favorite(favorite_id: str):
    """删除SQL收藏"""
    try:
        favorites = load_sql_favorites()

        # 查找要删除的收藏项
        favorite_index = None
        for i, fav in enumerate(favorites):
            if fav["id"] == favorite_id:
                favorite_index = i
                break

        if favorite_index is None:
            raise HTTPException(status_code=404, detail="SQL收藏不存在")

        # 删除收藏项
        deleted_favorite = favorites.pop(favorite_index)
        save_sql_favorites(favorites)

        return {"success": True, "data": deleted_favorite}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除SQL收藏失败: {str(e)}")


@router.post("/api/sql-favorites/{favorite_id}/use", tags=["SQL Favorites"])
async def use_sql_favorite(favorite_id: str):
    """增加SQL收藏的使用次数"""
    try:
        favorites = load_sql_favorites()

        # 查找要更新的收藏项
        favorite_index = None
        for i, fav in enumerate(favorites):
            if fav["id"] == favorite_id:
                favorite_index = i
                break

        if favorite_index is None:
            raise HTTPException(status_code=404, detail="SQL收藏不存在")

        # 增加使用次数
        favorites[favorite_index]["usage_count"] += 1
        favorites[favorite_index]["updated_at"] = get_current_time()

        save_sql_favorites(favorites)

        return {"success": True, "data": favorites[favorite_index]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新使用次数失败: {str(e)}")
