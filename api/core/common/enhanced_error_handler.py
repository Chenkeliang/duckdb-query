"""
增强的错误处理工具
提高系统稳定性
"""

import logging
import json
import traceback
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, field, asdict
from enum import Enum
import os
import sys

from core.common.timezone_utils import get_current_time  # 导入时区工具

logger = logging.getLogger(__name__)


class ErrorSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ErrorCategory(Enum):
    VALIDATION = "validation"
    DATABASE = "database"
    NETWORK = "network"
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    RESOURCE = "resource"
    SYSTEM = "system"
    UNKNOWN = "unknown"


@dataclass
class ErrorContext:
    """错误上下文信息"""

    user_id: Optional[str] = None
    request_id: Optional[str] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime = field(default_factory=get_current_time)
    additional_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ErrorInfo:
    """错误详细信息"""

    error_type: str
    error_message: str
    severity: ErrorSeverity
    category: ErrorCategory
    context: ErrorContext
    stack_trace: Optional[str] = None
    original_exception: Optional[Exception] = None
    error_code: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    created_at: datetime = field(default_factory=get_current_time)
    resolved_at: Optional[datetime] = None


class EnhancedErrorHandler:
    def __init__(self):
        self.error_log: List[ErrorInfo] = []
        self.error_patterns: Dict[str, Dict[str, Any]] = {}
        self.retry_strategies: Dict[str, Dict[str, Any]] = {}
        self._initialize_error_patterns()
        self._initialize_retry_strategies()

    def _initialize_error_patterns(self):
        """初始化错误模式识别"""
        self.error_patterns = {
            "database_connection": {
                "patterns": [
                    "connection refused",
                    "timeout",
                    "connection lost",
                    "database is locked",
                    "disk full",
                ],
                "category": ErrorCategory.DATABASE,
                "severity": ErrorSeverity.HIGH,
                "retryable": True,
                "max_retries": 3,
                "retry_delay": 1.0,
            },
            "validation_error": {
                "patterns": ["invalid", "missing", "required", "format", "type"],
                "category": ErrorCategory.VALIDATION,
                "severity": ErrorSeverity.MEDIUM,
                "retryable": False,
                "max_retries": 0,
                "retry_delay": 0.0,
            },
            "authentication_error": {
                "patterns": [
                    "unauthorized",
                    "forbidden",
                    "invalid token",
                    "expired",
                    "permission denied",
                ],
                "category": ErrorCategory.AUTHENTICATION,
                "severity": ErrorSeverity.HIGH,
                "retryable": False,
                "max_retries": 0,
                "retry_delay": 0.0,
            },
            "resource_error": {
                "patterns": [
                    "not found",
                    "does not exist",
                    "already exists",
                    "conflict",
                    "duplicate",
                ],
                "category": ErrorCategory.RESOURCE,
                "severity": ErrorSeverity.MEDIUM,
                "retryable": False,
                "max_retries": 0,
                "retry_delay": 0.0,
            },
            "system_error": {
                "patterns": [
                    "internal server error",
                    "out of memory",
                    "system error",
                    "fatal error",
                ],
                "category": ErrorCategory.SYSTEM,
                "severity": ErrorSeverity.CRITICAL,
                "retryable": True,
                "max_retries": 2,
                "retry_delay": 5.0,
            },
        }

    def _initialize_retry_strategies(self):
        """初始化重试策略"""
        self.retry_strategies = {
            "exponential_backoff": {
                "base_delay": 1.0,
                "max_delay": 60.0,
                "multiplier": 2.0,
            },
            "linear_backoff": {"base_delay": 1.0, "max_delay": 30.0, "increment": 1.0},
            "fixed_delay": {"delay": 2.0},
        }

    def analyze_error(self, exception: Exception, context: ErrorContext) -> ErrorInfo:
        """分析错误并返回详细信息"""
        error_message = str(exception)
        error_type = type(exception).__name__

        # 识别错误类别和严重性
        category, severity, retryable, max_retries, retry_delay = self._classify_error(
            error_message
        )

        # 创建错误信息
        error_info = ErrorInfo(
            error_type=error_type,
            error_message=error_message,
            severity=severity,
            category=category,
            context=context,
            stack_trace=traceback.format_exc(),
            original_exception=exception,
            max_retries=max_retries,
        )

        # 记录错误
        self.error_log.append(error_info)

        # 记录到日志
        self._log_error(error_info)

        return error_info

    def _classify_error(self, error_message: str) -> tuple:
        """分类错误"""
        error_message_lower = error_message.lower()

        for pattern_name, pattern_info in self.error_patterns.items():
            for pattern in pattern_info["patterns"]:
                if pattern.lower() in error_message_lower:
                    return (
                        pattern_info["category"],
                        pattern_info["severity"],
                        pattern_info["retryable"],
                        pattern_info["max_retries"],
                        pattern_info["retry_delay"],
                    )

        # 默认分类
        return (ErrorCategory.UNKNOWN, ErrorSeverity.MEDIUM, False, 0, 0.0)

    def _log_error(self, error_info: ErrorInfo):
        """记录错误到日志"""
        log_message = (
            f"错误: {error_info.error_type} - {error_info.error_message} "
            f"(严重性: {error_info.severity.value}, 类别: {error_info.category.value})"
        )

        if error_info.severity == ErrorSeverity.CRITICAL:
            logger.critical(log_message)
        elif error_info.severity == ErrorSeverity.HIGH:
            logger.error(log_message)
        elif error_info.severity == ErrorSeverity.MEDIUM:
            logger.warning(log_message)
        else:
            logger.info(log_message)

        # 记录堆栈跟踪
        if error_info.stack_trace:
            logger.debug(f"堆栈跟踪:\n{error_info.stack_trace}")

    def should_retry(self, error_info: ErrorInfo) -> bool:
        """判断是否应该重试"""
        return error_info.retryable and error_info.retry_count < error_info.max_retries

    def get_retry_delay(
        self, error_info: ErrorInfo, strategy: str = "exponential_backoff"
    ) -> float:
        """获取重试延迟时间"""
        if strategy not in self.retry_strategies:
            strategy = "fixed_delay"

        strategy_config = self.retry_strategies[strategy]

        if strategy == "exponential_backoff":
            delay = strategy_config["base_delay"] * (
                strategy_config["multiplier"] ** error_info.retry_count
            )
            return min(delay, strategy_config["max_delay"])
        elif strategy == "linear_backoff":
            delay = strategy_config["base_delay"] + (
                strategy_config["increment"] * error_info.retry_count
            )
            return min(delay, strategy_config["max_delay"])
        else:  # fixed_delay
            return strategy_config["delay"]

    def create_user_friendly_error(self, error_info: ErrorInfo) -> Dict[str, Any]:
        """创建用户友好的错误信息"""
        base_error = {
            "success": False,
            "error_type": error_info.category.value,
            "severity": error_info.severity.value,
            "timestamp": error_info.created_at.isoformat(),
        }

        # 根据错误类别生成不同的错误信息
        if error_info.category == ErrorCategory.VALIDATION:
            base_error.update(
                {
                    "error": "输入数据验证失败",
                    "details": error_info.error_message,
                    "suggestion": "请检查输入数据格式是否正确",
                }
            )
        elif error_info.category == ErrorCategory.DATABASE:
            base_error.update(
                {
                    "error": "数据库操作失败",
                    "details": "系统暂时无法访问数据库",
                    "suggestion": "请稍后重试，如果问题持续存在请联系管理员",
                }
            )
        elif error_info.category == ErrorCategory.AUTHENTICATION:
            base_error.update(
                {
                    "error": "身份验证失败",
                    "details": "您的登录信息无效或已过期",
                    "suggestion": "请重新登录",
                }
            )
        elif error_info.category == ErrorCategory.RESOURCE:
            base_error.update(
                {
                    "error": "资源操作失败",
                    "details": error_info.error_message,
                    "suggestion": "请检查资源是否存在或您是否有权限访问",
                }
            )
        elif error_info.category == ErrorCategory.SYSTEM:
            base_error.update(
                {
                    "error": "系统错误",
                    "details": "系统遇到内部错误",
                    "suggestion": "请稍后重试，如果问题持续存在请联系技术支持",
                }
            )
        else:
            base_error.update(
                {
                    "error": "未知错误",
                    "details": error_info.error_message,
                    "suggestion": "请稍后重试或联系技术支持",
                }
            )

        # 添加重试信息
        if self.should_retry(error_info):
            base_error["retryable"] = True
            base_error["retry_count"] = error_info.retry_count
            base_error["max_retries"] = error_info.max_retries
        else:
            base_error["retryable"] = False

        return base_error

    def handle_error_with_retry(self, func, *args, **kwargs) -> Any:
        """带重试的错误处理"""
        max_attempts = 3
        attempt = 0

        while attempt < max_attempts:
            try:
                return func(*args, **kwargs)
            except Exception as e:
                attempt += 1

                # 创建错误上下文
                context = ErrorContext(
                    endpoint="retry_function",
                    method="retry",
                    additional_data={
                        "function": func.__name__,
                        "attempt": attempt,
                        "max_attempts": max_attempts,
                    },
                )

                # 分析错误
                error_info = self.analyze_error(e, context)

                # 判断是否应该重试
                if not self.should_retry(error_info) or attempt >= max_attempts:
                    raise e

                # 计算重试延迟
                delay = self.get_retry_delay(error_info)
                logger.info(f"第 {attempt} 次尝试失败，{delay} 秒后重试")
                time.sleep(delay)

        # 所有重试都失败了
        raise Exception(f"函数 {func.__name__} 在 {max_attempts} 次尝试后仍然失败")

    def get_error_statistics(self) -> Dict[str, Any]:
        """获取错误统计信息"""
        if not self.error_log:
            return {"total_errors": 0}

        # 按类别统计
        category_stats = {}
        severity_stats = {}

        for error in self.error_log:
            # 类别统计
            category = error.category.value
            category_stats[category] = category_stats.get(category, 0) + 1

            # 严重性统计
            severity = error.severity.value
            severity_stats[severity] = severity_stats.get(severity, 0) + 1

        # 最近错误
        recent_errors = sorted(
            self.error_log, key=lambda x: x.created_at, reverse=True
        )[:10]

        return {
            "total_errors": len(self.error_log),
            "category_distribution": category_stats,
            "severity_distribution": severity_stats,
            "recent_errors": [
                {
                    "type": e.error_type,
                    "message": e.error_message,
                    "category": e.category.value,
                    "severity": e.severity.value,
                    "timestamp": e.created_at.isoformat(),
                }
                for e in recent_errors
            ],
            "last_updated": get_current_time(),  # 使用统一的时区配置
        }

    def clear_old_errors(self, days: int = 30):
        """清理旧错误记录"""
        cutoff_date = get_current_time().replace(day=get_current_time().day - days)
        self.error_log = [
            error for error in self.error_log if error.created_at > cutoff_date
        ]
        logger.info(f"已清理 {days} 天前的错误记录")


# 全局错误处理器实例
_error_handler = None


def get_error_handler() -> EnhancedErrorHandler:
    """获取错误处理器实例"""
    global _error_handler
    if _error_handler is None:
        _error_handler = EnhancedErrorHandler()
    return _error_handler


def handle_error_safely(exception: Exception, context: ErrorContext) -> Dict[str, Any]:
    """安全地处理错误"""
    handler = get_error_handler()
    error_info = handler.analyze_error(exception, context)
    return handler.create_user_friendly_error(error_info)


def retry_on_error(func, *args, **kwargs) -> Any:
    """带重试的函数执行"""
    handler = get_error_handler()
    return handler.handle_error_with_retry(func, *args, **kwargs)
