#!/usr/bin/env python3
"""
修复文件数据源配置中 created_at 为空的记录
将缺失或为 null 的 created_at 字段设置为前一天的时间
同时处理 DuckDB 中存在但配置文件中缺失的表
"""

import json
import os
import sys
import logging
from datetime import timedelta

# 添加项目根目录到 Python 路径
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_duckdb_tables():
    """获取 DuckDB 中的所有表名"""
    try:
        import subprocess
        import json
        
        # 通过 curl 命令获取表列表
        result = subprocess.run([
            'curl', '-s', '-X', 'GET', 
            'http://localhost:3000/api/duckdb/tables',
            '-H', 'accept: application/json'
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            data = json.loads(result.stdout)
            tables = [table['table_name'] for table in data.get('tables', [])]
            logger.info(f"通过 API 获取到 {len(tables)} 个表")
            return tables
        else:
            logger.error(f"curl 命令执行失败: {result.stderr}")
            return []
            
    except Exception as e:
        logger.error(f"获取 DuckDB 表列表失败: {str(e)}")
        return []

def create_missing_datasource_entries(config_file, duckdb_tables, default_created_at):
    """为 DuckDB 中存在但配置文件中缺失的表创建配置条目"""
    try:
        # 读取现有配置
        with open(config_file, 'r', encoding='utf-8') as f:
            configs = json.load(f)
        
        # 获取已存在的 source_id
        existing_source_ids = {config.get("source_id") for config in configs}
        
        # 找出缺失的表
        missing_tables = [table for table in duckdb_tables if table not in existing_source_ids]
        
        if not missing_tables:
            logger.info(f"所有 DuckDB 表都已在配置文件中存在")
            return 0
        
        logger.info(f"发现 {len(missing_tables)} 个缺失的表: {missing_tables}")
        
        # 为缺失的表创建配置条目
        for table_name in missing_tables:
            try:
                # 创建基本的配置条目（不需要连接数据库）
                config_entry = {
                    "source_id": table_name,
                    "filename": f"{table_name}.unknown",
                    "file_path": "unknown",
                    "file_type": "unknown", 
                    "row_count": 0,  # 默认值，后续可更新
                    "column_count": 0,  # 默认值，后续可更新
                    "columns": [],  # 默认为空，后续可更新
                    "created_at": default_created_at,
                    "_auto_generated": True,  # 标记为自动生成
                    "_note": "自动生成的配置条目，请手动更新详细信息"
                }
                
                configs.append(config_entry)
                logger.info(f"为表 {table_name} 创建了配置条目")
                
            except Exception as e:
                logger.error(f"为表 {table_name} 创建配置条目失败: {str(e)}")
                continue
        
        # 备份原文件
        backup_file = f"{config_file}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(configs, f, ensure_ascii=False, indent=2, default=str)
        logger.info(f"原配置已备份到: {backup_file}")
        
        # 保存更新后的配置
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(configs, f, ensure_ascii=False, indent=2, default=str)
        
        return len(missing_tables)
        
    except Exception as e:
        logger.error(f"创建缺失的数据源条目失败: {str(e)}")
        return 0
def fix_null_created_at():
    """修复文件数据源配置中 created_at 为空的记录和孤儿表"""
    config_files = [
        os.path.join(os.path.dirname(__file__), "config", "file-datasources.json"),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "file-datasources.json")
    ]
    
    # 计算前一天的时间（使用全局时区配置）
    from core.timezone_utils import get_current_time
    now_with_tz = get_current_time()
    yesterday = now_with_tz - timedelta(days=1)
    default_created_at = yesterday.isoformat()
    
    logger.info(f"将使用默认时间: {default_created_at} (前一天)")
    
    # 获取 DuckDB 中的表列表
    duckdb_tables = get_duckdb_tables()
    logger.info(f"DuckDB 中共有 {len(duckdb_tables)} 个表: {duckdb_tables}")
    
    total_fixed = 0
    total_missing_entries = 0
    
    for config_file in config_files:
        if not os.path.exists(config_file):
            logger.debug(f"配置文件不存在，跳过: {config_file}")
            continue
            
        logger.info(f"处理配置文件: {config_file}")
        
        try:
            # 首先为缺失的表创建配置条目
            missing_count = create_missing_datasource_entries(config_file, duckdb_tables, default_created_at)
            total_missing_entries += missing_count
            
            # 然后读取更新后的配置
            with open(config_file, 'r', encoding='utf-8') as f:
                configs = json.load(f)
            
            logger.info(f"读取到 {len(configs)} 条配置记录")
            
            # 修复空的 created_at 字段
            fixed_count = 0
            
            for config in configs:
                source_id = config.get("source_id", "unknown")
                
                # 检查是否需要修复
                needs_fix = False
                
                if "created_at" not in config:
                    logger.info(f"{source_id}: 缺少 created_at 字段，添加默认时间")
                    config["created_at"] = default_created_at
                    needs_fix = True
                elif config.get("created_at") is None or config.get("created_at") == "":
                    logger.info(f"{source_id}: created_at 为空，设置为默认时间")
                    config["created_at"] = default_created_at
                    needs_fix = True
                else:
                    logger.debug(f"{source_id}: created_at 已存在且有效")
                
                if needs_fix:
                    fixed_count += 1
            
            # 保存更新后的配置
            if fixed_count > 0:
                # 备份原文件
                backup_file = f"{config_file}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                with open(backup_file, 'w', encoding='utf-8') as f:
                    json.dump(configs, f, ensure_ascii=False, indent=2, default=str)
                logger.info(f"原配置已备份到: {backup_file}")
                
                # 写入修复后的配置
                with open(config_file, 'w', encoding='utf-8') as f:
                    json.dump(configs, f, ensure_ascii=False, indent=2, default=str)
                
                logger.info(f"已修复 {fixed_count} 条记录的 created_at 字段")
                total_fixed += fixed_count
            else:
                logger.info("所有记录的 created_at 字段都已正常，无需修复")
                
        except Exception as e:
            logger.error(f"处理配置文件失败 {config_file}: {str(e)}")
            continue
    
    logger.info(f"总共修复了 {total_fixed} 条记录")
    logger.info(f"总共创建了 {total_missing_entries} 个缺失的数据源条目")
    return total_fixed > 0 or total_missing_entries > 0

def check_null_created_at():
    """检查文件数据源配置中 created_at 为空的记录"""
    config_files = [
        os.path.join(os.path.dirname(__file__), "config", "file-datasources.json"),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "file-datasources.json")
    ]
    
    total_missing = 0
    total_null = 0
    
    for config_file in config_files:
        if not os.path.exists(config_file):
            continue
            
        logger.info(f"检查配置文件: {config_file}")
        
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                configs = json.load(f)
            
            missing_created_at = []
            null_created_at = []
            
            for i, config in enumerate(configs):
                source_id = config.get('source_id', f'record_{i}')
                
                if 'created_at' not in config:
                    missing_created_at.append(source_id)
                elif config.get('created_at') is None or config.get('created_at') == '':
                    null_created_at.append(source_id)
            
            logger.info(f'总记录数: {len(configs)}')
            logger.info(f'缺少 created_at 字段的记录: {len(missing_created_at)}')
            if missing_created_at:
                logger.info(f'缺少字段的source_id: {missing_created_at[:5]}{"..." if len(missing_created_at) > 5 else ""}')
            
            logger.info(f'created_at 为空的记录: {len(null_created_at)}')
            if null_created_at:
                logger.info(f'空值的source_id: {null_created_at[:5]}{"..." if len(null_created_at) > 5 else ""}')
            
            total_missing += len(missing_created_at)
            total_null += len(null_created_at)
            
        except Exception as e:
            logger.error(f"检查配置文件失败 {config_file}: {str(e)}")
    
    return total_missing + total_null

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "check":
        # 只检查，不修复
        problem_count = check_null_created_at()
        if problem_count > 0:
            logger.info(f"发现 {problem_count} 个需要修复的记录")
        else:
            logger.info("所有记录的 created_at 字段都正常")
    else:
        # 执行修复
        logger.info("开始修复空的 created_at 字段...")
        success = fix_null_created_at()
        if success:
            logger.info("修复完成")
        else:
            logger.info("无需修复或修复失败")