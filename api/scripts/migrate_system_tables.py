#!/usr/bin/env python3
"""
系统表迁移脚本：从 main.db 迁移到 system.db

使用方法:
    cd /path/to/api
    python scripts/migrate_system_tables.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import duckdb
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

SYSTEM_TABLES = [
    "system_async_tasks",
    "system_task_exports", 
    "system_database_connections",
    "system_file_datasources",
    "system_migration_status",
]


def table_exists(conn, table_name: str) -> bool:
    """检查表是否存在"""
    result = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ?",
        [table_name]
    ).fetchone()
    return result[0] > 0


def migrate_table(main_conn, system_conn, table_name: str) -> bool:
    """迁移单个表"""
    try:
        # 1. 检查源表是否存在
        if not table_exists(main_conn, table_name):
            logger.info(f"跳过 {table_name}: main.db 中不存在")
            return True
        
        # 2. 检查目标表是否已存在且有数据
        if table_exists(system_conn, table_name):
            count = system_conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
            if count > 0:
                logger.info(f"跳过 {table_name}: system.db 中已有 {count} 条数据")
                return True
        
        # 3. 获取源表数据
        rows = main_conn.execute(f'SELECT * FROM "{table_name}"').fetchall()
        if not rows:
            logger.info(f"跳过 {table_name}: main.db 中无数据")
            return True
        
        # 4. 获取列信息
        columns = [desc[0] for desc in main_conn.description]
        
        # 5. 创建目标表（如果不存在）
        if not table_exists(system_conn, table_name):
            # 从源表复制结构
            schema = main_conn.execute(f'DESCRIBE "{table_name}"').fetchall()
            columns_def = ", ".join([f'"{col[0]}" {col[1]}' for col in schema])
            system_conn.execute(f'CREATE TABLE "{table_name}" ({columns_def})')
            logger.info(f"在 system.db 中创建表: {table_name}")
        
        # 6. 插入数据
        placeholders = ", ".join(["?" for _ in columns])
        insert_sql = f'INSERT INTO "{table_name}" VALUES ({placeholders})'
        for row in rows:
            system_conn.execute(insert_sql, list(row))
        
        logger.info(f"迁移成功: {table_name} ({len(rows)} 行)")
        return True
        
    except Exception as e:
        logger.error(f"迁移 {table_name} 失败: {e}")
        return False


def migrate_all():
    """执行完整迁移"""
    from core.common.config_manager import config_manager
    
    paths = config_manager.get_duckdb_paths()
    main_db = str(paths.database_path)
    system_db = str(paths.system_database_path)
    
    logger.info(f"源数据库: {main_db}")
    logger.info(f"目标数据库: {system_db}")
    
    if not Path(main_db).exists():
        logger.warning(f"源数据库不存在: {main_db}，无需迁移")
        return True
    
    main_conn = duckdb.connect(main_db, read_only=True)
    system_conn = duckdb.connect(system_db)
    
    success_count = 0
    for table_name in SYSTEM_TABLES:
        if migrate_table(main_conn, system_conn, table_name):
            success_count += 1
    
    main_conn.close()
    system_conn.close()
    
    logger.info(f"迁移完成: {success_count}/{len(SYSTEM_TABLES)} 个表成功")
    return success_count == len(SYSTEM_TABLES)


if __name__ == "__main__":
    success = migrate_all()
    sys.exit(0 if success else 1)
