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
    """run.py 首行打印端口；限时读取。"""
    deadline = time.time() + STARTUP_TIMEOUT
    line = ""
    while time.time() < deadline:
        if proc.poll() is not None:
            raise SystemExit(f"FAIL: backend exited early with code {proc.returncode}")
        line = proc.stdout.readline().strip()
        if line:
            break
    digits = "".join(ch for ch in line if ch.isdigit())
    if not digits:
        raise SystemExit(f"FAIL: no port line printed (got {line!r})")
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
