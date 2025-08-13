"""
文件数据源管理器
负责管理文件数据源的配置、加载和持久化
"""

import json
import os
import logging
import pandas as pd
import hashlib
from typing import Dict, Any, List, Optional
from datetime import datetime

import duckdb

from core.duckdb_engine import get_db_connection
from core.config_manager import config_manager

logger = logging.getLogger(__name__)


class FileDatasourceManager:
    """文件数据源管理器类"""

    def __init__(self):
        """初始化文件数据源管理器"""
        self.config_file = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "config", "file-datasources.json"
        )
        self.data_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "data", "file_sources"
        )
        os.makedirs(self.data_dir, exist_ok=True)
        
        # 确保配置文件存在
        if not os.path.exists(self.config_file):
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False, indent=2)

    def _get_file_hash(self, file_path: str) -> str:
        """计算文件的MD5哈希值"""
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()

    def save_file_datasource(self, file_info: Dict[str, Any]):
        """保存文件数据源配置"""
        try:
            # 读取现有配置
            configs = []
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    configs = json.load(f)
            
            # 查找是否已存在相同source_id的配置
            existing_index = None
            for i, config in enumerate(configs):
                if config.get("source_id") == file_info["source_id"]:
                    existing_index = i
                    break
            
            # 更新或添加配置
            if existing_index is not None:
                configs[existing_index] = file_info
            else:
                configs.append(file_info)
            
            # 保存配置
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(configs, f, ensure_ascii=False, indent=2, default=str)
                
            logger.info(f"文件数据源配置已保存: {file_info['source_id']}")
            
        except Exception as e:
            logger.error(f"保存文件数据源配置失败: {str(e)}")
            raise

    def get_file_datasource(self, source_id: str) -> Optional[Dict[str, Any]]:
        """获取文件数据源配置"""
        try:
            if not os.path.exists(self.config_file):
                return None
                
            with open(self.config_file, 'r', encoding='utf-8') as f:
                configs = json.load(f)
            
            for config in configs:
                if config.get("source_id") == source_id:
                    return config
                    
            return None
        except Exception as e:
            logger.error(f"获取文件数据源配置失败: {str(e)}")
            return None

    def list_file_datasources(self) -> List[Dict[str, Any]]:
        """列出所有文件数据源"""
        try:
            if not os.path.exists(self.config_file):
                return []
                
            with open(self.config_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"列出文件数据源失败: {str(e)}")
            return []

    def delete_file_datasource(self, source_id: str) -> bool:
        """删除文件数据源"""
        try:
            if not os.path.exists(self.config_file):
                return False
                
            with open(self.config_file, 'r', encoding='utf-8') as f:
                configs = json.load(f)
            
            # 查找并删除配置
            new_configs = [config for config in configs if config.get("source_id") != source_id]
            
            # 如果配置有变化，则保存
            if len(new_configs) != len(configs):
                with open(self.config_file, 'w', encoding='utf-8') as f:
                    json.dump(new_configs, f, ensure_ascii=False, indent=2, default=str)
                
                logger.info(f"文件数据源配置已删除: {source_id}")
                return True
                
            return False
        except Exception as e:
            logger.error(f"删除文件数据源配置失败: {str(e)}")
            return False

    def reload_all_file_datasources(self):
        """重新加载所有文件数据源到DuckDB"""
        try:
            logger.info("开始重新加载所有文件数据源到DuckDB...")
            
            # 获取DuckDB连接
            duckdb_con = get_db_connection()
            
            # 获取所有文件数据源配置
            configs = self.list_file_datasources()
            success_count = 0
            
            for config in configs:
                source_id = config["source_id"]
                file_path = config["file_path"]
                file_type = config["file_type"]
                
                # 检查文件是否存在
                if not os.path.exists(file_path):
                    logger.warning(f"文件不存在，跳过: {file_path}")
                    continue
                
                try:
                    # 重新加载文件到DuckDB
                    create_varchar_table_from_file_path(duckdb_con, source_id, file_path, file_type)
                    
                    # 获取行数信息
                    try:
                        row_count_result = duckdb_con.execute(f"SELECT COUNT(*) FROM \"{source_id}\"").fetchone()
                        row_count = row_count_result[0] if row_count_result else 0
                        logger.info(f"成功重新加载文件数据源: {source_id} ({row_count}行)")
                    except:
                        logger.info(f"成功重新加载文件数据源: {source_id}")
                    
                    success_count += 1
                except Exception as e:
                    logger.error(f"重新加载文件数据源失败 {source_id}: {str(e)}")
            
            logger.info(f"文件数据源重新加载完成，成功: {success_count}/{len(configs)}")
            return success_count
            
        except Exception as e:
            logger.error(f"重新加载文件数据源失败: {str(e)}")


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


