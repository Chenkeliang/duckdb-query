"""
安全配置和工具模块
提供文件验证、SQL 注入防护、敏感信息保护等安全功能
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

# 允许的文件类型和对应的 MIME 类型
ALLOWED_FILE_TYPES = {
    "csv": ["text/csv", "text/plain", "application/csv"],
    "xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    "xls": ["application/vnd.ms-excel"],
    "json": ["application/json", "text/json"],
    "jsonl": ["application/jsonl", "text/plain"],
    "parquet": ["application/octet-stream"],
    "pq": ["application/octet-stream"],
}


# 文件大小限制（字节）- 从配置文件读取
def get_max_file_size():
    """从配置文件获取最大文件大小限制"""
    try:
        from core.common.config_manager import config_manager

        app_config = config_manager.get_app_config()
        return app_config.max_file_size
    except Exception as e:
        logger.warning(f"Unable to get configuration file, using default value: {str(e)}")
        return 100 * 1024 * 1024  # 100MB 默认值


def get_max_chunk_file_size():
    """获取分块上传的最大文件大小限制"""
    try:
        from core.common.config_manager import config_manager

        app_config = config_manager.get_app_config()
        # 分块上传使用应用配置的文件大小限制
        return app_config.max_file_size
    except Exception as e:
        logger.warning(f"Unable to get configuration file, using default value: {str(e)}")
        return 1024 * 1024 * 1024  # 1GB 默认值


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
                logger.warning(f"Failed to initialize python-magic: {str(e)}")
                self.magic_mime = None
        else:
            self.magic_mime = None
            logger.warning("python-magic not available, will skip MIME type check")

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
            max_size = get_max_file_size()
            if file_size > max_size:
                result["errors"].append(
                    f"file大小超过限制 ({file_size / 1024 / 1024:.1f}MB > {max_size / 1024 / 1024}MB)"
                )
                return result

            # 2. 检查文件扩展名
            file_extension = Path(filename).suffix.lower().lstrip(".")
            if file_extension not in ALLOWED_FILE_TYPES:
                result["errors"].append(f"不支持的file类型: {file_extension}")
                return result

            # 3. 检查MIME类型（如果magic可用）
            if os.path.exists(file_path) and self.magic_mime is not None:
                try:
                    detected_mime = self.magic_mime.from_file(file_path)
                    result["mime_type"] = detected_mime

                    allowed_mimes = ALLOWED_FILE_TYPES[file_extension]
                    if detected_mime not in allowed_mimes:
                        result["warnings"].append(
                            f"fileMIME类型不匹配: 检测到 {detected_mime}, 期望 {allowed_mimes}"
                        )
                except Exception as e:
                    logger.warning(f"MIME type check failed: {str(e)}")
                    result["warnings"].append("无法检查MIME类型")
            elif self.magic_mime is None:
                result["warnings"].append("MIME类型检查不可用（missinglibmagic）")

            # 4. 检查文件名安全性
            if not self._is_safe_filename(filename):
                result["errors"].append("file名包含不安全字符")
                return result

            result["valid"] = True
            result["file_type"] = file_extension

        except Exception as e:
            logger.error(f"File validation failed: {str(e)}")
            result["errors"].append(f"file验证过程中出错: {str(e)}")

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
    """计算文件 SHA256 哈希值"""
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
