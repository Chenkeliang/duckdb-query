#!/usr/bin/env python3
"""
标准化文件数据源配置中的时间字段
将所有 upload_time 和 createdAt 统一为标准的 created_at 格式
移除旧格式字段，确保数据一致性
"""

import json
import os
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def standardize_datasource_timestamps():
    """标准化文件数据源配置中的时间字段"""
    config_file = os.path.join(
        os.path.dirname(__file__), "config", "file-datasources.json"
    )
    
    # 如果在 api 目录内，需要向上一级查找 config
    if not os.path.exists(config_file):
        config_file = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "config", "file-datasources.json"
        )
    
    if not os.path.exists(config_file):
        logger.error(f"配置文件不存在: {config_file}")
        return False
    
    try:
        # 读取现有配置
        with open(config_file, 'r', encoding='utf-8') as f:
            configs = json.load(f)
        
        logger.info(f"读取到 {len(configs)} 条配置记录")
        
        # 标准化每条记录
        updated_count = 0
        removed_fields_count = 0
        
        for config in configs:
            source_id = config.get("source_id", "unknown")
            
            # 统一为 created_at 字段
            created_at_value = None
            fields_to_remove = []
            
            # 按优先级获取时间值：created_at > createdAt > upload_time
            if "created_at" in config and config["created_at"]:
                created_at_value = config["created_at"]
                logger.debug(f"{source_id}: 已使用标准 created_at 字段")
            elif "createdAt" in config and config["createdAt"]:
                created_at_value = config["createdAt"]
                fields_to_remove.append("createdAt")
                logger.info(f"{source_id}: 转换 createdAt -> created_at")
            elif "upload_time" in config and config["upload_time"]:
                created_at_value = config["upload_time"]
                fields_to_remove.append("upload_time")
                logger.info(f"{source_id}: 转换 upload_time -> created_at")
            else:
                logger.warning(f"{source_id}: 未找到任何时间字段")
                continue
            
            # 移除旧字段并设置标准字段
            if fields_to_remove:
                for field in fields_to_remove:
                    if field in config:
                        del config[field]
                        removed_fields_count += 1
                        logger.debug(f"{source_id}: 移除旧字段 {field}")
                
                # 设置标准字段
                config["created_at"] = created_at_value
                updated_count += 1
        
        # 保存更新后的配置
        if updated_count > 0:
            # 备份原文件
            backup_file = f"{config_file}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            with open(backup_file, 'w', encoding='utf-8') as f:
                json.dump(configs, f, ensure_ascii=False, indent=2, default=str)
            logger.info(f"原配置已备份到: {backup_file}")
            
            # 写入标准化后的配置
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(configs, f, ensure_ascii=False, indent=2, default=str)
            
            logger.info(f"已标准化 {updated_count} 条记录的时间字段")
            logger.info(f"移除了 {removed_fields_count} 个旧格式字段")
        else:
            logger.info("所有记录的时间字段都已标准化，无需修改")
        
        return True
        
    except Exception as e:
        logger.error(f"标准化配置失败: {str(e)}")
        return False

if __name__ == "__main__":
    standardize_datasource_timestamps()