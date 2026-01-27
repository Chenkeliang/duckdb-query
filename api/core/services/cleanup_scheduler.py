"""
文件清理调度器
定时清理过期的临时文件和DuckDB表
"""

import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


class CleanupScheduler:
    """文件清理调度器"""

    def __init__(self, cleanup_interval_hours: int = 6):
        """
        初始化清理调度器

        Args:
            cleanup_interval_hours: 清理间隔（小时），默认6小时
        """
        self.cleanup_interval_hours = cleanup_interval_hours
        self.cleanup_thread: Optional[threading.Thread] = None
        self.running = False
        self.cleanup_function = None

    def set_cleanup_function(self, cleanup_func):
        """
        设置清理函数

        Args:
            cleanup_func: 清理函数，应该返回清理的文件数量
        """
        self.cleanup_function = cleanup_func

    def start(self):
        """启动清理调度器"""
        if self.running:
            logger.warning("Cleanup scheduler is already running")
            return

        if not self.cleanup_function:
            logger.error("Cleanup function not set, cannot start scheduler")
            return

        self.running = True
        self.cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self.cleanup_thread.start()
        logger.info(
            f"File cleanup scheduler started, cleanup interval: {self.cleanup_interval_hours} hours"
        )

    def stop(self):
        """停止清理调度器"""
        if not self.running:
            return

        self.running = False
        if self.cleanup_thread:
            self.cleanup_thread.join(timeout=5)
        logger.info("File cleanup scheduler stopped")

    def _cleanup_loop(self):
        """清理循环"""
        while self.running:
            try:
                # 执行清理
                if self.cleanup_function:
                    cleaned_count = self.cleanup_function()
                    if cleaned_count > 0:
                        logger.info(f"Scheduled cleanup completed, cleaned {cleaned_count} files/tables")
                    else:
                        logger.debug("Scheduled cleanup completed, no files to clean")

            except Exception as e:
                logger.error(f"Scheduled cleanup failed: {str(e)}")

            # 等待下次清理
            for _ in range(self.cleanup_interval_hours * 3600):  # 转换为秒
                if not self.running:
                    break
                time.sleep(1)

    def force_cleanup(self):
        """
        强制立即执行一次清理

        Returns:
            int: 清理的文件数量
        """
        if not self.cleanup_function:
            logger.error("Cleanup function not set")
            return 0

        try:
            cleaned_count = self.cleanup_function()
            logger.info(f"Force cleanup completed, cleaned {cleaned_count} files/tables")
            return cleaned_count
        except Exception as e:
            logger.error(f"Force cleanup failed: {str(e)}")
            return 0


# 全局清理调度器实例
cleanup_scheduler = CleanupScheduler(cleanup_interval_hours=6)


def start_cleanup_scheduler(cleanup_func):
    """
    启动全局清理调度器

    Args:
        cleanup_func: 清理函数
    """
    cleanup_scheduler.set_cleanup_function(cleanup_func)
    cleanup_scheduler.start()


def stop_cleanup_scheduler():
    """停止全局清理调度器"""
    cleanup_scheduler.stop()


def force_cleanup():
    """
    强制立即执行一次清理

    Returns:
        int: 清理的文件数量
    """
    return cleanup_scheduler.force_cleanup()
