"""
密码加密解密工具
用于安全存储和处理数据库连接密码
"""

import base64
import os
import hashlib
import logging

logger = logging.getLogger(__name__)


class SimplePasswordEncryption:
    """简单的密码加密解密类（使用Base64 + 简单混淆）"""

    def __init__(self, salt: str = "DataQuery2024"):
        """
        初始化加密器

        Args:
            salt: 加密盐值
        """
        self.salt = salt

    def encrypt_password(self, password: str) -> str:
        """
        加密密码（使用Base64 + 简单混淆）

        Args:
            password: 明文密码

        Returns:
            加密后的密码
        """
        if not password:
            return ""

        try:
            # 添加盐值
            salted_password = f"{self.salt}:{password}:{self.salt}"
            # Base64编码
            encoded = base64.b64encode(salted_password.encode("utf-8")).decode("utf-8")
            # 添加前缀标识这是加密的密码
            return f"ENC:{encoded}"
        except Exception as e:
            logger.error(f"密码加密失败: {str(e)}")
            return password

    def decrypt_password(self, encrypted_password: str) -> str:
        """
        解密密码

        Args:
            encrypted_password: 加密的密码

        Returns:
            明文密码
        """
        if not encrypted_password or encrypted_password == "********":
            return ""

        # 如果不是加密的密码，直接返回
        if not encrypted_password.startswith("ENC:"):
            return encrypted_password

        try:
            # 移除前缀
            encoded = encrypted_password[4:]
            # Base64解码
            decoded = base64.b64decode(encoded.encode("utf-8")).decode("utf-8")
            # 移除盐值
            parts = decoded.split(":")
            if len(parts) >= 3 and parts[0] == self.salt and parts[-1] == self.salt:
                return ":".join(parts[1:-1])  # 中间部分是原始密码
            else:
                # 格式不正确，返回原始值
                return encrypted_password
        except Exception as e:
            logger.error(f"密码解密失败: {str(e)}")
            # 如果解密失败，可能是旧的未加密密码，直接返回
            return encrypted_password

    def is_encrypted(self, password: str) -> bool:
        """
        检查密码是否已加密

        Args:
            password: 密码字符串

        Returns:
            True if encrypted, False otherwise
        """
        return password and password.startswith("ENC:")


# 全局加密器实例
password_encryptor = SimplePasswordEncryption()


def encrypt_config_passwords(config: dict) -> dict:
    """
    加密配置中的密码字段

    Args:
        config: 配置字典

    Returns:
        加密后的配置字典
    """
    import copy

    config_copy = copy.deepcopy(config)

    if "params" in config_copy and "password" in config_copy["params"]:
        password = config_copy["params"]["password"]
        if password and not password_encryptor.is_encrypted(password):
            config_copy["params"]["password"] = password_encryptor.encrypt_password(
                password
            )

    return config_copy


def decrypt_config_passwords(config: dict) -> dict:
    """
    解密配置中的密码字段

    Args:
        config: 配置字典

    Returns:
        解密后的配置字典
    """
    import copy

    config_copy = copy.deepcopy(config)

    if "params" in config_copy and "password" in config_copy["params"]:
        encrypted_password = config_copy["params"]["password"]
        if encrypted_password and encrypted_password != "********":
            decrypted_password = password_encryptor.decrypt_password(encrypted_password)
            config_copy["params"]["password"] = decrypted_password
            logger.info(
                f"解密密码: {encrypted_password[:20]}... -> {decrypted_password[:5]}..."
            )

    return config_copy


def mask_config_passwords(config: dict) -> dict:
    """
    遮蔽配置中的密码字段（用于显示）

    Args:
        config: 配置字典

    Returns:
        遮蔽密码后的配置字典
    """
    import copy

    config_copy = copy.deepcopy(config)

    if "params" in config_copy and "password" in config_copy["params"]:
        if config_copy["params"]["password"]:
            config_copy["params"]["password"] = "********"

    return config_copy
