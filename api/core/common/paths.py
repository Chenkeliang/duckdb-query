"""集中式可写目录解析。

优先级:显式 env > per-user 系统目录。NEVER 依赖 __file__ 或 /app
(冻结后 __file__ 在只读 bundle 内,/app 仅 Docker 存在)。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_APP_DIR_NAME = "DuckQuery"


def get_user_data_dir() -> Path:
    """返回 per-user 可写根目录。"""
    home = Path(os.path.expanduser("~"))
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / _APP_DIR_NAME
    if sys.platform.startswith("win"):
        base = os.getenv("APPDATA")
        return (Path(base) if base else home) / _APP_DIR_NAME
    return home / ".local" / "share" / _APP_DIR_NAME


def get_config_dir() -> Path:
    """配置目录:CONFIG_DIR env 优先,否则 <user-data>/config。"""
    env = os.getenv("CONFIG_DIR")
    return Path(env) if env else get_user_data_dir() / "config"


def get_secret_key_path() -> Path:
    """Fernet 密钥文件的统一路径:<config-dir>/secret.key。"""
    return get_config_dir() / "secret.key"


def get_temp_dir() -> Path:
    """临时文件目录:TEMP_FILES_DIR env 优先,否则 <user-data>/temp_files。"""
    env = os.getenv("TEMP_FILES_DIR")
    return Path(env) if env else get_user_data_dir() / "temp_files"
