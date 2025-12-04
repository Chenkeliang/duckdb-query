"""
迁移脚本：更新文件数据源表结构
添加 created_at 和 updated_at 字段
"""

import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.duckdb_engine import with_duckdb_connection
from core.timezone_utils import get_current_time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def migrate_file_datasource_table():
    """迁移文件数据源表，添加 created_at 和 updated_at 字段"""
    try:
        with with_duckdb_connection() as conn:
            # 检查表是否存在
            result = conn.execute("""
                SELECT COUNT(*) 
                FROM information_schema.tables 
                WHERE table_name = 'system_file_datasources'
            """).fetchone()
            
            if result[0] == 0:
                logger.info("表 system_file_datasources 不存在，无需迁移")
                return
            
            # 检查是否已有 created_at 字段
            result = conn.execute("""
                SELECT COUNT(*) 
                FROM information_schema.columns 
                WHERE table_name = 'system_file_datasources' 
                AND column_name = 'created_at'
            """).fetchone()
            
            if result[0] > 0:
                logger.info("字段 created_at 已存在，无需迁移")
                return
            
            logger.info("开始迁移文件数据源表...")
            
            # 备份现有数据
            logger.info("备份现有数据...")
            conn.execute("""
                CREATE TABLE system_file_datasources_backup AS 
                SELECT * FROM system_file_datasources
            """)
            
            # 删除旧表
            logger.info("删除旧表...")
            conn.execute("DROP TABLE system_file_datasources")
            
            # 创建新表
            logger.info("创建新表...")
            conn.execute("""
                CREATE TABLE system_file_datasources (
                    source_id VARCHAR PRIMARY KEY,
                    filename VARCHAR NOT NULL,
                    file_path VARCHAR,
                    file_type VARCHAR NOT NULL,
                    row_count INTEGER,
                    column_count INTEGER,
                    columns JSON,
                    column_profiles JSON,
                    upload_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_accessed TIMESTAMP,
                    file_size BIGINT,
                    file_hash VARCHAR,
                    metadata JSON
                )
            """)
            
            # 迁移数据
            logger.info("迁移数据...")
            current_time = get_current_time()
            conn.execute("""
                INSERT INTO system_file_datasources 
                SELECT 
                    source_id,
                    filename,
                    file_path,
                    file_type,
                    row_count,
                    column_count,
                    columns,
                    column_profiles,
                    upload_time,
                    upload_time as created_at,
                    upload_time as updated_at,
                    last_accessed,
                    file_size,
                    file_hash,
                    metadata
                FROM system_file_datasources_backup
            """)
            
            # 删除备份表
            logger.info("删除备份表...")
            conn.execute("DROP TABLE system_file_datasources_backup")
            
            # 创建索引
            logger.info("创建索引...")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_ds_type ON system_file_datasources(file_type)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_ds_upload ON system_file_datasources(upload_time)"
            )
            
            logger.info("✅ 文件数据源表迁移完成！")
            
    except Exception as e:
        logger.error(f"❌ 迁移失败: {e}")
        raise


if __name__ == "__main__":
    migrate_file_datasource_table()
