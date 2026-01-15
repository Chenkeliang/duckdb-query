"""Cryptographic utilities for password and secret management.

This module provides low-level encryption primitives. It has ZERO dependencies
on other core submodules to avoid circular imports.

Thread Safety:
    Uses threading.Lock to ensure safe initialization in multi-threaded
    environments (e.g., Gunicorn with multiple workers starting simultaneously).
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_SECRET_KEY_FILENAME = "secret.key"
_DEFAULT_PASSWORD_KEYS = ("password", "secret", "token", "api_key")


class CryptoManager:
    """Thread-safe manager for encryption/decryption operations.

    Attributes:
        _fernet: Lazily initialized Fernet instance.
        _lock: Threading lock for safe initialization.
    """

    def __init__(self) -> None:
        self._fernet: Fernet | None = None
        self._lock = threading.Lock()

    def _get_secret_key_path(self) -> Path:
        """Returns the path to the secret key file."""
        config_dir = os.getenv(
            "CONFIG_DIR",
            str(Path(__file__).parent.parent.parent.parent / "config"),
        )
        return Path(config_dir) / _SECRET_KEY_FILENAME

    def _get_fernet(self) -> Fernet:
        """Returns the Fernet instance, creating one if necessary.

        Thread-safe: Uses double-checked locking pattern.
        """
        if self._fernet is not None:
            return self._fernet

        with self._lock:
            if self._fernet is not None:
                return self._fernet

            key_path = self._get_secret_key_path()

            if key_path.exists():
                key = key_path.read_bytes()
                logger.debug("Loaded encryption key from: %s", key_path)
            else:
                key = Fernet.generate_key()
                try:
                    key_path.parent.mkdir(parents=True, exist_ok=True)
                    key_path.write_bytes(key)
                    logger.info("Generated new encryption key: %s", key_path)
                except PermissionError:
                    logger.warning(
                        "Cannot write key to %s (read-only filesystem?). "
                        "Using ephemeral key - encrypted data won't persist.",
                        key_path,
                    )

            self._fernet = Fernet(key)
            return self._fernet


_crypto_manager = CryptoManager()


def encrypt_string(plaintext: str) -> str:
    """Encrypts a plaintext string using Fernet symmetric encryption.

    Args:
        plaintext: The string to encrypt. If empty, returns as-is.

    Returns:
        Encrypted string (base64-encoded).
    """
    if not plaintext:
        return plaintext
    encrypted = _crypto_manager._get_fernet().encrypt(plaintext.encode())
    return encrypted.decode()


def decrypt_string(ciphertext: str) -> str:
    """Decrypts an encrypted string.

    Args:
        ciphertext: Encrypted string. If empty, returns as-is.

    Returns:
        The decrypted plaintext. If decryption fails, returns the original
        input (assumes it may have been stored in plaintext).
    """
    if not ciphertext:
        return ciphertext
    try:
        decrypted = _crypto_manager._get_fernet().decrypt(ciphertext.encode())
        return decrypted.decode()
    except (InvalidToken, TypeError, ValueError) as e:
        logger.warning("Decryption failed, returning original: %s", e)
        return ciphertext


def decrypt_config_passwords(
    config: dict[str, Any],
    keys: tuple[str, ...] | None = None,
) -> dict[str, Any]:
    """Decrypts password fields in a configuration dictionary.

    Args:
        config: Configuration dictionary that may contain encrypted values.
        keys: Field names to decrypt. Defaults to common password field names.

    Returns:
        A copy of the config with specified fields decrypted.
    """
    keys = keys or _DEFAULT_PASSWORD_KEYS
    result = config.copy()
    for key in keys:
        if key in result and result[key]:
            result[key] = decrypt_string(result[key])
    return result
