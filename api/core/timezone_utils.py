#!/usr/bin/env python3
"""
全局时区工具模块
统一管理应用的时区设置，从配置文件读取时区配置
"""

import os
import json
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional

logger = logging.getLogger(__name__)

# 全局时区配置
_app_timezone: Optional[ZoneInfo] = None

def load_timezone_config() -> ZoneInfo:
    """从配置文件加载时区设置"""
    global _app_timezone
    
    if _app_timezone is not None:
        return _app_timezone
    
    try:
        # 使用配置管理器获取时区配置
        from core.config_manager import config_manager
        app_config = config_manager.get_app_config()
        timezone_name = app_config.timezone
        
        _app_timezone = ZoneInfo(timezone_name)
        logger.info(f"已加载时区配置: {timezone_name}")
        
        return _app_timezone
        
    except Exception as e:
        logger.error(f"加载时区配置失败: {str(e)}，使用默认时区 Asia/Shanghai")
        _app_timezone = ZoneInfo("Asia/Shanghai")
        return _app_timezone

def get_current_time() -> datetime:
    """获取当前时间（应用配置的时区）"""
    tz = load_timezone_config()
    return datetime.now(tz)

def get_current_time_iso() -> str:
    """获取当前时间的 ISO 格式字符串"""
    return get_current_time().isoformat()

def get_yesterday_time() -> datetime:
    """获取昨天的时间"""
    from datetime import timedelta
    return get_current_time() - timedelta(days=1)

def get_yesterday_time_iso() -> str:
    """获取昨天时间的 ISO 格式字符串"""
    return get_yesterday_time().isoformat()

def format_datetime_for_display(dt: datetime) -> str:
    """格式化时间用于显示"""
    if dt.tzinfo is None:
        # 如果没有时区信息，假设是应用时区
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
        
        # 如果没有时区信息，假设是应用时区
        if dt.tzinfo is None:
            tz = load_timezone_config()
            dt = dt.replace(tzinfo=tz)
        
        return dt
    except Exception as e:
        logger.error(f"解析时间字符串失败: {dt_string}, 错误: {str(e)}")
        # 返回当前时间作为备选
        return get_current_time()

# 向后兼容的函数别名
now = get_current_time
now_iso = get_current_time_iso