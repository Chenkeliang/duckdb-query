"""
加密/解密工具 - 用于保护敏感信息（如数据库密码）
"""

import json
import base64
import logging
import os
from typing import Any, Dict

logger = logging.getLogger(__name__)


class EncryptionUtils:
    """加密/解密工具类"""

    # 简单的 XOR 加密密钥（生产环境应使用更安全的方式）
    _KEY = os.getenv("DUCKQUERY_ENCRYPTION_KEY", "duckquery_default_key_2024")

    @classmethod
    def _xor_encrypt_decrypt(cls, data: bytes, key: str) -> bytes:
        """XOR 加密/解密（对称加密）"""
        key_bytes = key.encode("utf-8")
        key_len = len(key_bytes)
        return bytes([data[i] ^ key_bytes[i % key_len] for i in range(len(data))])

    @classmethod
    def encrypt_password(cls, password: str) -> str:
        """
        加密密码
        
        Args:
            password: 明文密码
            
        Returns:
            加密后的密码（Base64 编码）
        """
        if not password:
            return ""

        try:
            # 转换为字节
            password_bytes = password.encode("utf-8")

            # XOR 加密
            encrypted_bytes = cls._xor_encrypt_decrypt(password_bytes, cls._KEY)

            # Base64 编码
            encrypted_b64 = base64.b64encode(encrypted_bytes).decode("utf-8")

            return encrypted_b64

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("密码加密失败: %s", e)
            # 如果加密失败，返回原密码（向后兼容）
            return password

    @classmethod
    def decrypt_password(cls, encrypted: str) -> str:
        """
        解密密码
        
        Args:
            encrypted: 加密的密码（Base64 编码）
            
        Returns:
            明文密码
        """
        if not encrypted:
            return ""

        try:
            # Base64 解码
            encrypted_bytes = base64.b64decode(encrypted.encode("utf-8"))

            # XOR 解密
            decrypted_bytes = cls._xor_encrypt_decrypt(encrypted_bytes, cls._KEY)

            # 转换为字符串
            password = decrypted_bytes.decode("utf-8")

            return password

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("密码解密失败: %s", e)
            # 如果解密失败，返回原字符串（可能是未加密的密码）
            return encrypted

    @classmethod
    def encrypt_json(cls, data: Dict[str, Any]) -> str:
        """
        加密 JSON 数据中的敏感字段
        
        Args:
            data: 包含敏感信息的字典
            
        Returns:
            JSON 字符串（敏感字段已加密）
        """
        if not data:
            return "{}"

        try:
            # 复制数据，避免修改原始数据
            encrypted_data = data.copy()

            # 定义需要加密的敏感字段
            sensitive_fields = ["password", "secret", "token", "key", "credential", "api_key"]

            # 加密敏感字段
            for field in sensitive_fields:
                if field in encrypted_data and encrypted_data[field]:
                    encrypted_data[field] = cls.encrypt_password(str(encrypted_data[field]))

            return json.dumps(encrypted_data)

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("JSON 加密失败: %s", e)
            # 如果加密失败，返回原数据
            return json.dumps(data)

    @classmethod
    def decrypt_json(cls, encrypted: str) -> Dict[str, Any]:
        """
        解密 JSON 数据中的敏感字段
        
        Args:
            encrypted: JSON 字符串（敏感字段已加密）
            
        Returns:
            解密后的字典
        """
        if not encrypted:
            return {}

        try:
            # 解析 JSON
            data = json.loads(encrypted)

            # 定义需要解密的敏感字段
            sensitive_fields = ["password", "secret", "token", "key", "credential", "api_key"]

            # 解密敏感字段
            for field in sensitive_fields:
                if field in data and data[field]:
                    data[field] = cls.decrypt_password(str(data[field]))

            return data

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("JSON 解密失败: %s", e)
            # 如果解密失败，尝试返回原数据
            try:
                return json.loads(encrypted)
            except Exception:  # pylint: disable=broad-exception-caught
                return {}

    @classmethod
    def is_encrypted(cls, text: str) -> bool:
        """
        检查文本是否已加密
        
        Args:
            text: 待检查的文本
            
        Returns:
            True 如果已加密，False 否则
        """
        if not text:
            return False

        try:
            # 尝试 Base64 解码
            base64.b64decode(text.encode("utf-8"))
            # 如果能成功解码，可能是加密的
            return True
        except Exception:  # pylint: disable=broad-exception-caught
            # 如果解码失败，不是加密的
            return False


# 便捷函数
def encrypt_password(password: str) -> str:
    """加密密码（便捷函数）"""
    return EncryptionUtils.encrypt_password(password)


def decrypt_password(encrypted: str) -> str:
    """解密密码（便捷函数）"""
    return EncryptionUtils.decrypt_password(encrypted)


def encrypt_json(data: Dict[str, Any]) -> str:
    """加密 JSON 数据（便捷函数）"""
    return EncryptionUtils.encrypt_json(data)


def decrypt_json(encrypted: str) -> Dict[str, Any]:
    """解密 JSON 数据（便捷函数）"""
    return EncryptionUtils.decrypt_json(encrypted)
