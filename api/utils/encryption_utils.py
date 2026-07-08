"""
加密/解密工具 - 用于保护敏感信息（如数据库密码）
"""

import json
import base64
import logging
import os
from typing import Any, Dict

logger = logging.getLogger(__name__)

# 敏感字段名单：encrypt_json/decrypt_json/needs_key_migration 共用同一份，
# 避免三处独立维护同一个列表、逐渐漂移。
SENSITIVE_FIELDS = ("password", "secret", "token", "key", "credential", "api_key")

# v2 前缀标记密文使用的是本机随机持久化密钥；不带前缀的历史数据一律按
# 下面这个曾经写死在源码里的默认值解密——2026-07 之前的所有部署都只用
# 过这一个默认值（DUCKQUERY_ENCRYPTION_KEY 环境变量从未被设置过），所以
# 这个回退分支覆盖了全部历史数据，不是猜测。
_V2_PREFIX = "v2:"
_LEGACY_DEFAULT_KEY = "duckquery_default_key_2024"


def _load_persisted_key() -> str:
    """本机随机生成、持久化到磁盘的密钥。

    复用 core.common.paths.load_or_create_secret_key() 管理的同一个 secret.key
    文件——这个文件已经是"随机生成 + 本机持久化"的正确实现（供
    core.security.encryption 的 Fernet 加密使用），XOR 密钥没有理由再造
    一套独立的密钥文件和生成逻辑。DUCKQUERY_ENCRYPTION_KEY 环境变量仍可
    显式覆盖，用于需要跨机器共享同一密钥的部署场景。
    """
    override = os.getenv("DUCKQUERY_ENCRYPTION_KEY")
    if override:
        return override

    from core.common.paths import load_or_create_secret_key

    return load_or_create_secret_key().decode("ascii")


class EncryptionUtils:
    """加密/解密工具类"""

    _KEY = _load_persisted_key()
    # 历史(无 v2: 前缀)数据用「v2 迁移之前那把有效密钥」解密:env 覆盖优先,
    # 否则源码写死的默认值——这正是旧版 decrypt_password 用过的 key。之前这里
    # 只写死默认值、忽略了 DUCKQUERY_ENCRYPTION_KEY:任何曾设过该环境变量的部署,
    # 其历史密文会被用错误的密钥 XOR 解成乱码并原样落库,造成不可逆的数据损坏。
    _LEGACY_KEY = os.getenv("DUCKQUERY_ENCRYPTION_KEY") or _LEGACY_DEFAULT_KEY

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

            # XOR 加密（本机随机密钥）
            encrypted_bytes = cls._xor_encrypt_decrypt(password_bytes, cls._KEY)

            # Base64 编码，前缀标记"这是新密钥加密的"
            encrypted_b64 = base64.b64encode(encrypted_bytes).decode("utf-8")

            return _V2_PREFIX + encrypted_b64

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("Password encryption failed: %s", e)
            # 如果加密失败，返回原密码（向后兼容）
            return password

    @classmethod
    def decrypt_password(cls, encrypted: str) -> str:
        """
        解密密码

        带 v2: 前缀 → 本机随机密钥；不带前缀 → 历史数据，按曾经写死在源码里
        的默认密钥解密（见模块头部 _LEGACY_DEFAULT_KEY 的说明）。是否发生了
        "旧密钥回退"由 needs_key_migration() 独立判断，调用方据此决定要不要
        用新密钥重新加密写回——本方法只负责解出正确的明文，不做任何写入。

        Args:
            encrypted: 加密的密码（Base64 编码，可能带 v2: 前缀）

        Returns:
            明文密码
        """
        if not encrypted:
            return ""

        try:
            if encrypted.startswith(_V2_PREFIX):
                payload = encrypted[len(_V2_PREFIX):]
                key = cls._KEY
            else:
                payload = encrypted
                key = cls._LEGACY_KEY

            # Base64 解码
            encrypted_bytes = base64.b64decode(payload.encode("utf-8"))

            # XOR 解密
            decrypted_bytes = cls._xor_encrypt_decrypt(encrypted_bytes, key)

            # 转换为字符串
            password = decrypted_bytes.decode("utf-8")

            return password

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("Password decryption failed: %s", e)
            # 如果解密失败，返回原字符串（可能是未加密的密码）
            return encrypted

    @classmethod
    def needs_key_migration(cls, encrypted: str) -> bool:
        """encrypted 是否仍带着历史默认密钥加密的密文（没有 v2: 前缀）。

        只看前缀，不解密——供调用方在已经读到明文之后，判断要不要用新
        密钥重新加密写回，属于纯粹的元数据判断，不改变 encrypted 本身。
        """
        if not encrypted:
            return False
        return not encrypted.startswith(_V2_PREFIX)

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

            # 加密敏感字段
            for field in SENSITIVE_FIELDS:
                if field in encrypted_data and encrypted_data[field]:
                    encrypted_data[field] = cls.encrypt_password(str(encrypted_data[field]))

            return json.dumps(encrypted_data)

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("JSON encryption failed: %s", e)
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

            # 解密敏感字段
            for field in SENSITIVE_FIELDS:
                if field in data and data[field]:
                    data[field] = cls.decrypt_password(str(data[field]))

            return data

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("JSON decryption failed: %s", e)
            # 如果解密失败，尝试返回原数据
            try:
                return json.loads(encrypted)
            except Exception:  # pylint: disable=broad-exception-caught
                return {}

    @classmethod
    def json_needs_key_migration(cls, encrypted: str) -> bool:
        """encrypted 是 encrypt_json 产出的 JSON 字符串；只要有一个敏感字段的
        密文仍是历史默认密钥加密的（没有 v2: 前缀），就返回 True。

        只做字符串前缀检查，不解密、不修改数据——纯粹的"要不要迁移"判断。
        """
        if not encrypted:
            return False
        try:
            data = json.loads(encrypted)
        except Exception:  # pylint: disable=broad-exception-caught
            return False
        return any(
            field in data and data[field] and cls.needs_key_migration(str(data[field]))
            for field in SENSITIVE_FIELDS
        )

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

        # v2: 前缀是我们自己加的标记,不属于 Base64 载荷——必须先剥掉再解码,
        # 否则本方法会把自己产出的 v2 密文误判为"未加密"。
        payload = text[len(_V2_PREFIX):] if text.startswith(_V2_PREFIX) else text

        try:
            # 尝试 Base64 解码
            base64.b64decode(payload.encode("utf-8"))
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


def json_needs_key_migration(encrypted: str) -> bool:
    """判断 encrypt_json 产出的字符串是否仍用历史默认密钥加密（便捷函数）"""
    return EncryptionUtils.json_needs_key_migration(encrypted)
