"""
文件数据源配置管理模块
负责文件数据源的持久化配置管理和自动重新加载
"""

import json
import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import pandas as pd
from pathlib import Path

logger = logging.getLogger(__name__)

# 文件数据源配置文件路径
# 使用相对路径，兼容本地开发和Docker环境
if os.path.exists("/app"):
    # Docker环境
    FILE_DATASOURCE_CONFIG = "/app/data/file_datasources.json"
else:
    # 本地开发环境
    FILE_DATASOURCE_CONFIG = "./data/file_datasources.json"

class FileDataSourceManager:
    """文件数据源管理器"""
    
    def __init__(self):
        self.config_file = FILE_DATASOURCE_CONFIG
        self.ensure_config_dir()
    
    def ensure_config_dir(self):
        """确保配置目录存在"""
        config_dir = os.path.dirname(self.config_file)
        os.makedirs(config_dir, exist_ok=True)
    
    def save_file_datasource(self, file_info: Dict[str, Any]) -> bool:
        """
        保存文件数据源配置
        
        Args:
            file_info: 文件信息字典，包含：
                - source_id: 数据源ID
                - filename: 文件名
                - file_path: 文件路径
                - file_type: 文件类型
                - row_count: 行数
                - column_count: 列数
                - columns: 列信息
                - upload_time: 上传时间
        """
        try:
            # 读取现有配置
            existing_configs = self.load_file_datasources()
            
            # 添加或更新配置
            existing_configs[file_info["source_id"]] = file_info
            
            # 保存配置
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(existing_configs, f, ensure_ascii=False, indent=2, default=str)
            
            logger.info(f"已保存文件数据源配置: {file_info['source_id']}")
            return True
            
        except Exception as e:
            logger.error(f"保存文件数据源配置失败: {str(e)}")
            return False
    
    def load_file_datasources(self) -> Dict[str, Any]:
        """加载所有文件数据源配置"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return {}
        except Exception as e:
            logger.error(f"加载文件数据源配置失败: {str(e)}")
            return {}
    
    def remove_file_datasource(self, source_id: str) -> bool:
        """移除文件数据源配置"""
        try:
            configs = self.load_file_datasources()
            if source_id in configs:
                del configs[source_id]
                
                with open(self.config_file, 'w', encoding='utf-8') as f:
                    json.dump(configs, f, ensure_ascii=False, indent=2, default=str)
                
                logger.info(f"已移除文件数据源配置: {source_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"移除文件数据源配置失败: {str(e)}")
            return False
    
    def get_file_datasource(self, source_id: str) -> Optional[Dict[str, Any]]:
        """获取指定文件数据源配置"""
        configs = self.load_file_datasources()
        return configs.get(source_id)
    
    def list_file_datasources(self) -> List[Dict[str, Any]]:
        """列出所有文件数据源配置"""
        configs = self.load_file_datasources()
        return list(configs.values())

# 全局文件数据源管理器实例
file_datasource_manager = FileDataSourceManager()


def detect_file_type(filename: str) -> str:
    """检测文件类型"""
    if filename.endswith('.csv'):
        return 'csv'
    elif filename.endswith(('.xlsx', '.xls')):
        return 'excel'
    elif filename.endswith('.json'):
        return 'json'
    elif filename.endswith('.parquet'):
        return 'parquet'
    else:
        return 'unknown'


def read_file_by_type(file_path: str, file_type: str) -> pd.DataFrame:
    """根据文件类型读取文件"""
    try:
        if file_type == 'csv':
            return pd.read_csv(file_path)
        elif file_type == 'excel':
            return pd.read_excel(file_path)
        elif file_type == 'json':
            return pd.read_json(file_path)
        elif file_type == 'parquet':
            return pd.read_parquet(file_path)
        else:
            raise ValueError(f"不支持的文件类型: {file_type}")
    except Exception as e:
        logger.error(f"读取文件失败 {file_path}: {str(e)}")
        raise


def reload_all_file_datasources_to_duckdb(duckdb_con) -> int:
    """
    重新加载所有文件数据源到DuckDB
    
    Args:
        duckdb_con: DuckDB连接对象
        
    Returns:
        int: 成功加载的文件数量
    """
    logger.info("开始重新加载所有文件数据源到DuckDB...")
    
    configs = file_datasource_manager.load_file_datasources()
    success_count = 0
    
    for source_id, config in configs.items():
        try:
            file_path = config.get('file_path')
            file_type = config.get('file_type')
            
            # 检查文件是否存在
            if not os.path.exists(file_path):
                logger.warning(f"文件不存在，跳过: {file_path}")
                continue
            
            # 读取文件数据
            df = read_file_by_type(file_path, file_type)
            
            # 使用CREATE TABLE持久化到DuckDB，确保VARCHAR类型
            create_varchar_table_from_dataframe_file(duckdb_con, source_id, df)
            
            logger.info(f"成功重新加载文件数据源: {source_id} ({len(df)}行)")
            success_count += 1
            
        except Exception as e:
            logger.error(f"重新加载文件数据源失败 {source_id}: {str(e)}")
    
    logger.info(f"文件数据源重新加载完成，成功: {success_count}/{len(configs)}")
    return success_count


def create_varchar_table_from_dataframe_file(duckdb_con, table_name: str, df: pd.DataFrame):
    """
    使用CREATE TABLE将DataFrame持久化到DuckDB，所有列转换为VARCHAR类型
    这样数据会真正写入到持久化文件中，并且避免类型转换问题
    """
    try:
        # 先删除已存在的表
        try:
            duckdb_con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
        except:
            pass

        # 使用CREATE TABLE AS SELECT持久化数据
        # 首先注册临时表
        temp_table_name = f"temp_{table_name}"
        duckdb_con.register(temp_table_name, df)

        # 获取列信息并构建VARCHAR转换SQL
        columns_info = duckdb_con.execute(f'DESCRIBE {temp_table_name}').fetchall()
        cast_columns = []
        for col_name, col_type, *_ in columns_info:
            # 将所有列转换为VARCHAR，直接CAST避免类型转换问题
            cast_columns.append(f'CAST("{col_name}" AS VARCHAR) AS "{col_name}"')

        cast_sql = ", ".join(cast_columns)

        # 创建最终的VARCHAR表
        create_sql = f'CREATE TABLE "{table_name}" AS SELECT {cast_sql} FROM {temp_table_name}'
        duckdb_con.execute(create_sql)

        # 删除临时表
        duckdb_con.unregister(temp_table_name)

        logger.info(f"成功创建持久化表: {table_name} ({len(df)}行, {len(df.columns)}列)")

    except Exception as e:
        logger.error(f"创建持久化表失败 {table_name}: {str(e)}")
        raise


def create_table_from_dataframe(duckdb_con, table_name: str, df: pd.DataFrame):
    """
    使用CREATE TABLE将DataFrame持久化到DuckDB
    这样数据会真正写入到持久化文件中
    保留原函数以兼容性
    """
    return create_varchar_table_from_dataframe_file(duckdb_con, table_name, df)
