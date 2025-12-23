"""
公共参数校验模块

所有错误响应必须包含 field 字段，便于前端定位问题

使用示例:
    from core.validators import validate_table_name, validate_pagination, sanitize_path
    
    validate_table_name(request.table_name)
    validate_pagination(limit, offset)
    safe_path = sanitize_path(path, allowed_bases)
"""
import os
import re
from typing import List

from fastapi import HTTPException

# 复用 async_tasks.py 的正则
SAFE_TABLE_NAME_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]{0,63}$')
SAFE_ALIAS_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
SAFE_SHORTCUT_PATTERN = re.compile(r'^(Cmd|Ctrl|Alt|Shift)(\+(Cmd|Ctrl|Alt|Shift|[A-Z0-9]))+$')

# 保护的 Schema 和表前缀
PROTECTED_SCHEMAS = ["information_schema", "pg_catalog", "duckdb_"]
PROTECTED_PREFIX = "system_"

# 分页参数
ALLOWED_LIMITS = [20, 50, 100]


def validate_table_name(name: str, field: str = "table_name") -> None:
    """
    校验表名格式（含系统表和 Schema 保护）
    
    Args:
        name: 表名
        field: 字段名，用于错误响应
        
    Raises:
        HTTPException: 400/403 如果表名不合法
    """
    if not name:
        return  # 允许空值（可选参数）
    
    # 检查是否为保护的 schema
    if "." in name:
        schema = name.split(".")[0].lower()
        for protected in PROTECTED_SCHEMAS:
            if schema == protected or schema.startswith(protected):
                raise HTTPException(403, detail={
                    "code": "PROTECTED_SCHEMA",
                    "message": f"不允许操作系统 Schema: {schema}",
                    "field": field
                })
    
    # 检查保留前缀
    if name.lower().startswith(PROTECTED_PREFIX):
        raise HTTPException(403, detail={
            "code": "RESERVED_NAME",
            "message": f"不能使用 {PROTECTED_PREFIX} 前缀的保留表名",
            "field": field
        })
    
    # 检查格式
    if not SAFE_TABLE_NAME_PATTERN.match(name):
        raise HTTPException(400, detail={
            "code": "INVALID_TABLE_NAME",
            "message": f"表名格式无效: {name}，只能包含字母、数字、下划线，长度不超过64",
            "field": field,
            "details": {"pattern": "^[a-zA-Z_][a-zA-Z0-9_]{0,63}$"}
        })


def validate_alias(alias: str, field: str = "alias") -> None:
    """
    校验数据库别名格式
    
    Args:
        alias: 别名
        field: 字段名，用于错误响应
        
    Raises:
        HTTPException: 400 如果别名不合法
    """
    if not alias:
        raise HTTPException(400, detail={
            "code": "MISSING_ALIAS",
            "message": "别名不能为空",
            "field": field
        })
        
    if not SAFE_ALIAS_PATTERN.match(alias):
        raise HTTPException(400, detail={
            "code": "INVALID_ALIAS",
            "message": f"别名格式无效: {alias}，只能包含字母、数字、下划线",
            "field": field
        })


def validate_shortcut(shortcut: str) -> None:
    """
    校验快捷键格式
    
    Args:
        shortcut: 快捷键字符串，如 "Cmd+S"
        
    Raises:
        HTTPException: 400 如果快捷键格式不合法
    """
    if not shortcut:
        return
        
    if not SAFE_SHORTCUT_PATTERN.match(shortcut):
        raise HTTPException(400, detail={
            "code": "INVALID_SHORTCUT",
            "message": f"快捷键格式无效: {shortcut}，必须为 Cmd+X 格式",
            "field": "shortcut"
        })


def sanitize_path(path: str, allowed_bases: List[str]) -> str:
    """
    校验并规范化路径，防止遍历攻击和符号链接绕过
    
    Args:
        path: 待校验路径
        allowed_bases: 允许的基础路径列表
        
    Returns:
        规范化后的真实路径
        
    Raises:
        HTTPException: 403 如果路径不在白名单内或为符号链接
    """
    if not path:
        raise HTTPException(400, detail={
            "code": "MISSING_PATH",
            "message": "路径不能为空",
            "field": "path"
        })
    
    real_path = os.path.realpath(path)
    
    # 检查路径是否在白名单内
    if not any(real_path.startswith(os.path.realpath(base)) for base in allowed_bases):
        raise HTTPException(403, detail={
            "code": "PATH_NOT_ALLOWED",
            "message": "不允许访问该路径",
            "field": "path"
        })
    
    # 禁止符号链接（防止白名单内的符号链接指向外部）
    if os.path.islink(path):
        raise HTTPException(403, detail={
            "code": "SYMLINK_NOT_ALLOWED",
            "message": "不允许访问符号链接",
            "field": "path"
        })
    
    return real_path


def validate_pagination(limit: int, offset: int, allowed_limits: List[int] = None) -> None:
    """
    校验分页参数
    
    Args:
        limit: 每页条数
        offset: 偏移量
        allowed_limits: 允许的 limit 值列表，默认 [20, 50, 100]
        
    Raises:
        HTTPException: 400 如果参数不合法
    """
    if allowed_limits is None:
        allowed_limits = ALLOWED_LIMITS
    
    if limit not in allowed_limits:
        raise HTTPException(400, detail={
            "code": "INVALID_LIMIT",
            "message": f"limit 必须为 {allowed_limits} 之一",
            "field": "limit",
            "details": {"allowed": allowed_limits}
        })
    
    if offset < 0:
        raise HTTPException(400, detail={
            "code": "INVALID_OFFSET",
            "message": "offset 不能为负数",
            "field": "offset"
        })
