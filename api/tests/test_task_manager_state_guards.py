"""任务状态机的终态保护：fail_task / mark_cancelled 不能覆盖已经是终态的任务。

背景：start_task/complete_task 的 UPDATE 都带 `WHERE ... AND status IN (...)`，
只允许从预期的源状态转换；fail_task/mark_cancelled 曾经是裸的
`WHERE task_id = ?`，任何状态都能被覆盖成 failed/cancelled——包括已经
success 的任务。force_fail_task 是有意保留的、文档明确写着"regardless of
current status"的转义口子（人工取消场景专用），不受这个保护约束。
"""

from core.services.task_manager import TaskManager, TaskStatus


def _fresh_manager() -> TaskManager:
    # 复用全局 task_manager 指向的同一个（conftest.py 已隔离的）system db，
    # 但用独立实例避免和其他测试共享内存态缓存。
    return TaskManager()


class TestFailTaskTerminalGuard:
    def test_cannot_overwrite_success_status(self):
        mgr = _fresh_manager()
        task_id = mgr.create_task("SELECT 1", task_type="query")
        assert mgr.start_task(task_id)
        assert mgr.complete_task(task_id, {"row_count": 1})
        assert mgr.get_task(task_id).status == TaskStatus.SUCCESS

        result = mgr.fail_task(task_id, "late failure signal")

        assert result is False
        assert mgr.get_task(task_id).status == TaskStatus.SUCCESS  # 没被覆盖

    def test_cannot_overwrite_cancelled_status(self):
        mgr = _fresh_manager()
        task_id = mgr.create_task("SELECT 1", task_type="query")
        assert mgr.start_task(task_id)
        assert mgr.mark_cancelled(task_id, "user cancelled")
        assert mgr.get_task(task_id).status == TaskStatus.CANCELLED

        result = mgr.fail_task(task_id, "late failure signal")

        assert result is False
        assert mgr.get_task(task_id).status == TaskStatus.CANCELLED

    def test_allows_running_to_failed(self):
        """正常场景：RUNNING -> FAILED 必须仍然放行，不能连带把合法转换也堵死。"""
        mgr = _fresh_manager()
        task_id = mgr.create_task("SELECT 1", task_type="query")
        assert mgr.start_task(task_id)

        result = mgr.fail_task(task_id, "real failure")

        assert result is True
        assert mgr.get_task(task_id).status == TaskStatus.FAILED

    def test_force_fail_task_still_overwrites_regardless_of_status(self):
        """force_fail_task 是有意保留的转义口子，这条保护不应该影响它。"""
        mgr = _fresh_manager()
        task_id = mgr.create_task("SELECT 1", task_type="query")
        assert mgr.start_task(task_id)
        assert mgr.complete_task(task_id, {"row_count": 1})
        assert mgr.get_task(task_id).status == TaskStatus.SUCCESS

        result = mgr.force_fail_task(task_id, "forced override")

        assert result is True
        assert mgr.get_task(task_id).status == TaskStatus.FAILED


class TestMarkCancelledTerminalGuard:
    def test_cannot_overwrite_success_status(self):
        mgr = _fresh_manager()
        task_id = mgr.create_task("SELECT 1", task_type="query")
        assert mgr.start_task(task_id)
        assert mgr.complete_task(task_id, {"row_count": 1})
        assert mgr.get_task(task_id).status == TaskStatus.SUCCESS

        result = mgr.mark_cancelled(task_id, "late cancel signal")

        assert result is False
        assert mgr.get_task(task_id).status == TaskStatus.SUCCESS

    def test_cannot_overwrite_failed_status(self):
        mgr = _fresh_manager()
        task_id = mgr.create_task("SELECT 1", task_type="query")
        assert mgr.start_task(task_id)
        assert mgr.fail_task(task_id, "real failure")
        assert mgr.get_task(task_id).status == TaskStatus.FAILED

        result = mgr.mark_cancelled(task_id, "late cancel signal")

        assert result is False
        assert mgr.get_task(task_id).status == TaskStatus.FAILED

    def test_allows_running_to_cancelled(self):
        mgr = _fresh_manager()
        task_id = mgr.create_task("SELECT 1", task_type="query")
        assert mgr.start_task(task_id)

        result = mgr.mark_cancelled(task_id, "interrupted")

        assert result is True
        assert mgr.get_task(task_id).status == TaskStatus.CANCELLED

    def test_allows_cancelling_to_cancelled(self):
        """正常取消流程：QUEUED/RUNNING -[request_cancellation]-> CANCELLING
        -[mark_cancelled]-> CANCELLED，这条链路必须继续放行。"""
        mgr = _fresh_manager()
        task_id = mgr.create_task("SELECT 1", task_type="query")
        assert mgr.start_task(task_id)
        assert mgr.request_cancellation(task_id, "user requested")
        assert mgr.get_task(task_id).status == TaskStatus.CANCELLING

        result = mgr.mark_cancelled(task_id, "interrupt landed")

        assert result is True
        assert mgr.get_task(task_id).status == TaskStatus.CANCELLED
