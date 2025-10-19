from fastapi import APIRouter
from core.config_manager import config_manager

router = APIRouter()


@router.get("/api/app-config/features", tags=["Config"])
async def get_app_features():
    """
    返回前端需要的功能开关与关键阈值。
    - enable_pivot_tables: 是否启用透视表
    - pivot_table_extension: 透视扩展名称
    - max_query_rows: 预览时前端展示/拼接LIMIT可参考的最大行数
    """
    app_config = config_manager.get_app_config()
    return {
        "enable_pivot_tables": bool(getattr(app_config, "enable_pivot_tables", True)),
        "pivot_table_extension": getattr(
            app_config, "pivot_table_extension", "pivot_table"
        ),
        "max_query_rows": int(getattr(app_config, "max_query_rows", 10000)),
    }
