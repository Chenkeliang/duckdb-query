"""CI 冻结包冒烟：启动 PyInstaller 产物，跑保真查询电池，断言精确值。

v1.1.5 事故（spec excludes 掉 pyarrow、代码却依赖它，测试环境全绿、
冻结包 DECIMAL 查询全挂）的防再犯闸门：测试通过 ≠ 打包产物可用，
只有真实产物能验证 excludes/hiddenimports 与代码的组合。
在 release CI 的 PyInstaller 之后、tauri 打包签名之前运行，失败即中止发布。

用法: python scripts/frozen_smoke.py [binary_path]
默认 binary: api/dist/duckquery-api/duckquery-api(.exe)
纯 stdlib，macOS / Windows runner 通用。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

STARTUP_TIMEOUT = 180  # Windows runner 冷启动 + 杀软扫描可能很慢


def _default_binary() -> Path:
    root = Path(__file__).resolve().parent.parent / "dist" / "duckquery-api"
    exe = root / ("duckquery-api.exe" if sys.platform.startswith("win") else "duckquery-api")
    return exe


def _wait_port(proc: subprocess.Popen) -> int:
    """run.py 首行打印端口；限时读取。

    readline 放到守护线程：若二进制在打印端口前就卡住（Windows 杀软扫描
    刚落盘的可执行文件是典型场景），主线程的阻塞 readline 会让
    STARTUP_TIMEOUT 形同虚设，卡到 CI 的 job 级超时（数小时）才失败。
    """
    import queue

    q: "queue.Queue[str]" = queue.Queue()

    def _reader() -> None:
        while True:
            line = proc.stdout.readline()
            if not line:  # EOF：进程退出
                q.put("")
                return
            if line.strip():
                q.put(line.strip())
                return

    threading.Thread(target=_reader, daemon=True).start()
    try:
        line = q.get(timeout=STARTUP_TIMEOUT)
    except queue.Empty:
        raise SystemExit(
            f"FAIL: no port line within {STARTUP_TIMEOUT}s (backend hung before printing port)"
        ) from None
    if not line:
        raise SystemExit(f"FAIL: backend exited early with code {proc.poll()}")
    digits = "".join(ch for ch in line if ch.isdigit())
    if not digits:
        raise SystemExit(f"FAIL: no port in first line (got {line!r})")
    return int(digits)


def _wait_health(port: int) -> None:
    deadline = time.time() + STARTUP_TIMEOUT
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(1)
    raise SystemExit("FAIL: /health never became ready")


def _post_json(port: int, path: str, payload: dict) -> tuple:
    """POST JSON，容忍 4xx/5xx（返回 (status, body_dict)）。"""
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="PUT" if path.startswith("/api/settings") else "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(body)
        except ValueError:
            return exc.code, {"raw": body[:400]}


def _execute(port: int, sql: str) -> list:
    body = json.dumps({"sql": sql, "is_preview": True}).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/duckdb/execute",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise SystemExit(f"FAIL: HTTP {exc.code} for {sql!r}: {detail}") from exc
    if not payload.get("success"):
        raise SystemExit(f"FAIL: query errored: {json.dumps(payload, ensure_ascii=False)[:400]}")
    return payload["data"]["data"]


def _check(name: str, actual, expected) -> None:
    if actual != expected:
        raise SystemExit(f"FAIL: {name}: expected {expected!r}, got {actual!r}")
    print(f"  ok {name} = {expected!r}")


def main() -> None:
    binary = Path(sys.argv[1]) if len(sys.argv) > 1 else _default_binary()
    if not binary.is_file():
        raise SystemExit(f"FAIL: binary not found: {binary}")

    workdir = Path(tempfile.mkdtemp(prefix="frozen_smoke_"))
    env = {
        "APP_ROOT": str(workdir / "approot"),
        "CONFIG_DIR": str(workdir / "config"),
        "DUCKDB_DATA_DIR": str(workdir / "data"),
    }
    full_env = {**os.environ, **env}
    stderr_path = workdir / "stderr.log"
    print(f"starting {binary}")
    proc = subprocess.Popen(
        [str(binary)],
        stdout=subprocess.PIPE,
        stderr=open(stderr_path, "w", encoding="utf-8"),
        text=True,
        env=full_env,
    )
    try:
        port = _wait_port(proc)
        # 端口行之后排空 stdout，避免管道缓冲区塞满把后端写日志卡死
        threading.Thread(
            target=lambda: [None for _ in proc.stdout], daemon=True
        ).start()
        print(f"backend on port {port}")
        _wait_health(port)

        rows = _execute(
            port,
            "SELECT -0.30::DECIMAL(38,2) AS amt, "
            "0.1234567890123456789::DECIMAL(38,19) AS hp, "
            "170141183460469231731687303715884105727::HUGEINT AS h, "
            "{'k': [1, 2]}::VARIANT AS v, "
            "DATE '9999-12-31' AS dt",
        )
        _check("DECIMAL scale", rows[0]["amt"], "-0.30")
        _check("DECIMAL(38,19)", rows[0]["hp"], "0.1234567890123456789")
        _check("HUGEINT", rows[0]["h"], "170141183460469231731687303715884105727")
        _check("VARIANT json string", rows[0]["v"], '{"k": [1, 2]}')
        _check("sentinel date", rows[0]["dt"], "9999-12-31 00:00:00")

        # 无 FROM 写法:全新实例零表,execute 校验层会拒绝带 FROM 的查询
        rows = _execute(
            port,
            "SELECT unnest([9007199254740993, NULL]::BIGINT[]) AS b "
            "ORDER BY b NULLS LAST",
        )
        _check("nullable BIGINT > 2^53", rows[0]["b"], "9007199254740993")
        _check("nullable BIGINT null", rows[1]["b"], None)

        rows = _execute(port, "SELECT 42 AS a, 'x' AS s")
        _check("plain int", rows[0]["a"], 42)
        _check("plain varchar", rows[0]["s"], "x")

        # AI 链路（llm_client + httpx）在冻结包内可用:配一个不可达端点的
        # provider,期待干净的"请求失败"JSON——若打包漏了 httpx 传递依赖,
        # 这里会是 ModuleNotFoundError(本分支同级别的第二个依赖面改动,
        # 与 DECIMAL 电池同等需要产物级验证)
        _post_json(port, "/api/settings/ai", {
            "enabled": True, "default_provider": "p1",
            "providers": [{"id": "p1", "type": "openai_compatible",
                           "base_url": "http://127.0.0.1:9/v1",
                           "api_key": "sk-smoke", "models": ["m1"],
                           "enabled": True}],
            "features": {},
        })
        _status, body = _post_json(port, "/api/ai/providers/p1/test", {})
        body_text = json.dumps(body, ensure_ascii=False)
        if "No module named" in body_text or "ModuleNotFoundError" in body_text:
            raise SystemExit(f"FAIL: AI stack missing modules in bundle: {body_text[:300]}")
        if "LLM request failed" not in body_text:
            raise SystemExit(f"FAIL: unexpected AI probe response: {body_text[:300]}")
        print("  ok AI client reaches httpx cleanly (connection refused as expected)")

        # Excel/.xls 读取栈（python_calamine）在冻结包内可导入:上传一个假
        # .xls 触发 inspect——calamine 对垃圾字节报"解析失败"是预期,报
        # "No module named"则是打包缺依赖(v1.2.1 本机构建曾因 venv 未同步
        # requirements 漏装 calamine,.xls 全挂而 .xlsx 冒烟全绿)
        boundary = "----smokeboundary42"
        fake_xls = b"not-a-real-xls-file"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="probe.xls"\r\n'
            f"Content-Type: application/vnd.ms-excel\r\n\r\n"
        ).encode() + fake_xls + f"\r\n--{boundary}--\r\n".encode()
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/upload",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                upload_body = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            upload_body = exc.read().decode("utf-8", errors="replace")
        probe_text = upload_body
        file_id = None
        try:
            file_id = json.loads(upload_body)["data"]["pending_excel"]["file_id"]
        except Exception:  # 上传阶段即失败:直接用其响应体判定
            pass
        if file_id:
            _status, inspect_body = _post_json(
                port, "/api/data-sources/excel/inspect", {"file_id": file_id}
            )
            probe_text = json.dumps(inspect_body, ensure_ascii=False)
        if "No module named" in probe_text or "ModuleNotFoundError" in probe_text:
            raise SystemExit(
                f"FAIL: excel stack missing modules in bundle: {probe_text[:300]}"
            )
        print("  ok excel/.xls stack importable (calamine reachable)")

        print("frozen bundle smoke: ALL PASS")
    except SystemExit:
        if stderr_path.exists():
            tail = stderr_path.read_text(encoding="utf-8", errors="replace").splitlines()[-30:]
            print("--- backend stderr tail ---", file=sys.stderr)
            for line in tail:
                print(line, file=sys.stderr)
        raise
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
