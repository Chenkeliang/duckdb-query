# -*- mode: python ; coding: utf-8 -*-
import os
import glob
import shutil
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

starlette_hidden = collect_submodules('starlette')
# sqlglot 的方言模块(parse_one(..., read="duckdb"))是运行时动态加载的,静态分析会漏 → 显式全收
sqlglot_hidden = collect_submodules('sqlglot')

a = Analysis(
    ['run.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        # NOTE: no ('config', 'config') — runtime config is resolved from
        # get_config_dir() (CONFIG_DIR env / per-user dir), never the bundle.
        # api/config is a runtime-generated dir, absent in a clean CI checkout.
        ('prompts', 'prompts'),            # read-only prompt templates
        *collect_data_files('openpyxl'),
    ],
    # NOTE: DuckDB extensions (Mach-O dylibs) are copied post-build via shutil below
    # to avoid PyInstaller's codesign step which fails on these extension files.
    hiddenimports=[
        'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto', 'uvicorn.loops.asyncio',
        'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl', 'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan', 'uvicorn.lifespan.on',
        *starlette_hidden, *sqlglot_hidden,
        'pydantic.deprecated.class_validators', 'pydantic.deprecated.config', 'pydantic_core',
        'cryptography', 'cryptography.hazmat.primitives.ciphers.algorithms',
        'psycopg2', 'multipart', 'psutil', 'python_calamine',
    ],
    hookspath=[], hooksconfig={}, runtime_hooks=[],
    # 体积优化排除项(v1.2.1 起 pandas/numpy/pyarrow 已整体退出 requirements,
    # 此处 excludes 是防回流的保险):numpy 会被 duckdb 的 PyInstaller hook
    # 无条件拖入(本项目不用 fetchnumpy/df 路径,实测排除后冒烟全绿);
    # pyarrow/pandas 防未来传递依赖悄悄带回;hf_xet 仅 HF 下载加速用。
    excludes=['magic', 'tkinter', 'matplotlib', 'IPython', 'jupyter', 'notebook', 'PIL',
              'pyarrow', 'hf_xet', 'numpy', 'pandas'],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='duckquery-api',
          debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
          console=True, disable_windowed_traceback=False, argv_emulation=False,
          target_arch=None, codesign_identity=None, entitlements_file=None)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, upx_exclude=[], name='duckquery-api')

# --- Post-build: copy DuckDB extensions verbatim (bypass PyInstaller codesign) ---
# PyInstaller on macOS tries to re-sign all Mach-O files it finds in datas, which
# fails for DuckDB's extension binaries. Copy them after COLLECT completes instead.
_ext_src = os.path.join(SPECPATH, 'extensions')
_ext_dst = os.path.join(DISTPATH, 'duckquery-api', 'extensions')
if os.path.isdir(_ext_src):
    if os.path.exists(_ext_dst):
        shutil.rmtree(_ext_dst)
    shutil.copytree(_ext_src, _ext_dst)
    print(f"[duckquery.spec] copied extensions: {_ext_src} -> {_ext_dst}")
