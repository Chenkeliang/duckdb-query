#!/usr/bin/env python3
"""
全局时区工具模块
统一管理应用的时区设置，从configurationfile读取时区configuration
"""

import os
import json
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional

logger = logging.getLogger(__name__)

# 全局时区configuration
_app_timezone: Optional[ZoneInfo] = None
DEFAULT_TIMEZONE = "Asia/Shanghai"
_STORAGE_TIMEZONE = timezone.utc

def load_timezone_config() -> ZoneInfo:
    """从configurationfileloading时区设置"""
    global _app_timezone
    
    if _app_timezone is not None:
        return _app_timezone
    
    try:
        # 使用configuration管理器getting时区configuration
        from core.common.config_manager import config_manager
        app_config = config_manager.get_app_config()
        timezone_name = app_config.timezone or DEFAULT_TIMEZONE
        
        _app_timezone = ZoneInfo(timezone_name)
        logger.info(f"Loaded timezone configuration: {timezone_name}")
        
        return _app_timezone
        
    except Exception as e:
        logger.error(f"Failed to load timezone configuration: {str(e)}, using default timezone {DEFAULT_TIMEZONE}")
        _app_timezone = ZoneInfo(DEFAULT_TIMEZONE)
        return _app_timezone

def get_current_time() -> datetime:
    """getting当前时间（应用configuration的时区）"""
    tz = load_timezone_config()
    return datetime.now(tz)

def get_current_time_iso() -> str:
    """getting当前时间的 ISO 格式字符串"""
    return get_current_time().isoformat()

def get_yesterday_time() -> datetime:
    """getting昨天的时间"""
    return get_current_time() - timedelta(days=1)

def get_yesterday_time_iso() -> str:
    """getting昨天时间的 ISO 格式字符串"""
    return get_yesterday_time().isoformat()

def format_datetime_for_display(dt: datetime) -> str:
    """格式化时间用于显示"""
    if dt.tzinfo is None:
        # 如果没有时区info，假设是应用时区
        tz = load_timezone_config()
        dt = dt.replace(tzinfo=tz)
    else:
        # 转换到应用时区
        tz = load_timezone_config()
        dt = dt.astimezone(tz)
    
    return dt.strftime("%Y-%m-%d %H:%M:%S %Z")

def parse_datetime_string(dt_string: str) -> datetime:
    """解析时间字符串，返回带时区的 datetime 对象"""
    try:
        # 尝试解析 ISO 格式
        dt = datetime.fromisoformat(dt_string.replace('Z', '+00:00'))
        
        # 如果没有时区info，假设是应用时区
        if dt.tzinfo is None:
            tz = load_timezone_config()
            dt = dt.replace(tzinfo=tz)
        
        return dt
    except Exception as e:
        logger.error(f"Failed to parse time string: {dt_string}, error: {str(e)}")
        # 返回当前时间作为备选
        return get_current_time()

def get_storage_time() -> datetime:
    """getting用于database存储的UTC时间（naive）"""
    return datetime.now(_STORAGE_TIMEZONE).replace(tzinfo=None)

def get_storage_time_iso() -> str:
    """以ISO格式返回UTC存储时间"""
    return get_storage_time().isoformat()

def normalize_to_storage_timezone(value: Optional[datetime]) -> Optional[datetime]:
    """将任意时间归一到UTC naive，用于写入DuckDB"""
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(_STORAGE_TIMEZONE).replace(tzinfo=None)

def format_storage_time_for_response(value: Optional[datetime]) -> Optional[str]:
    """
    将存储用UTC时间转换为应用configuration时区的ISO字符串，便于前端展示
    """
    if value is None:
        return None

    aware_utc = (
        value.replace(tzinfo=_STORAGE_TIMEZONE)
        if value.tzinfo is None
        else value.astimezone(_STORAGE_TIMEZONE)
    )
    app_tz = load_timezone_config()
    return aware_utc.astimezone(app_tz).isoformat()

# 向后兼容的函数别名
now = get_current_time
now_iso = get_current_time_iso
