"""
安全配置和工具模块
提供文件验证、SQL注入防护、敏感信息保护等安全功能
"""

import os
import re
import hashlib
import logging
from typing import List, Dict, Any, Optional, Set
from pathlib import Path

# 可选依赖：python-magic
try:
    import magic

    MAGIC_AVAILABLE = True
except ImportError:
    MAGIC_AVAILABLE = False
    magic = None

logger = logging.getLogger(__name__)

# 允许的文件类型和对应的MIME类型
ALLOWED_FILE_TYPES = {
    "csv": ["text/csv", "text/plain", "application/csv"],
    "xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    "xls": ["application/vnd.ms-excel"],
    "json": ["application/json", "text/json"],
    "jsonl": ["application/jsonl", "text/plain"],
    "parquet": ["application/octet-stream"],
    "pq": ["application/octet-stream"],
}

# 文件大小限制（字节）
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
MAX_CHUNK_FILE_SIZE = 1024 * 1024 * 1024  # 1GB for chunked upload

# 危险的SQL关键词
DANGEROUS_SQL_KEYWORDS = {
    "DROP",
    "DELETE",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "INSERT",
    "UPDATE",
    "EXEC",
    "EXECUTE",
    "UNION",
    "SCRIPT",
    "DECLARE",
    "CURSOR",
}

# 敏感信息正则表达式
SENSITIVE_PATTERNS = [
    r'password\s*=\s*[\'"][^\'"]+[\'"]',  # password="xxx"
    r'pwd\s*=\s*[\'"][^\'"]+[\'"]',  # pwd="xxx"
    r'secret\s*=\s*[\'"][^\'"]+[\'"]',  # secret="xxx"
    r'token\s*=\s*[\'"][^\'"]+[\'"]',  # token="xxx"
]


class SecurityValidator:
    """安全验证器"""

    def __init__(self):
        if MAGIC_AVAILABLE and magic is not None:
            try:
                self.magic_mime = magic.Magic(mime=True)
            except Exception as e:
                logger.warning(f"初始化python-magic失败: {str(e)}")
                self.magic_mime = None
        else:
            self.magic_mime = None
            logger.warning("python-magic不可用，将跳过MIME类型检查")

    def validate_file_upload(
        self, file_path: str, filename: str, file_size: int
    ) -> Dict[str, Any]:
        """
        验证上传文件的安全性

        Args:
            file_path: 文件路径
            filename: 文件名
            file_size: 文件大小

        Returns:
            验证结果字典
        """
        result = {
            "valid": False,
            "errors": [],
            "warnings": [],
            "file_type": None,
            "mime_type": None,
        }

        try:
            # 1. 检查文件大小
            if file_size > MAX_FILE_SIZE:
                result["errors"].append(
                    f"文件大小超过限制 ({file_size / 1024 / 1024:.1f}MB > {MAX_FILE_SIZE / 1024 / 1024}MB)"
                )
                return result

            # 2. 检查文件扩展名
            file_extension = Path(filename).suffix.lower().lstrip(".")
            if file_extension not in ALLOWED_FILE_TYPES:
                result["errors"].append(f"不支持的文件类型: {file_extension}")
                return result

            # 3. 检查MIME类型（如果magic可用）
            if os.path.exists(file_path) and self.magic_mime is not None:
                try:
                    detected_mime = self.magic_mime.from_file(file_path)
                    result["mime_type"] = detected_mime

                    allowed_mimes = ALLOWED_FILE_TYPES[file_extension]
                    if detected_mime not in allowed_mimes:
                        result["warnings"].append(
                            f"文件MIME类型不匹配: 检测到 {detected_mime}, 期望 {allowed_mimes}"
                        )
                except Exception as e:
                    logger.warning(f"MIME类型检查失败: {str(e)}")
                    result["warnings"].append("无法检查MIME类型")
            elif self.magic_mime is None:
                result["warnings"].append("MIME类型检查不可用（缺少libmagic）")

            # 4. 检查文件名安全性
            if not self._is_safe_filename(filename):
                result["errors"].append("文件名包含不安全字符")
                return result

            result["valid"] = True
            result["file_type"] = file_extension

        except Exception as e:
            logger.error(f"文件验证失败: {str(e)}")
            result["errors"].append(f"文件验证过程中出错: {str(e)}")

        return result

    def _is_safe_filename(self, filename: str) -> bool:
        """检查文件名是否安全"""
        # 检查路径遍历攻击
        if ".." in filename or "/" in filename or "\\" in filename:
            return False

        # 检查特殊字符
        dangerous_chars = ["<", ">", ":", '"', "|", "?", "*", "\0"]
        if any(char in filename for char in dangerous_chars):
            return False

        return True

    def validate_sql_query(
        self, sql: str, allow_write_operations: bool = False
    ) -> Dict[str, Any]:
        """
        验证SQL查询的安全性

        Args:
            sql: SQL查询语句
            allow_write_operations: 是否允许写操作

        Returns:
            验证结果字典
        """
        result = {"valid": False, "errors": [], "warnings": [], "sanitized_sql": sql}

        try:
            sql_upper = sql.upper().strip()

            # 1. 检查空查询
            if not sql.strip():
                result["errors"].append("SQL查询不能为空")
                return result

            # 2. 检查危险关键词
            if not allow_write_operations:
                for keyword in DANGEROUS_SQL_KEYWORDS:
                    if keyword in sql_upper:
                        if keyword == "CREATE" and "CREATE TABLE" in sql_upper:
                            # 允许CREATE TABLE用于保存查询结果
                            continue
                        result["errors"].append(f"不允许使用 {keyword} 操作")
                        return result

            # 3. 检查SQL注入模式
            injection_patterns = [
                r";\s*(DROP|DELETE|TRUNCATE|ALTER)",
                r"UNION\s+SELECT",
                r"--\s*$",
                r"/\*.*\*/",
            ]

            for pattern in injection_patterns:
                if re.search(pattern, sql_upper):
                    result["warnings"].append(f"检测到可疑SQL模式: {pattern}")

            # 4. 自动添加LIMIT（如果没有）
            if "LIMIT" not in sql_upper and sql_upper.startswith("SELECT"):
                result["sanitized_sql"] = f"{sql.rstrip(';')} LIMIT 10000"
                result["warnings"].append("自动添加LIMIT限制")

            result["valid"] = True

        except Exception as e:
            logger.error(f"SQL验证失败: {str(e)}")
            result["errors"].append(f"SQL验证过程中出错: {str(e)}")

        return result

    def sanitize_log_message(self, message: str) -> str:
        """清理日志消息中的敏感信息"""
        sanitized = message

        for pattern in SENSITIVE_PATTERNS:
            sanitized = re.sub(
                pattern,
                lambda m: m.group(0).split("=")[0] + '="***"',
                sanitized,
                flags=re.IGNORECASE,
            )

        return sanitized


# 全局安全验证器实例
security_validator = SecurityValidator()


def get_file_hash(file_path: str) -> str:
    """计算文件SHA256哈希值"""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


def mask_sensitive_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """遮蔽配置中的敏感信息"""
    masked_config = config.copy()
    sensitive_keys = ["password", "pwd", "secret", "token", "key"]

    for key in masked_config:
        if any(sensitive in key.lower() for sensitive in sensitive_keys):
            masked_config[key] = "***"

    return masked_config
