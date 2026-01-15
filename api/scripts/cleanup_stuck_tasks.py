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
            logger.info("没有找到卡住的取消中任务")
            return 0
        
        logger.info(f"找到 {len(rows)} 个卡住的取消中任务")
        
        # 将它们全部更新为 failed
        completed_at = get_storage_time()
        for task_id, query, created_at in rows:
            conn.execute("""
                UPDATE system_async_tasks
                SET status = 'failed',
                    error_message = '任务被取消（历史任务清理）',
                    completed_at = ?
                WHERE task_id = ?
            """, [completed_at, task_id])
            logger.info(f"已清理: {task_id} - {query[:50]}...")
        
        logger.info(f"清理完成: {len(rows)} 个任务已标记为失败")
        return len(rows)


if __name__ == "__main__":
    count = cleanup_stuck_tasks()
    print(f"\n清理了 {count} 个卡住的任务")
