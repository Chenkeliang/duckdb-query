"""离线预下载 DuckDB 扩展,供 PyInstaller 打包。
用法: python scripts/fetch_duckdb_extensions.py <platform>
platform ∈ {osx_arm64, osx_amd64, windows_amd64}
输出: api/extensions/v<ver>/<platform>/<ext>.duckdb_extension

注: DuckDB 1.1+ 将 mysql/postgres 扩展重命名为 mysql_scanner/postgres_scanner,
    但 LOAD 指令仍使用 mysql/postgres 别名,本地文件需以 LOAD 名存储。
"""

import gzip
import shutil
import sys
import urllib.request
from pathlib import Path

DUCK_VER = "1.5.3"
# json/parquet 为 1.5 内建自动加载,无需单独文件。
# httpfs 不预置:仅 URL/远程访问需要,而那本就需联网,首次用到时由 DuckDB 按需 INSTALL。
# 映射: LOAD 名 -> CDN 文件名
EXTS = {
    "excel": "excel",
    "mysql": "mysql_scanner",
    "postgres": "postgres_scanner",
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