def create_varchar_table_from_file_path(duckdb_con, table_name: str, file_path: str, file_type: str):
    """
    直接从文件路径创建DuckDB表，所有列转换为VARCHAR类型
    避免将大文件加载到内存中
    """
    try:
        # 先删除已存在的表
        try:
            duckdb_con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
        except:
            pass

        # 根据文件类型构建SQL查询
        if file_type == 'csv':
            # 对于CSV文件，先安装并加载encodings扩展以支持正确的编码处理
            try:
                duckdb_con.execute("INSTALL encodings; LOAD encodings;")
            except Exception as e:
                logger.warning(f"安装或加载encodings扩展失败: {str(e)}")
            
            # 对于CSV文件，直接使用DuckDB的读取功能，并指定编码
            # 强制使用UTF-8编码和所有列作为VARCHAR
            # ALL_VARCHAR=1 避免类型推断问题
            # AUTO_DETECT=1 启用自动检测
            try:
                create_sql = f'CREATE TABLE "{table_name}" AS SELECT * FROM read_csv_auto(\'{file_path}\', encoding=\'utf-8\', ALL_VARCHAR=1, AUTO_DETECT=1, SAMPLE_SIZE=-1, ignore_errors=true)'
                duckdb_con.execute(create_sql)
                logger.info(f"成功使用UTF-8编码和ALL_VARCHAR=1读取CSV文件: {file_path}")
            except Exception as e:
                logger.error(f"使用read_csv_auto读取CSV文件失败: {str(e)}")
                logger.error(f"文件路径: {file_path}")
                # Re-raise the exception to be handled by the calling function
                raise
        elif file_type in ['xlsx', 'xls']:
            # 对于Excel文件，直接使用DuckDB的读取功能
            create_sql = f'CREATE TABLE "{table_name}" AS SELECT * FROM st_read(\'{file_path}\')'
            duckdb_con.execute(create_sql)
        elif file_type in ['json', 'jsonl']:
            # 对于JSON文件，直接使用DuckDB的读取功能
            create_sql = f'CREATE TABLE "{table_name}" AS SELECT * FROM read_json_auto(\'{file_path}\')'
            duckdb_con.execute(create_sql)
        elif file_type in ['parquet', 'pq']:
            # 对于Parquet文件，直接使用DuckDB的读取功能
            create_sql = f'CREATE TABLE "{table_name}" AS SELECT * FROM read_parquet(\'{file_path}\')'
            duckdb_con.execute(create_sql)
        else:
            raise ValueError(f"不支持的文件类型: {file_type}")
        
        # 将所有列转换为VARCHAR类型
        convert_table_to_varchar(table_name, "", duckdb_con)

        logger.info(f"成功从文件路径创建持久化表: {table_name}")

    except Exception as e:
        logger.error(f"从文件路径创建持久化表失败 {table_name}: {str(e)}")
        raise


def create_table_from_dataframe(duckdb_con, table_name: str, file_path_or_df, file_type=None):
    """
    使用CREATE TABLE将数据持久化到DuckDB
    这样数据会真正写入到持久化文件中
    支持文件路径或DataFrame
    """
    if isinstance(file_path_or_df, str) and file_type:
        # 如果是文件路径，使用文件路径方式
        create_varchar_table_from_file_path(duckdb_con, table_name, file_path_or_df, file_type)
    else:
        # 如果是DataFrame，使用原有的方式
        create_varchar_table_from_dataframe_file(duckdb_con, table_name, file_path_or_df)

    # 获取表信息. If this fails, it should raise an exception.
    row_count_result = duckdb_con.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()
    row_count = row_count_result[0] if row_count_result else 0

    columns_result = duckdb_con.execute(f'PRAGMA table_info("{table_name}")').fetchall()
    columns = [{'name': col[1], 'type': col[2]} for col in columns_result]

    return {
        'row_count': row_count,
        'columns': columns,
        'column_count': len(columns)
    }


def convert_table_to_varchar(table_name: str, table_alias: str, duckdb_con):
    """
    将表的所有列转换为VARCHAR类型
    """
    try:
        # 获取表的列信息
        columns_info = duckdb_con.execute(f"PRAGMA table_info('{table_name}')").fetchall()
        
        # 检查是否所有列都是VARCHAR类型
        all_varchar = True
        for col_info in columns_info:
            col_name, col_type = col_info[1], col_info[2]
            if col_type.upper() != 'VARCHAR':
                all_varchar = False
                break
        
        if all_varchar:
            logger.info(f"表 {table_name} 所有列都是VARCHAR类型，无需转换")
            return
            
        # 如果不是所有列都是VARCHAR，则进行转换
        logger.info(f"表 {table_name} 需要转换列类型为VARCHAR")
        
        # 构建新的表名
        new_table_name = f"{table_name}_new_{int(datetime.now().timestamp() * 1000)}"
        
        # 构建列转换SQL
        cast_columns = []
        for col_info in columns_info:
            col_name = col_info[1]
            # 对列名进行转义
            escaped_col_name = col_name.replace('"', '""')
            cast_columns.append(f'CAST("{escaped_col_name}" AS VARCHAR) AS "{escaped_col_name}"')
        
        cast_sql = ", ".join(cast_columns)
        
        # 创建新的VARCHAR表
        create_sql = f'CREATE TABLE "{new_table_name}" AS SELECT {cast_sql} FROM "{table_name}"'
        duckdb_con.execute(create_sql)
        
        # 删除旧表
        duckdb_con.execute(f'DROP TABLE "{table_name}"')
        
        # 重命名新表
        duckdb_con.execute(f'ALTER TABLE "{new_table_name}" RENAME TO "{table_name}"')
        
        logger.info(f"成功将表 {table_name} 转换为VARCHAR类型")
        
    except Exception as e:
        logger.error(f"转换表 {table_name} 列类型失败: {str(e)}")
        raise


def reload_all_file_datasources_to_duckdb(duckdb_con):
    """重新加载所有文件数据源到DuckDB"""
    return file_datasource_manager.reload_all_file_datasources()


# 创建全局实例
file_datasource_manager = FileDatasourceManager()