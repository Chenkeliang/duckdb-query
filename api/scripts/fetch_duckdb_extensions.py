"""离线预下载 DuckDB 扩展,供 PyInstaller 打包。
用法: python scripts/fetch_duckdb_extensions.py <platform>
platform ∈ {osx_arm64, osx_amd64, windows_amd64}
输出: api/extensions/v<ver>/<platform>/<ext>.duckdb_extension
"""

import gzip
import shutil
import sys
import urllib.request
from pathlib import Path

DUCK_VER = "1.5.3"
# json/parquet 为 1.5 内建自动加载,无需单独文件。
# v1.2.0 起桌面包只预置 excel(本地导入/导出属离线场景):mysql/postgres/httpfs
# 合计约 76MB,其使用前提本就是有网络(连远程库/读远程文件),改为扩展页按需
# 下载或查询时 DuckDB autoinstall。启动阶段只 LOAD 不 INSTALL(见
# duckdb_engine._install_duckdb_extensions),未预置扩展不会造成受限网络下的
# 启动联网卡顿("本地引擎启动超时")。
# 映射: LOAD 名 -> CDN 文件名(DuckDB 1.1+ 把 mysql/postgres 重命名为
# *_scanner,LOAD 仍用旧名,本地文件需以 LOAD 名存储)
EXTS = {
    "excel": "excel",
}

# Cloudflare 屏蔽 Python 默认 UA,需设置浏览器 UA
_HEADERS = {"User-Agent": "Mozilla/5.0"}


def main(platform: str) -> None:
    out = Path(__file__).resolve().parent.parent / "extensions" / f"v{DUCK_VER}" / platform
    # 幂等:先清空,避免脚本迭代/重命名遗留旧文件(如 *_scanner)被一并打进包
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)
    for load_name, cdn_name in EXTS.items():
        url = f"https://extensions.duckdb.org/v{DUCK_VER}/{platform}/{cdn_name}.duckdb_extension.gz"
        dest = out / f"{load_name}.duckdb_extension"
        print(f"-> {url}")
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req) as resp:
            data = gzip.decompress(resp.read())
        dest.write_bytes(data)
        print(f"   wrote {dest} ({len(data)} bytes)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "osx_arm64")
