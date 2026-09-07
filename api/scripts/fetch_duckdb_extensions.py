"""离线预下载 DuckDB 扩展,供 PyInstaller 打包。
用法: python scripts/fetch_duckdb_extensions.py [platform] [--full]
platform ∈ {osx_arm64, osx_amd64, windows_amd64}
省略 platform 时使用当前 DuckDB engine 的 ``PRAGMA platform``，避免版本升级后的平台名漂移。
--full: 拉取全量扩展(excel+httpfs+mysql+postgres),供 -offline 离线全量包;
        缺省只拉 excel(标准包/更新包)。
输出: api/extensions/v<ver>/<platform>/<ext>.duckdb_extension
"""

import gzip
import shutil
import sys
import urllib.request
from pathlib import Path

import duckdb


def _engine_metadata() -> tuple[str, str]:
    connection = duckdb.connect(":memory:")
    try:
        version = str(connection.execute("SELECT version()").fetchone()[0])
        platform = str(connection.execute("PRAGMA platform").fetchone()[0])
        return version, platform
    finally:
        connection.close()


DUCK_VERSION, DUCK_PLATFORM = _engine_metadata()
# json/parquet 为 1.5 内建自动加载,无需单独文件。
# v1.2.0 起桌面包只预置 excel(本地导入/导出属离线场景):mysql/postgres/httpfs
# 合计约 76MB,其使用前提本就是有网络(连远程库/读远程文件),改为扩展页按需
# 下载或查询时 DuckDB autoinstall。启动阶段只 LOAD 不 INSTALL(见
# duckdb_engine._install_duckdb_extensions),未预置扩展不会造成受限网络下的
# 启动联网卡顿("本地引擎启动超时")。
# Artifact names must match DuckDB's canonical on-disk lookup names.
EXTS = ("excel",)

# --full(离线全量包):内网/无外网环境一次装齐,联邦查询开箱即用
FULL_EXTS = ("excel", "httpfs", "mysql_scanner", "postgres_scanner")

# Cloudflare 屏蔽 Python 默认 UA,需设置浏览器 UA
_HEADERS = {"User-Agent": "Mozilla/5.0"}


def main(platform: str, full: bool = False) -> None:
    exts = FULL_EXTS if full else EXTS
    out = Path(__file__).resolve().parent.parent / "extensions" / DUCK_VERSION / platform
    # 幂等:先清空,避免脚本迭代/重命名遗留旧文件(如 *_scanner)被一并打进包
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)
    for artifact_name in exts:
        url = f"https://extensions.duckdb.org/{DUCK_VERSION}/{platform}/{artifact_name}.duckdb_extension.gz"
        dest = out / f"{artifact_name}.duckdb_extension"
        print(f"-> {url}")
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req) as resp:
            data = gzip.decompress(resp.read())
        dest.write_bytes(data)
        print(f"   wrote {dest} ({len(data)} bytes)")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--full"]
    main(args[0] if args else DUCK_PLATFORM, full="--full" in sys.argv)
