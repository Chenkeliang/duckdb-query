#!/usr/bin/env python3
"""
清理卡住的 "取消中" 任务
将长时间处于 cancelling 状态的任务标记为 failed
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def cleanup_stuck_tasks():
    """清理卡住的取消中任务"""
    from core.database.duckdb_pool import with_system_connection
    from core.common.timezone_utils import get_storage_time
    
    with with_system_connection() as conn:
        # 查找所有 cancelling 状态的任务
        rows = conn.execute("""
            SELECT task_id, query, created_at 
            FROM system_async_tasks 
            WHERE status = 'cancelling'
        """).fetchall()
        
        if not rows:
            logger.info("No stuck cancelling tasks found")
            return 0
        
        logger.info(f"Found {len(rows)} stuck cancelling tasks")
        
        # 将它们全部更新为 failed
        completed_at = get_storage_time()
        for task_id, query, created_at in rows:
            conn.execute("""
                UPDATE system_async_tasks
                SET status = 'failed',
                    error_message = 'Task cancelled (historical task cleanup)',
                    completed_at = ?
                WHERE task_id = ?
            """, [completed_at, task_id])
            logger.info(f"Cleaned: {task_id} - {query[:50]}...")
        
        logger.info(f"Cleanup completed: {len(rows)} tasks marked as failed")
        return len(rows)


if __name__ == "__main__":
    count = cleanup_stuck_tasks()
    print(f"\n清理了 {count} 个卡住的任务")
