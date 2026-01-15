"""
SQL注入防护工具
提高系统安全性
"""

import re
import logging
import json
from datetime import datetime
from typing import Dict, List, Any, Optional, Union
from enum import Enum

from core.common.timezone_utils import get_current_time  # 导入时区工具

logger = logging.getLogger(__name__)


class SecurityLevel(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    STRICT = "strict"


@dataclass
class SecurityViolation:
    type: str
    severity: str
    pattern: str
    description: str
    line_number: Optional[int] = None


class SQLInjectionProtector:
    def __init__(self, security_level: SecurityLevel = SecurityLevel.HIGH):
        self.security_level = security_level
        self.violations: List[SecurityViolation] = []

        # 定义危险模式
        self.dangerous_patterns = {
            "sql_comment": {
                "pattern": r"--.*$|/\*.*?\*/",
                "description": "SQL注释",
                "severity": "high",
            },
            "sql_union": {
                "pattern": r"\bUNION\s+ALL?\b",
                "description": "UNION查询",
                "severity": "critical",
            },
            "sql_drop": {
                "pattern": r"\bDROP\s+(TABLE|DATABASE|INDEX|VIEW)\b",
                "description": "DROP语句",
                "severity": "critical",
            },
            "sql_delete": {
                "pattern": r"\bDELETE\s+FROM\b",
                "description": "DELETE语句",
                "severity": "high",
            },
            "sql_update": {
                "pattern": r"\bUPDATE\s+\w+\s+SET\b",
                "description": "UPDATE语句",
                "severity": "high",
            },
            "sql_insert": {
                "pattern": r"\bINSERT\s+INTO\b",
                "pattern": r"\bINSERT\s+INTO\b",
                "description": "INSERT语句",
                "severity": "high",
            },
            "sql_create": {
                "pattern": r"\bCREATE\s+(TABLE|DATABASE|INDEX|VIEW)\b",
                "description": "CREATE语句",
                "severity": "high",
            },
            "sql_alter": {
                "pattern": r"\bALTER\s+(TABLE|DATABASE)\b",
                "description": "ALTER语句",
                "severity": "high",
            },
            "sql_execute": {
                "pattern": r"\bEXEC\b|\bEXECUTE\b",
                "description": "动态执行语句",
                "severity": "critical",
            },
            "sql_xp_cmdshell": {
                "pattern": r"\bxp_cmdshell\b",
                "description": "系统命令执行",
                "severity": "critical",
            },
            "sql_script_tag": {
                "pattern": r"<script.*?>.*?</script>",
                "description": "脚本标签",
                "severity": "critical",
            },
            "sql_hex_encoding": {
                "pattern": r"0x[0-9a-fA-F]+",
                "description": "十六进制编码",
                "severity": "medium",
            },
            "sql_unicode_escape": {
                "pattern": r"\\u[0-9a-fA-F]{4}",
                "description": "Unicode转义",
                "severity": "medium",
            },
            "sql_null_byte": {
                "pattern": r"\x00",
                "description": "空字节",
                "severity": "high",
            },
            "sql_quoted_string": {
                "pattern": r"'.*?'",
                "description": "引号字符串",
                "severity": "low",
            },
        }

        # 根据安全级别调整检查规则
        self._adjust_patterns_by_security_level()

    def _adjust_patterns_by_security_level(self):
        """根据安全级别调整检查规则"""
        if self.security_level == SecurityLevel.LOW:
            # 低级别：只检查最危险的模式
            self.dangerous_patterns = {
                k: v
                for k, v in self.dangerous_patterns.items()
                if v["severity"] == "critical"
            }
        elif self.security_level == SecurityLevel.MEDIUM:
            # 中级别：检查高危险和关键危险模式
            self.dangerous_patterns = {
                k: v
                for k, v in self.dangerous_patterns.items()
                if v["severity"] in ["high", "critical"]
            }
        elif self.security_level == SecurityLevel.STRICT:
            # 严格级别：检查所有模式，包括低危险
            pass  # 保持所有模式

    def validate_sql(
        self, sql: str, context: str = ""
    ) -> Tuple[bool, List[SecurityViolation]]:
        """验证SQL语句的安全性"""
        self.violations.clear()

        if not sql or not sql.strip():
            return True, []

        # 转换为大写进行检查（不区分大小写）
        sql_upper = sql.upper().strip()

        # 检查是否包含危险模式
        for pattern_name, pattern_info in self.dangerous_patterns.items():
            matches = re.finditer(
                pattern_info["pattern"], sql, re.IGNORECASE | re.MULTILINE
            )

            for match in matches:
                violation = SecurityViolation(
                    type=pattern_name,
                    severity=pattern_info["severity"],
                    pattern=match.group(),
                    description=pattern_info["description"],
                    line_number=self._get_line_number(sql, match.start()),
                )
                self.violations.append(violation)

        # 根据安全级别进行额外检查
        if self.security_level in [SecurityLevel.HIGH, SecurityLevel.STRICT]:
            self._perform_advanced_checks(sql, context)

        # 检查是否通过验证
        is_safe = len(self.violations) == 0

        if not is_safe:
            logger.warning(f"SQL注入检测到安全违规: {len(self.violations)} 个问题")
            for violation in self.violations:
                logger.warning(
                    f"  - {violation.type}: {violation.description} (严重性: {violation.severity})"
                )

        return is_safe, self.violations.copy()

    def _perform_advanced_checks(self, sql: str, context: str):
        """执行高级安全检查"""
        # 检查SQL语句结构
        self._check_sql_structure(sql)

        # 检查上下文相关的安全规则
        if context:
            self._check_context_specific_rules(sql, context)

    def _check_sql_structure(self, sql: str):
        """检查SQL语句结构"""
        # 检查是否以SELECT开头（只允许查询操作）
        if not sql.strip().upper().startswith("SELECT"):
            violation = SecurityViolation(
                type="non_select_statement",
                severity="high",
                pattern=sql.strip()[:50] + "..." if len(sql) > 50 else sql.strip(),
                description="非SELECT语句",
                line_number=1,
            )
            self.violations.append(violation)

        # 检查是否包含多个语句
        if ";" in sql and sql.count(";") > 1:
            violation = SecurityViolation(
                type="multiple_statements",
                severity="high",
                pattern=";",
                description="多个SQL语句",
                line_number=1,
            )
            self.violations.append(violation)

    def _check_context_specific_rules(self, sql: str, context: str):
        """检查上下文相关的安全规则"""
        # 根据上下文应用不同的规则
        if context == "user_query":
            # 用户查询：更严格的限制
            if "INFORMATION_SCHEMA" in sql.upper():
                violation = SecurityViolation(
                    type="system_schema_access",
                    severity="medium",
                    pattern="INFORMATION_SCHEMA",
                    description="访问系统架构信息",
                    line_number=1,
                )
                self.violations.append(violation)

        elif context == "admin_query":
            # 管理员查询：允许更多操作
            pass

    def _get_line_number(self, text: str, position: int) -> int:
        """获取指定位置的行号"""
        return text[:position].count("\n") + 1

    def sanitize_sql(self, sql: str) -> str:
        """清理SQL语句（移除危险内容）"""
        if not sql:
            return sql

        # 移除SQL注释
        sql = re.sub(r"--.*$", "", sql, flags=re.MULTILINE)
        sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)

        # 移除危险关键字
        dangerous_keywords = [
            "UNION",
            "DROP",
            "DELETE",
            "UPDATE",
            "INSERT",
            "CREATE",
            "ALTER",
            "EXEC",
            "EXECUTE",
            "xp_cmdshell",
        ]

        for keyword in dangerous_keywords:
            sql = re.sub(rf"\b{keyword}\b", f"/*{keyword}*/", sql, flags=re.IGNORECASE)

        # 移除脚本标签
        sql = re.sub(
            r"<script.*?>.*?</script>", "", sql, flags=re.IGNORECASE | re.DOTALL
        )

        # 清理多余的空格
        sql = re.sub(r"\s+", " ", sql).strip()

        return sql

    def get_security_report(self) -> Dict[str, Any]:
        """获取安全报告"""
        return {
            "security_level": self.security_level.value,
            "total_violations": len(self.violations),
            "violations_by_severity": self._group_violations_by_severity(),
            "recommendations": self._generate_recommendations(),
            "timestamp": self._get_timestamp(),
        }

    def _group_violations_by_severity(self) -> Dict[str, int]:
        """按严重性分组违规"""
        groups = {}
        for violation in self.violations:
            severity = violation.severity
            groups[severity] = groups.get(severity, 0) + 1
        return groups

    def _generate_recommendations(self) -> List[str]:
        """生成安全建议"""
        recommendations = []

        if not self.violations:
            recommendations.append("SQL语句通过安全检查")
            return recommendations

        # 根据违规类型生成建议
        violation_types = set(violation.type for violation in self.violations)

        if "sql_union" in violation_types:
            recommendations.append("避免使用UNION语句，可能被用于数据泄露")

        if "sql_drop" in violation_types:
            recommendations.append("避免使用DROP语句，可能导致数据丢失")

        if "sql_execute" in violation_types:
            recommendations.append("避免使用动态执行语句，存在代码注入风险")

        if "multiple_statements" in violation_types:
            recommendations.append("避免在单个查询中包含多个SQL语句")

        recommendations.append("建议使用参数化查询来防止SQL注入")
        recommendations.append("定期审查SQL查询的安全策略")

        return recommendations

    def _get_timestamp(self) -> str:
        """获取当前时间戳"""
        try:
            from core.common.timezone_utils import get_current_time_iso

            return get_current_time_iso()  # 使用统一的时区配置
        except ImportError:
            # 如果无法导入时区工具，使用默认时间
            from datetime import datetime

            return get_current_time().isoformat()


# 全局SQL注入防护器实例
_sql_protector = None


def get_sql_protector(
    security_level: SecurityLevel = SecurityLevel.HIGH,
) -> SQLInjectionProtector:
    """获取SQL注入防护器实例"""
    global _sql_protector
    if _sql_protector is None:
        _sql_protector = SQLInjectionProtector(security_level)
    return _sql_protector


def validate_sql_safe(sql: str, context: str = "") -> bool:
    """快速验证SQL是否安全"""
    protector = get_sql_protector()
    is_safe, _ = protector.validate_sql(sql, context)
    return is_safe


def sanitize_sql_safe(sql: str) -> str:
    """安全地清理SQL语句"""
    protector = get_sql_protector()
    return protector.sanitize_sql(sql)
