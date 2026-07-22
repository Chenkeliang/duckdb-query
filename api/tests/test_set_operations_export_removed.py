"""废弃导出端点删除回归。

/api/set-operations/export 无任何调用方(前端走统一 AsyncTaskDialog,MCP 不用),
且其自建线程池绕过 connection_registry——取消只翻状态、导出照跑,并向
system_async_tasks 写入与统一任务栈不兼容的行格式。整体删除。
"""
from fastapi.testclient import TestClient

from main import app
from core.services.task_manager import task_manager

client = TestClient(app)


def test_export_endpoint_removed():
    resp = client.post(
        "/api/set-operations/export",
        json={"config": {"operation_type": "UNION", "tables": []}, "format": "csv"},
    )
    assert resp.status_code == 404


def test_legacy_add_task_shim_removed():
    # add_task 是该端点独用的旧接口垫片,随端点一并退役;
    # 统一生命周期(create_task/start_task/...)保持可用
    assert not hasattr(task_manager, "add_task")
    assert hasattr(task_manager, "create_task")
    assert hasattr(task_manager, "request_cancellation")


def test_remaining_set_operation_routes_intact():
    paths = {r.path for r in app.routes}
    assert "/api/set-operations/export" not in paths
    for kept in (
        "/api/set-operations/generate",
        "/api/set-operations/preview",
        "/api/set-operations/validate",
        "/api/set-operations/execute",
        "/api/set-operations/simple-union",
    ):
        assert kept in paths, kept
