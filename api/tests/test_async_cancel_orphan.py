"""#8 回归：异步任务在"结果表已建、complete_task 却因并发取消而被拒"的窗口里，
不能留下孤儿表和 datasource 记录。

取消检查点 2（查询完成后、保存元数据前）之后到 complete_task 之间有一段窗口：
取消请求若恰好落在这里，complete_task 因状态已是 CANCELLING 而返回 False，但表
已建好、datasource 记录也已写入。修复前这条分支只记日志，孤儿表和记录残留，任务
显示 cancelled 却留着一张可查询的表。
"""

import pytest

duckdb = pytest.importorskip("duckdb")

from core.data.file_datasource_manager import file_datasource_manager
from core.database.duckdb_pool import get_connection_pool
from core.services.task_manager import TaskStatus, task_manager
from routers.async_tasks import _discard_persisted_result, execute_async_query


def _table_exists(name: str) -> bool:
    with get_connection_pool().get_connection() as con:
        tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
    return name in tables


def _cleanup(name: str) -> None:
    try:
        with get_connection_pool().get_connection() as con:
            con.execute(f'DROP TABLE IF EXISTS "{name}"')
    except Exception:  # pragma: no cover
        pass
    try:
        file_datasource_manager.delete_file_datasource(name)
    except Exception:  # pragma: no cover
        pass


class TestDiscardPersistedResult:
    def test_drops_table_and_datasource_record(self):
        name = "discard_helper_test_tbl"
        try:
            with get_connection_pool().get_connection() as con:
                con.execute(f'CREATE OR REPLACE TABLE "{name}" AS SELECT 1 AS x')
            file_datasource_manager.save_file_datasource({
                "source_id": name,
                "filename": name,
                "file_path": f"duckdb://{name}",
                "file_type": "duckdb_async_query",
                "row_count": 1,
            })
            assert _table_exists(name)
            assert file_datasource_manager.get_file_datasource(name) is not None

            _discard_persisted_result("task-x", name)

            assert not _table_exists(name)
            assert file_datasource_manager.get_file_datasource(name) is None
        finally:
            _cleanup(name)

    def test_none_table_name_is_noop(self):
        # 只要不抛异常即可（table_name 从未被赋值的失败早期路径）
        _discard_persisted_result("task-x", None)


class TestCancelDuringPersistRace:
    def test_orphan_cleaned_when_cancel_lands_before_complete(self, monkeypatch):
        table = "orphan_race_result_tbl"
        try:
            task_id = task_manager.create_task("SELECT 42 AS answer", task_type="query")

            # 两个前置取消检查点都不能看到取消，否则会走已处理的早退路径而非竞态窗口
            monkeypatch.setattr(task_manager, "is_cancellation_requested", lambda tid: False)

            # 模拟竞态：complete_task 提交前的瞬间，取消请求刚好落地(RUNNING -> CANCELLING)
            original_complete = task_manager.complete_task

            def racing_complete(tid, info):
                task_manager.request_cancellation(tid, "raced in during persist")
                return original_complete(tid, info)  # 现在看到 CANCELLING，返回 False

            monkeypatch.setattr(task_manager, "complete_task", racing_complete)

            execute_async_query(task_id, "SELECT 42 AS answer", custom_table_name=table)

            # 表和 datasource 记录都必须被清理，任务落定为 cancelled（而不是留 CANCELLING
            # 等 60s 看门狗）
            assert not _table_exists(table), "orphaned result table was not dropped"
            assert file_datasource_manager.get_file_datasource(table) is None, \
                "orphaned datasource record was not deleted"
            final = task_manager.get_task(task_id)
            assert final is not None and final.status == TaskStatus.CANCELLED
        finally:
            _cleanup(table)

    def test_successful_task_keeps_its_result_table(self, monkeypatch):
        """对照组：正常完成时绝不能误删结果表——保证清理逻辑只对被拒的取消/失败生效。"""
        table = "legit_result_keep_tbl"
        try:
            task_id = task_manager.create_task("SELECT 7 AS n", task_type="query")
            monkeypatch.setattr(task_manager, "is_cancellation_requested", lambda tid: False)

            execute_async_query(task_id, "SELECT 7 AS n", custom_table_name=table)

            assert _table_exists(table), "legitimate result table was wrongly removed"
            assert task_manager.get_task(task_id).status == TaskStatus.SUCCESS
        finally:
            _cleanup(table)


class TestFailTaskGuardMissFallsBackToCancelled:
    """#8(review): 查询异常处理里,若 fail_task 因并发取消(RUNNING->CANCELLING)导致
    status 守卫落空而返回 False,不能只记日志把任务留在 CANCELLING 等 60s 看门狗——
    必须兜底推进到终态 CANCELLED。"""

    def test_guard_miss_during_fail_marks_cancelled(self, monkeypatch):
        table = "failguard_race_result_tbl"
        try:
            task_id = task_manager.create_task("SELECT 1 AS x", task_type="query")

            # 让 fail_task 在自己的 UPDATE 之前把状态推到 CANCELLING,复现竞态:
            # 外层 is_cancellation_requested 仍为 False(此刻还是 RUNNING)->进入 else,
            # 随后 fail_task 守卫落空返回 False。
            original_fail = task_manager.fail_task

            def racing_fail(tid, msg):
                task_manager.request_cancellation(tid, "raced in during fail")
                return original_fail(tid, msg)  # status=CANCELLING -> 守卫落空 -> False

            monkeypatch.setattr(task_manager, "fail_task", racing_fail)

            # 不存在的表 -> CTAS 抛 catalog 错误 -> 进入 except Exception 处理块
            execute_async_query(
                task_id, "SELECT * FROM __no_such_table_failguard__", custom_table_name=table
            )

            final = task_manager.get_task(task_id)
            assert final is not None and final.status == TaskStatus.CANCELLED, (
                f"task stuck in {final.status if final else None}, expected CANCELLED fallback"
            )
        finally:
            _cleanup(table)
