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
    """返回可写根目录。显式 env(APP_ROOT,如 Docker 的 /app)优先,否则 per-user 系统目录。

    与 config_manager._resolve_project_root 同源,确保所有路径解析(数据库/文件源/配置/临时)
    在容器内一致落到 APP_ROOT 下,而非容器用户的空 home(/nonexistent)。
    """
    override = os.getenv("APP_ROOT")
    if override:
        return Path(override)
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


def load_or_create_secret_key() -> bytes:
    """读取(或首次原子创建)本机持久化的 secret.key,返回原始 Fernet 密钥字节。

    core.security.encryption 的 Fernet 加密与 utils.encryption_utils 的 XOR 加密
    共用这同一把密钥文件。两处过去各自「if not exists: 生成并写入」,在多 worker
    冷启动时会竞态地各写一把不同的密钥(最后写入者胜出);先用其中一把加密、落库
    的密文,在进程重启读到另一把之后就再也解不开——不可逆的数据损坏。

    并发首启用 os.link 做原子的"独占创建":先把新密钥完整写进一个临时文件,再
    os.link 到 secret.key——只有一个进程能链接成功,其余拿到 FileExistsError 后读
    已存在的那把。之所以不用裸的 O_EXCL:O_EXCL 会先创建一个空文件、再由赢家写入
    内容,输家可能在这中间读到空/不完整的密钥;而 secret.key 只在 os.link 那一刻
    才出现,且指向的临时文件此前已写满,不存在空窗。所有进程因此收敛到同一把密钥。
    """
    key_path = get_secret_key_path()
    key_path.parent.mkdir(parents=True, exist_ok=True)
    if not key_path.exists():
        import tempfile

        from cryptography.fernet import Fernet

        fd, tmp = tempfile.mkstemp(dir=str(key_path.parent), prefix="secret.key.", suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(Fernet.generate_key())
            try:
                os.link(tmp, str(key_path))  # 原子;文件已存在则本进程输掉竞争
            except FileExistsError:
                pass  # 另一进程已抢先建好,下面读它那把
        finally:
            os.unlink(tmp)
    return key_path.read_bytes()


def get_temp_dir() -> Path:
    """临时文件目录:TEMP_FILES_DIR env 优先,否则 <user-data>/temp_files。"""
    env = os.getenv("TEMP_FILES_DIR")
    return Path(env) if env else get_user_data_dir() / "temp_files"


def get_runtime_file() -> Path:
    """Path to the runtime descriptor the MCP server reads for auto-discovery."""
    return get_user_data_dir() / "runtime.json"


def write_runtime_file(port: int) -> None:
    """Best-effort: record the live backend port for local tools (e.g. the MCP server)."""
    import json
    import os

    try:
        path = get_runtime_file()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({
            "base": f"http://127.0.0.1:{port}",
            "port": port,
            "pid": os.getpid(),
        }))
    except Exception:
        pass


def compute_memory_limit() -> str:
    """按物理内存 75% 设 DuckDB 上限,封顶 8GB。无 psutil 时回退 4GB。"""
    try:
        import psutil  # pylint: disable=import-error  # 运行时依赖；lint 环境可能未装

        gb = int(psutil.virtual_memory().total * 0.75 // (1024 ** 3))
    except Exception:
        gb = 4
    gb = max(1, min(gb, 8))
    return f"{gb}GB"
