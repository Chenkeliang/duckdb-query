"""对称加密用户密钥（如 LLM API Key）。密钥来自环境变量 LLM_KEY_SECRET。"""

from __future__ import annotations

import base64
import hashlib
import logging
import os

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_DEFAULT_SECRET = "duckdb-query-default-llm-key-secret-change-me"
_warned_default_secret = False


def _using_default_secret() -> bool:
    return not os.getenv("LLM_KEY_SECRET")


def _fernet() -> Fernet:
    secret = os.getenv("LLM_KEY_SECRET") or _DEFAULT_SECRET
    # 从任意长度的 secret 派生 32 字节 Fernet key
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    if not plaintext:
        return ""
    if _using_default_secret():
        global _warned_default_secret
        if not _warned_default_secret:
            logger.warning(
                "LLM_KEY_SECRET is not set; encrypting API keys with the built-in "
                "default secret provides no real confidentiality. Set the "
                "LLM_KEY_SECRET environment variable in production."
            )
            _warned_default_secret = True
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    if not token:
        return ""
    return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")


def mask_secret(value: str | None) -> str:
    """仅保留尾 4 位作为提示，其余以 **** 代替；空值返回空串。"""
    if not value:
        return ""
    tail = value[-4:] if len(value) >= 4 else value
    return f"****{tail}"
