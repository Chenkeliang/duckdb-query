"""后端健壮性回归：同步阻塞的查询端点必须跑在工作线程池上，不能占死事件循环。

背景:多个查询端点原为 `async def` 却在体内直接同步执行 DuckDB(无 await),因此
运行在 asyncio 事件循环线程上——一条重查询会把 /health 等所有请求全部卡住(前端
看到的一连串 NETWORK_ERROR)。修复是把这些端点改成普通 `def`,FastAPI 会自动用
工作线程池执行,事件循环保持空闲。

必须用真实 uvicorn(独立事件循环 + 线程池)+ 外部客户端线程来验证:进程内单事件
循环里,阻塞的 async 端点会连测试自身也一起卡住,测不出差异。这里起一个真 server,
让 /api/duckdb/tables(现为 def)里的查询阻塞 2 秒,并发打 /health,断言 /health 秒回。
端点若退回 async def,/health 会被同一事件循环卡住 ~2 秒,断言失败。
"""

import socket
import threading
import time
from contextlib import contextmanager

import httpx
import uvicorn


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def test_health_stays_responsive_during_blocking_query_endpoint(monkeypatch):
    import routers.duckdb_query as dq

    class _SlowCon:
        def execute(self, *_a, **_k):
            time.sleep(2.0)  # 模拟重查询;端点是 def 时这睡在工作线程,不阻塞事件循环
            raise RuntimeError("simulated slow query abort")

        def close(self):
            pass

    @contextmanager
    def _slow_conn():
        yield _SlowCon()

    monkeypatch.setattr(dq, "with_duckdb_connection", _slow_conn)

    from main import app

    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{port}"
        # 等 server 起来
        for _ in range(100):
            try:
                if httpx.get(f"{base}/health", timeout=0.5).status_code == 200:
                    break
            except Exception:  # noqa: BLE001
                time.sleep(0.1)
        else:
            raise AssertionError("server did not start")

        # 在独立线程发起阻塞查询,占住一个工作线程
        def _slow_req():
            try:
                httpx.get(f"{base}/api/duckdb/tables", timeout=10)
            except Exception:  # noqa: BLE001
                pass

        st = threading.Thread(target=_slow_req, daemon=True)
        st.start()
        time.sleep(0.5)  # 让阻塞查询跑起来、占住工作线程

        # 阻塞查询在飞时,/health 必须秒回(事件循环没被占死)
        t0 = time.monotonic()
        resp = httpx.get(f"{base}/health", timeout=5)
        dt = time.monotonic() - t0

        assert resp.status_code == 200
        assert dt < 1.0, (
            f"/health took {dt:.2f}s while a blocking query ran — "
            "event loop is starved (endpoint reverted to async def?)"
        )
    finally:
        server.should_exit = True
        thread.join(timeout=10)
