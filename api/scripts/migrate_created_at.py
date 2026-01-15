#!/usr/bin/env python3
"""
迁移脚本：为现有表填充 created_at 字段

此脚本会：
1. 检查 system_file_datasources 表中所有 created_at 为 NULL 的记录
2. 使用 upload_time 作为 created_at 的值
3. 如果 upload_time 也为 NULL，使用当前时间
"""

import sys
import os
from datetime import datetime

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database.duckdb_engine import with_duckdb_connection
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def migrate_created_at():
    """迁移 created_at 字段"""
    try:
        with with_duckdb_connection() as conn:
            # 检查需要迁移的记录数
            result = conn.execute("""
                SELECT COUNT(*) 
                FROM system_file_datasources 
                WHERE created_at IS NULL
            """).fetchone()
            
            count = result[0] if result else 0
            logger.info(f"发现 {count} 条记录需要填充 created_at 字段")
            
            if count == 0:
                logger.info("所有记录的 created_at 字段已填充，无需迁移")
                return
            
            # 使用 upload_time 填充 created_at
            conn.execute("""
                UPDATE system_file_datasources
                SET created_at = COALESCE(upload_time, CURRENT_TIMESTAMP)
                WHERE created_at IS NULL
            """)
            
            # 同时填充 updated_at
            conn.execute("""
                UPDATE system_file_datasources
                SET updated_at = COALESCE(upload_time, CURRENT_TIMESTAMP)
                WHERE updated_at IS NULL
            """)
            
            logger.info(f"成功迁移 {count} 条记录的 created_at 字段")
            
            # 验证迁移结果
            result = conn.execute("""
                SELECT COUNT(*) 
                FROM system_file_datasources 
                WHERE created_at IS NULL
            """).fetchone()
            
            remaining = result[0] if result else 0
            if remaining > 0:
                logger.warning(f"仍有 {remaining} 条记录的 created_at 为 NULL")
            else:
                logger.info("所有记录的 created_at 字段已成功填充")
                
    except Exception as e:
        logger.error(f"迁移失败: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    logger.info("开始迁移 created_at 字段...")
    migrate_created_at()
    logger.info("迁移完成")
