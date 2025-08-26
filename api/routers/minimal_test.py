from fastapi import APIRouter, HTTPException, Body
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

def read_postgresql_configs():
    return []

def save_postgresql_configs(configs):
    pass

class PostgreSQLConfig:
    pass

@router.get("/api/postgresql_configs", tags=["Data Sources"])
async def get_postgresql_configs():
    """获取所有保存的PostgreSQL配置"""
    try:
        configs = read_postgresql_configs()
        # 创建深拷贝以避免修改原始配置
        import copy

        masked_configs = []
        for config in configs:
            config_copy = copy.deepcopy(config)
            if "params" in config_copy and "password" in config_copy["params"]:
                config_copy["params"]["password"] = "********"
            masked_configs.append(config_copy)
        return {"configs": masked_configs}
    except Exception as e:
        logger.error(f"获取PostgreSQL配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取PostgreSQL配置失败: {str(e)}")

@router.get("/api/postgresql_configs/{config_id}/full", tags=["Data Sources"])
async def get_postgresql_config_full(config_id: str):
    """获取单个PostgreSQL配置的完整信息（包含解密的密码）"""
    try:
        configs = read_postgresql_configs()
        for config in configs:
            if config.get("id") == config_id:
                # 返回完整配置（包含解密的密码）
                return config

        raise HTTPException(status_code=404, detail=f"未找到配置: {config_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取PostgreSQL配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取PostgreSQL配置失败: {str(e)}")

@router.post("/api/postgresql_configs", tags=["Data Sources"])
async def save_postgresql_config(config: PostgreSQLConfig = Body(...)):
    """保存PostgreSQL配置"""
    try:
        if config.type != "postgresql":
            raise HTTPException(status_code=400, detail="仅支持PostgreSQL配置")

        configs = read_postgresql_configs()

        # 检查是否已存在相同ID的配置
        for i, existing_config in enumerate(configs):
            if existing_config["id"] == config.id:
                # 更新已存在的配置
                configs[i] = config.dict()
                save_postgresql_configs(configs)
                return {"success": True, "message": "PostgreSQL配置已更新"}

        # 添加新配置
        configs.append(config.dict())
        save_postgresql_configs(configs)
        return {"success": True, "message": "PostgreSQL配置已保存"}
    except Exception as e:
        logger.error(f"保存PostgreSQL配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"保存PostgreSQL配置失败: {str(e)}")

@router.delete("/api/postgresql_configs/{config_id}", tags=["Data Sources"])
async def delete_postgresql_config(config_id: str):
    """删除PostgreSQL配置"""
    try:
        configs = read_postgresql_configs()

        # 过滤掉要删除的配置
        updated_configs = [config for config in configs if config["id"] != config_id]

        if len(updated_configs) == len(configs):
            raise HTTPException(
                status_code=404, detail=f"未找到ID为 {config_id} 的PostgreSQL配置"
            )

        save_postgresql_configs(updated_configs)
        return {"success": True, "message": f"已删除ID为 {config_id} 的PostgreSQL配置"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除PostgreSQL配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除PostgreSQL配置失败: {str(e)}")