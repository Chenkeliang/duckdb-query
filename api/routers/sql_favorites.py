import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Body
from pydantic import BaseModel

from core.common.exceptions import BaseAPIException
from core.database.metadata_manager import metadata_manager
from core.common.timezone_utils import get_current_time
from utils.response_helpers import (
    create_success_response,
    create_list_response,
    MessageCode,
    error_json_response,
)

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


def _raise_favorite_not_found(favorite_id: str) -> None:
    raise BaseAPIException(
        message=f"SQL favorite not found: {favorite_id}",
        status_code=404,
        error_code=MessageCode.FAVORITE_NOT_FOUND.value,
        details={"favorite_id": favorite_id},
    )


def _raise_duplicate_name(name: str) -> None:
    raise BaseAPIException(
        message=f"Favorite name already exists: {name}",
        status_code=400,
        error_code="FAVORITE_NAME_EXISTS",
        details={"field": "name", "name": name},
    )


@router.get("/api/sql-favorites", tags=["SQL Favorites"])
def get_sql_favorites():
    """获取所有SQL收藏"""
    try:
        favorites = metadata_manager.list_sql_favorites()
        return create_list_response(
            items=favorites,
            total=len(favorites),
            message_code=MessageCode.FAVORITES_RETRIEVED,
        )
    except Exception as e:
        logger.error("Failed to get SQL favorites: %s", e, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to get SQL favorites: {str(e)}",
        )


@router.get("/api/sql-favorites/{favorite_id}", tags=["SQL Favorites"])
def get_sql_favorite(favorite_id: str):
    """获取单个 SQL 收藏"""
    try:
        favorite = metadata_manager.get_sql_favorite(favorite_id)
        if not favorite:
            _raise_favorite_not_found(favorite_id)

        return create_success_response(
            data={"favorite": favorite},
            message_code=MessageCode.FAVORITE_RETRIEVED,
        )
    except BaseAPIException:
        raise
    except Exception as e:
        logger.error("Failed to get SQL favorite %s: %s", favorite_id, e, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to get SQL favorite: {str(e)}",
            details={"favorite_id": favorite_id},
        )


@router.post("/api/sql-favorites", tags=["SQL Favorites"])
def create_sql_favorite(request: CreateSQLFavoriteRequest = Body(...)):
    """创建新的SQL收藏"""
    try:
        existing_favorites = metadata_manager.list_sql_favorites()
        if any(fav["name"] == request.name for fav in existing_favorites):
            _raise_duplicate_name(request.name)

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
            return error_json_response(
                500,
                MessageCode.OPERATION_FAILED,
                "Failed to save to database",
            )

        return create_success_response(
            data={"favorite": new_favorite},
            message_code=MessageCode.FAVORITE_CREATED,
        )
    except BaseAPIException:
        raise
    except Exception as e:
        logger.error("Failed to create SQL favorite: %s", e, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to create SQL favorite: {str(e)}",
        )


@router.put("/api/sql-favorites/{favorite_id}", tags=["SQL Favorites"])
def update_sql_favorite(
    favorite_id: str, request: UpdateSQLFavoriteRequest = Body(...)
):
    """更新SQL收藏"""
    try:
        existing = metadata_manager.get_sql_favorite(favorite_id)
        if not existing:
            _raise_favorite_not_found(favorite_id)

        if request.name and request.name != existing["name"]:
            all_favorites = metadata_manager.list_sql_favorites()
            for fav in all_favorites:
                if fav["id"] != favorite_id and fav["name"] == request.name:
                    _raise_duplicate_name(request.name)

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
            return error_json_response(
                500,
                MessageCode.OPERATION_FAILED,
                "Failed to update database",
                details={"favorite_id": favorite_id},
            )

        updated_favorite = metadata_manager.get_sql_favorite(favorite_id)
        return create_success_response(
            data={"favorite": updated_favorite},
            message_code=MessageCode.FAVORITE_UPDATED,
        )

    except BaseAPIException:
        raise
    except Exception as e:
        logger.error("Failed to update SQL favorite: %s", e, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to update SQL favorite: {str(e)}",
            details={"favorite_id": favorite_id},
        )


@router.delete("/api/sql-favorites/{favorite_id}", tags=["SQL Favorites"])
def delete_sql_favorite(favorite_id: str):
    """删除SQL收藏"""
    try:
        existing = metadata_manager.get_sql_favorite(favorite_id)
        if not existing:
            _raise_favorite_not_found(favorite_id)

        success = metadata_manager.delete_sql_favorite(favorite_id)
        if not success:
            return error_json_response(
                500,
                MessageCode.OPERATION_FAILED,
                "Failed to delete from database",
                details={"favorite_id": favorite_id},
            )

        return create_success_response(
            data={"id": favorite_id},
            message_code=MessageCode.FAVORITE_DELETED,
        )
    except BaseAPIException:
        raise
    except Exception as e:
        logger.error("Failed to delete SQL favorite: %s", e, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to delete SQL favorite: {str(e)}",
            details={"favorite_id": favorite_id},
        )


@router.post("/api/sql-favorites/{favorite_id}/use", tags=["SQL Favorites"])
def increment_favorite_usage(favorite_id: str):
    """增加SQL收藏的使用次数"""
    try:
        # 原子自增：单条 SQL 完成"存在性检查 + 自增 + 取回新值"，并发下不会丢计数
        new_count = metadata_manager.increment_sql_favorite_usage(favorite_id)
        if new_count is None:
            _raise_favorite_not_found(favorite_id)

        return create_success_response(
            data={"usage_count": new_count},
            message_code=MessageCode.FAVORITE_USAGE_INCREMENTED,
        )
    except BaseAPIException:
        raise
    except Exception as e:
        logger.error("Failed to update usage count: %s", e, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to update usage count: {str(e)}",
            details={"favorite_id": favorite_id},
        )
