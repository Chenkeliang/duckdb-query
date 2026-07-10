"""桌面直写导出的共享校验(async_tasks 与 query_export 共用)。

桌面模式下后端可以把导出文件直接写到用户经原生存盘对话框选定的本地路径
(免浏览器、免二次落盘);Web/Docker 部署不开启。门控开关与 server_files.py
读本地任意路径(导入方向)同一个:ALLOW_ARBITRARY_LOCAL_PATHS=1,由
api/run.py(桌面 sidecar 入口)设置。
"""

import os


def desktop_local_export_enabled() -> bool:
    """是否允许后端直写用户本地路径(桌面模式)。"""
    return os.getenv("ALLOW_ARBITRARY_LOCAL_PATHS") == "1"


def validate_local_target_path(target_path: str) -> str:
    """校验用户选定的目标文件绝对路径,返回 normpath 归一化后的路径。

    任何不满足都抛 ValueError(英文,调用方映射为 HTTP 400)。覆盖语义由原生
    存盘对话框在选择时向用户确认,这里不再拦截已存在的文件。
    """
    if not target_path or not os.path.isabs(target_path):
        raise ValueError("target_path must be an absolute path")
    target = os.path.normpath(target_path)
    if os.path.isdir(target):
        raise ValueError("target_path points to a directory, expected a file path")
    parent = os.path.dirname(target)
    if not os.path.isdir(parent):
        raise ValueError("Parent directory of target_path does not exist")
    if not os.access(parent, os.W_OK):
        raise ValueError("Parent directory of target_path is not writable")
    return target
