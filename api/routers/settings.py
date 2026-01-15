"""
Settings API - 用户设置管理
包括键盘快捷键自定义等功能
"""

import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.database.duckdb_pool import get_connection_pool
from utils.response_helpers import (
    create_success_response,
    create_error_response,
    MessageCode,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])


# ============================================================================
# 数据模型
# ============================================================================

class ShortcutUpdate(BaseModel):
    """快捷键更新请求"""
    shortcut: str

class ShortcutReset(BaseModel):
    """快捷键重置请求"""
    action_id: Optional[str] = None  # 如果为空，重置所有

class ShortcutRecord(BaseModel):
    """快捷键记录"""
    action_id: str
    shortcut: str
    updated_at: Optional[str] = None

# ============================================================================
# 默认快捷键配置
# ============================================================================

DEFAULT_SHORTCUTS = {
    "openCommandPalette": "Cmd+K",
    "navigateDataSource": "Cmd+D",
    "navigateQueryWorkbench": "Cmd+J",
    "refreshData": "Cmd+Shift+F",
    "uploadFile": "Cmd+U",
    "toggleTheme": "Cmd+Shift+T",
    "toggleLanguage": "Cmd+Shift+L",
}

# ============================================================================
# 表初始化
# ============================================================================

def ensure_shortcuts_table():
    """确保快捷键表存在"""
    pool = get_connection_pool()
    with pool.get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS system_keyboard_shortcuts (
                action_id VARCHAR PRIMARY KEY,
                shortcut VARCHAR NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        logger.info("system_keyboard_shortcuts 表已确保存在")

# ============================================================================
# API 端点
# ============================================================================

@router.get("/shortcuts")
async def get_shortcuts():
    """
    获取所有快捷键配置
    返回用户自定义的快捷键，与默认值合并
    """
    try:
        ensure_shortcuts_table()
        
        pool = get_connection_pool()
        with pool.get_connection() as conn:
            result = conn.execute("""
                SELECT action_id, shortcut, updated_at
                FROM system_keyboard_shortcuts
            """).fetchall()
        
        # 构建用户自定义快捷键映射
        custom_shortcuts = {}
        for row in result:
            custom_shortcuts[row[0]] = {
                "action_id": row[0],
                "shortcut": row[1],
                "updated_at": row[2].isoformat() if row[2] else None
            }
        
        # 合并默认值和自定义值
        shortcuts = []
        for action_id, default_shortcut in DEFAULT_SHORTCUTS.items():
            if action_id in custom_shortcuts:
                shortcuts.append(custom_shortcuts[action_id])
            else:
                shortcuts.append({
                    "action_id": action_id,
                    "shortcut": default_shortcut,
                    "updated_at": None
                })
        
        return create_success_response(
            data={"shortcuts": shortcuts, "defaults": DEFAULT_SHORTCUTS},
            message_code=MessageCode.OPERATION_SUCCESS,
            message="获取快捷键配置成功"
        )
        
    except Exception as e:
        logger.error(f"获取快捷键配置失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=create_error_response(
                code="SHORTCUTS_LOAD_FAILED",
                message=f"获取快捷键配置失败: {str(e)}"
            )
        )


@router.put("/shortcuts/{action_id}")
async def update_shortcut(action_id: str, data: ShortcutUpdate):
    """
    更新单个快捷键
    """
    try:
        # 验证 action_id 是否有效
        if action_id not in DEFAULT_SHORTCUTS:
            raise HTTPException(
                status_code=400,
                detail=create_error_response(
                    code="INVALID_ACTION_ID",
                    message=f"无效的操作ID: {action_id}"
                )
            )
        
        ensure_shortcuts_table()
        
        pool = get_connection_pool()
        with pool.get_connection() as conn:
            # 使用 Python 生成时间戳，避免 DuckDB 的 CURRENT_TIMESTAMP 在 VALUES 中的问题
            current_time = datetime.utcnow()
            
            # 使用 INSERT ... ON CONFLICT 实现 upsert (DuckDB 语法)
            conn.execute("""
                INSERT INTO system_keyboard_shortcuts 
                (action_id, shortcut, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT (action_id) DO UPDATE SET
                    shortcut = EXCLUDED.shortcut,
                    updated_at = EXCLUDED.updated_at
            """, [action_id, data.shortcut, current_time])
        
        logger.info(f"更新快捷键: {action_id} -> {data.shortcut}")
        
        return create_success_response(
            data={"action_id": action_id, "shortcut": data.shortcut},
            message_code=MessageCode.OPERATION_SUCCESS,
            message="快捷键更新成功"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新快捷键失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=create_error_response(
                code="SHORTCUT_UPDATE_FAILED",
                message=f"更新快捷键失败: {str(e)}"
            )
        )


@router.post("/shortcuts/reset")
async def reset_shortcuts(data: ShortcutReset):
    """
    重置快捷键
    如果提供 action_id，只重置该快捷键
    如果不提供，重置所有快捷键
    """
    try:
        ensure_shortcuts_table()
        
        pool = get_connection_pool()
        with pool.get_connection() as conn:
            if data.action_id:
                # 验证 action_id 是否有效
                if data.action_id not in DEFAULT_SHORTCUTS:
                    raise HTTPException(
                        status_code=400,
                        detail=create_error_response(
                            code="INVALID_ACTION_ID",
                            message=f"无效的操作ID: {data.action_id}"
                        )
                    )
                
                # 删除单个快捷键记录（恢复为默认值）
                conn.execute("""
                    DELETE FROM system_keyboard_shortcuts
                    WHERE action_id = ?
                """, [data.action_id])
                
                logger.info(f"重置快捷键: {data.action_id}")
                message = f"快捷键 {data.action_id} 已重置为默认值"
            else:
                # 删除所有快捷键记录
                conn.execute("DELETE FROM system_keyboard_shortcuts")
                logger.info("重置所有快捷键")
                message = "所有快捷键已重置为默认值"
        
        return create_success_response(
            data={"reset": data.action_id or "all"},
            message_code=MessageCode.OPERATION_SUCCESS,
            message=message
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"重置快捷键失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=create_error_response(
                code="SHORTCUT_RESET_FAILED",
                message=f"重置快捷键失败: {str(e)}"
            )
        )
