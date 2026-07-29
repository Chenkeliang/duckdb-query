"""shutdown 自兜底回归:优雅 drain 卡死时,进程必须在期限内自行
「关池(checkpoint)→硬退」,而不是滞留成僵尸等外部 SIGKILL。

背景:桌面壳 quit 后约 5s 会 SIGKILL sidecar;强杀若落在 WAL checkpoint
中途,WAL 与 db 文件的 checkpoint iteration 脱节。当前版本会保留 WAL 并
拒绝打开旧 checkpoint，避免把已提交数据静默隐藏。
"""
from unittest.mock import patch

from routers import system_control


def test_hard_exit_fallback_closes_pool_then_exits():
    order = []
    with patch(
        "core.database.duckdb_pool.shutdown_all_duckdb_connections",
        side_effect=lambda: order.append("pool_closed"),
    ), patch.object(
        system_control.os, "_exit", side_effect=lambda code: order.append(("exit", code))
    ), patch.object(system_control.time, "sleep"):
        system_control._hard_exit_fallback(3.0)

    assert order == ["pool_closed", ("exit", 0)]


def test_hard_exit_fallback_exits_even_if_pool_close_fails():
    order = []
    with patch(
        "core.database.duckdb_pool.shutdown_all_duckdb_connections",
        side_effect=RuntimeError("pool wedged"),
    ), patch.object(
        system_control.os, "_exit", side_effect=lambda code: order.append(("exit", code))
    ), patch.object(system_control.time, "sleep"):
        system_control._hard_exit_fallback(3.0)

    # 关池失败不能挡住退出——僵尸比一次失败的 checkpoint 更危险
    assert order == [("exit", 0)]


def test_stop_server_arms_fallback_before_graceful_path():
    started = []

    class _FakeThread:
        def __init__(self, target=None, args=(), daemon=None):
            started.append((target, args))

        def start(self):
            pass

    with patch.object(system_control.threading, "Thread", _FakeThread), patch.object(
        system_control.time, "sleep"
    ), patch.object(
        # 注意 patch 的是 system_control 里 from-import 进来的名字;
        # patch 源模块不会生效,真函数在测试环境返回 False 会走
        # SIGTERM 自杀兜底,把整个 pytest 进程杀掉。
        system_control, "request_graceful_shutdown", return_value=True
    ), patch(
        "core.database.connection_registry.connection_registry"
    ):
        system_control._stop_server()

    targets = [t for t, _ in started]
    assert system_control._hard_exit_fallback in targets
