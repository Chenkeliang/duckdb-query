"""
Password encryption and decryption tool using Fernet symmetric encryption.
This module ensures that sensitive credentials are stored securely.
"""

import os
import logging
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


class PasswordEncryptor:
    """
    A secure class for encrypting and decrypting passwords using a secret key.
    """

    def __init__(self, secret_key: bytes):
        if not secret_key or len(secret_key) < 32:
            raise ValueError("A valid secret key of at least 32 bytes is required.")
        self.fernet = Fernet(secret_key)

    def encrypt_password(self, password: str) -> str:
        if not password:
            return ""
        try:
            encrypted = self.fernet.encrypt(password.encode("utf-8"))
            return encrypted.decode("utf-8")
        except Exception as e:
            logger.error(f"Password encryption failed: {e}")
            return password  # Fallback to plaintext on failure

    def decrypt_password(self, encrypted_password: str) -> str:
        if not encrypted_password or encrypted_password == "********":
            return ""
        try:
            decrypted = self.fernet.decrypt(encrypted_password.encode("utf-8"))
            return decrypted.decode("utf-8")
        except InvalidToken:
            logger.warning(
                "Invalid token: The password was likely encrypted with a different key or is not encrypted."
            )
            return encrypted_password  # Return as is if it's not a valid token
        except Exception as e:
            logger.error(f"Password decryption failed: {e}")
            return encrypted_password  # Fallback on other errors

    def is_encrypted(self, password: str) -> bool:
        if not password:
            return False
        try:
            self.fernet.decrypt(password.encode("utf-8"), ttl=None)
            return True
        except (InvalidToken, TypeError):
            return False
        except Exception:
            return False


def _initialize_global_encryptor() -> PasswordEncryptor:
    """
    Initializes and returns the global password encryptor instance.
    This function handles key loading/generation upon module import.
    """
    try:
        # 在Docker环境中优先使用环境变量CONFIG_DIR
        config_dir_env = os.getenv("CONFIG_DIR")
        if config_dir_env:
            config_dir = Path(config_dir_env)
        else:
            # 本地开发环境的回退逻辑
            config_dir = Path(__file__).parent.parent.parent / "config"

        secret_key_file = config_dir / "secret.key"
        secret_key = None

        config_dir.mkdir(exist_ok=True)
        if secret_key_file.exists():
            with open(secret_key_file, "rb") as f:
                secret_key = f.read()
            logger.info(f"Found existing secret key at {secret_key_file}")

        if not secret_key or len(secret_key) < 32:
            logger.warning("Secret key not found or invalid. Generating a new one.")
            secret_key = Fernet.generate_key()
            with open(secret_key_file, "wb") as f:
                f.write(secret_key)
            logger.info(f"New secret key saved to {secret_key_file}")

        return PasswordEncryptor(secret_key)

    except Exception as e:
        logger.critical(f"Failed to initialize PasswordEncryptor: {e}")
        return None


# Initialize the global instance when the module is loaded.
password_encryptor = _initialize_global_encryptor()


def encrypt_config_passwords(config: dict) -> dict:
    if not config or not password_encryptor:
        return config
    import copy

    config_copy = copy.deepcopy(config)
    if "params" in config_copy and "password" in config_copy["params"]:
        password = config_copy["params"]["password"]
        if (
            password
            and password != "********"
            and not password_encryptor.is_encrypted(password)
        ):
            config_copy["params"]["password"] = password_encryptor.encrypt_password(
                password
            )
    return config_copy


def decrypt_config_passwords(config: dict) -> dict:
    if not config or not password_encryptor:
        return config
    import copy

    config_copy = copy.deepcopy(config)
    if "params" in config_copy and "password" in config_copy["params"]:
        encrypted_password = config_copy["params"]["password"]
        if encrypted_password and encrypted_password != "********":
            config_copy["params"]["password"] = password_encryptor.decrypt_password(
                encrypted_password
            )
    return config_copy


def mask_config_passwords(config: dict) -> dict:
    if not config:
        return config
    import copy

    config_copy = copy.deepcopy(config)
    if "params" in config_copy and "password" in config_copy["params"]:
        if config_copy["params"]["password"]:
            config_copy["params"]["password"] = "********"
    return config_copy
