"""PostgreSQL配置管理API"""
import json
import os
import logging
from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any
from pydantic import BaseModel

from models.query_models import PostgreSQLConfig

router = APIRouter()
logger = logging.getLogger(__name__)

# PostgreSQL配置文件路径
POSTGRESQL_CONFIG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), 
    "..", 
    "config", 
    "postgresql-configs.json"
)

def ensure_postgresql_config_file():
    """确保PostgreSQL配置文件存在"""
    config_dir = os.path.dirname(POSTGRESQL_CONFIG_FILE)
    if not os.path.exists(config_dir):
        os.makedirs(config_dir)
        
    if not os.path.exists(POSTGRESQL_CONFIG_FILE):
        with open(POSTGRESQL_CONFIG_FILE, "w") as f:
            json.dump([], f)
        logger.info(f"创建默认PostgreSQL配置文件: {POSTGRESQL_CONFIG_FILE}")

def read_postgresql_configs():
    """读取PostgreSQL配置"""
    ensure_postgresql_config_file()
    try:
        with open(POSTGRESQL_CONFIG_FILE, "r", encoding="utf-8") as f:
            configs = json.load(f)
        logger.info(f"成功读取PostgreSQL配置，共 {len(configs)} 个")
        return configs
    except FileNotFoundError:
        logger.warning("PostgreSQL配置文件不存在，返回空列表")
        return []
    except json.JSONDecodeError as e:
        logger.error(f"PostgreSQL配置文件格式错误: {str(e)}")
        return []
    except Exception as e:
        logger.error(f"读取PostgreSQL配置文件时出错: {str(e)}")
        return []

def save_postgresql_configs(configs):
    """保存PostgreSQL配置"""
    ensure_postgresql_config_file()
    
    try:
        with open(POSTGRESQL_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(configs, f, indent=2, ensure_ascii=False)
        logger.info(f"成功保存PostgreSQL配置，共 {len(configs)} 个")
    except Exception as e:
        logger.error(f"保存PostgreSQL配置文件时出错: {str(e)}")
        raise

@router.get("/api/postgresql_configs", tags=["Data Sources"])
async def get_postgresql_configs():
    """获取所有PostgreSQL配置"""
    try:
        configs = read_postgresql_configs()
        return {"success": True, "configs": configs}
    except Exception as e:
        logger.error(f"获取PostgreSQL配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取PostgreSQL配置失败: {str(e)}")

@router.post("/api/postgresql_configs", tags=["Data Sources"])
async def save_postgresql_config(config: PostgreSQLConfig = Body(...)):
    """保存PostgreSQL配置"""
    try:
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
            raise HTTPException(status_code=404, detail=f"未找到ID为 {config_id} 的PostgreSQL配置")
            
        save_postgresql_configs(updated_configs)
        return {"success": True, "message": f"已删除ID为 {config_id} 的PostgreSQL配置"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除PostgreSQL配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除PostgreSQL配置失败: {str(e)}")