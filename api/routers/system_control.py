"""桌面端本地专用系统控制 API。

main.py 仅当环境变量 DUCKQUERY_DESKTOP=1 时才 include 本 router —— Docker/Web 部署
绝不能暴露一个"谁都能把后端关掉"的接口。

/api/system/shutdown 供 Tauri 壳退出时调用，取代直接 SIGKILL 子进程：请求 uvicorn
优雅停机 -> FastAPI lifespan shutdown -> DuckDB 连接池 close_all() -> WAL checkpoint，
避免退出时留下脏 WAL（回放损坏会导致 checkpoint 之后新建的表全部丢失）。
"""

import logging
import os
import signal
import threading
import time

from fastapi import APIRouter

from core.common.server_control import request_graceful_shutdown
from utils.response_helpers import MessageCode, create_success_response

logger = logging.getLogger(__name__)

router = APIRouter(tags=["System"])


def _hard_exit_fallback(deadline_seconds: float) -> None:
    """优雅停机的有界兜底：drain 卡住时抢在外部 SIGKILL 前自行收尾退出。

    正常路径下进程在 ~1s 内退出，本 daemon 线程随之消亡，走不到超时。
    走到超时 = uvicorn drain 被挂起（keep-alive 连接/卡住的工作线程），进程
    成为"端口已关但不退出"的僵尸：桌面壳 quit 后约 5s 会 SIGKILL，部署脚本
    也会补刀。若强杀落在 WAL checkpoint 中途，WAL 与 db 文件的 checkpoint
    iteration 脱节，DuckDB 下次启动会拒绝打开数据库；旧版本曾自动隔离 WAL
    并打开旧 checkpoint，导致其中已提交数据不可见。因此超时后先关
    连接池（触发 checkpoint，与 lifespan shutdown 同一收尾、幂等），再硬退。
    """
    time.sleep(deadline_seconds)
    logger.warning(
        "Graceful drain still running after %.1fs; closing pools and hard-exiting",
        deadline_seconds,
    )
    from core.common.process_exit import hard_exit_after_duckdb_cleanup

    hard_exit_after_duckdb_cleanup(0)


def _stop_server() -> None:
    """在后台线程里执行，留出时间让 /api/system/shutdown 的 200 响应先写完。"""
    time.sleep(0.05)
    # 兜底先武装：即便下面的优雅路径整体卡死，进程也会在期限内干净退出。
    threading.Thread(
        target=_hard_exit_fallback, args=(3.0,), daemon=True
    ).start()
    # 先中断所有在飞查询：重查询若还占着工作线程，uvicorn 优雅停机会一直等它，
    # 可能超过桌面壳的 5s 窗口而被 SIGKILL（脏 WAL → 重启降级）。中断后它们迅速
    # 抛错退出，uvicorn 得以 drain → 跑 lifespan shutdown(连接池 checkpoint)干净退出。
    try:
        from core.database.connection_registry import connection_registry

        connection_registry.interrupt_all()
    except Exception as exc:  # pylint: disable=broad-exception-caught
        logger.warning("interrupt_all on shutdown failed (ignored): %s", exc)
    if request_graceful_shutdown():
        logger.info("Graceful shutdown requested via uvicorn Server.should_exit")
        return
    # 没有通过 api/run.py 注册 Server（例如本地手动用 `uvicorn main:app` 起的进程）时的兜底：
    # SIGTERM 在类 Unix 上会被 uvicorn 默认信号处理捕获，同样触发 lifespan shutdown。
    logger.warning(
        "No uvicorn Server registered with server_control; falling back to SIGTERM"
    )
    os.kill(os.getpid(), signal.SIGTERM)


@router.post("/api/system/shutdown")
async def shutdown_backend():
    """请求后端优雅退出（桌面端专用）。"""
    threading.Thread(target=_stop_server, daemon=True).start()
    return create_success_response(
        data={}, message_code=MessageCode.SYSTEM_SHUTDOWN_INITIATED
    )
