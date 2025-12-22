from fastapi import APIRouter
from core.config_manager import config_manager

router = APIRouter()


def format_file_size(size_bytes: int) -> str:
    """将字节数转换为人类可读的格式"""
    if size_bytes >= 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024 * 1024):.0f}GB"
    elif size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.0f}MB"
    elif size_bytes >= 1024:
        return f"{size_bytes / 1024:.0f}KB"
    else:
        return f"{size_bytes}B"


@router.get("/api/app-config/features", tags=["Config"])
async def get_app_features():
    """
    返回前端需要的功能开关与关键阈值。
    - enable_pivot_tables: 是否启用透视表
    - pivot_table_extension: 透视扩展名称
    - max_query_rows: 预览时前端展示/拼接LIMIT可参考的最大行数
    - max_file_size: 最大文件上传大小（字节）
    - max_file_size_display: 最大文件上传大小（人类可读格式）
    """
    app_config = config_manager.get_app_config()
    max_file_size = int(getattr(app_config, "max_file_size", 500 * 1024 * 1024))
    return {
        "enable_pivot_tables": bool(getattr(app_config, "enable_pivot_tables", True)),
        "pivot_table_extension": getattr(
            app_config, "pivot_table_extension", "pivot_table"
        ),
        "max_query_rows": int(getattr(app_config, "max_query_rows", 10000)),
        "max_file_size": max_file_size,
        "max_file_size_display": format_file_size(max_file_size),
    }
