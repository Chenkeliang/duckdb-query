# DuckQuery 桌面应用打包设计（Tauri + PyInstaller）

- **日期**: 2026-06-16
- **状态**: 设计已批准（待用户复核本 spec）
- **分支**: `feat_desktop_packaging`（基于 `origin/main`）
- **目标**: 把现有「React 前端 + Python FastAPI 后端 + DuckDB」全栈打包成**三个原生安装包**，让非技术用户**无需安装 Docker / Python / Node / React** 即可双击使用。

---

## 1. 目标与范围

### 1.1 用户故事
> 把一个 `.dmg` / `.exe` 丢给完全不懂技术的同事，他双击安装，首次按一次系统「允许打开」，之后就能：上传 CSV/Excel 查询、连 MySQL 做跨源 JOIN、用 AI 问数。关掉应用后台进程随之退出，重启后数据还在。

### 1.2 三个交付物
| 目标 | 产物 | 构建 runner |
|---|---|---|
| macOS Apple Silicon (arm64) | `DuckQuery_x.y.z_aarch64.dmg` | `macos-15` |
| macOS Intel (x86_64) | `DuckQuery_x.y.z_x64.dmg` | `macos-15-intel` |
| Windows x64 | `DuckQuery_x.y.z_x64-setup.exe` (NSIS) | `windows-latest` |

### 1.3 范围（v1 = 完整版）
**纳入 v1：**
- 三平台原生安装包，离线可用
- 后端 PyInstaller 冻结（onedir）+ 去容器化（per-user 数据目录）
- macOS ad-hoc 签名链（免「文件已损坏」）
- Tauri 壳：sidecar 生命周期、OS 分配高位端口、单实例、端口注入前端
- 首启 splash + `/health` 健康门 + 后端启动失败原生提示
- DuckDB 扩展离线预置、内存自适应、崩溃日志落盘
- 自动更新（Tauri updater，手动「检查更新」触发；payload 用 updater 密钥签名）
- 版本/CHANGELOG 单一源、第三方许可证清单、遥测默认关闭
- 原生文件对话框替代「服务器目录挂载」
- README 增加 Mac/Win 首次放行图文

**不纳入 v1（明确排除）：**
- **Windows 代码签名**（用户决定：不签名，只靠文档引导绕过 SmartScreen / Smart App Control）
- SignPath / Azure 签名申请
- macOS Developer ID + 公证（$99/年；ad-hoc 已满足「一次放行即用」）
- Linux 桌面包（架构支持，但本期不出）

---

## 2. 目标架构

```
┌──────────────────────── DuckQuery.app / DuckQuery.exe（Tauri 壳）────────────────────────┐
│                                                                                          │
│   ① WebView（系统自带：mac WKWebView / win WebView2）                                      │
│      加载打包进去的前端静态文件（vite build 产物）                                          │
│      启动时 invoke('get_api_base') / 监听 'api-ready' 事件拿到后端地址                       │
│      axios.defaults.baseURL = http://127.0.0.1:<port>                                     │
│                         ▲                                                                 │
│                         │ 注入端口                                                         │
│   ② Rust 主进程         │                                                                  │
│      - 单实例锁（single-instance，最先注册）                                                │
│      - spawn sidecar，读 stdout 第一行拿端口                                                │
│      - env 注入 CONFIG_DIR / DUCKDB_DATA_DIR / APP_DATA_DIR / LITELLM_TELEMETRY=False       │
│      - 退出时 graceful shutdown + kill，app_handle.exit(0)                                  │
│                         │ spawn + env                                                      │
│                         ▼                                                                  │
│   ③ duckquery-api（PyInstaller onedir sidecar，内嵌 Python+FastAPI+DuckDB）                 │
│      bind(127.0.0.1, 0) → OS 分配空闲高位端口 → print(port) 到 stdout                       │
│      读写 per-user 数据目录：                                                               │
│        mac: ~/Library/Application Support/DuckQuery                                        │
│        win: %APPDATA%\DuckQuery                                                            │
│        内含 main.db / system.db / 上传文件 / 扩展 / 日志                                     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**关键不变量**：前端、Rust 壳、Python 后端三者完全本地、loopback 通信；除用户主动用 AI（调 LLM API）和手动检查更新外，无对外网络调用。

---

## 3. 锁定的技术决策

| 维度 | 决策 | 理由（研究结论） |
|---|---|---|
| **端口** | 后端 `socket.bind(("127.0.0.1", 0))` 让 OS 分配空闲端口（49152–65535），首行 print 到 stdout，Tauri 读取并注入前端 | 比固定大端口更彻底地零冲突；CSP 用 `connect-src http://127.0.0.1:*` |
| **绑定地址** | **仅 `127.0.0.1`**，绝不 `0.0.0.0` | loopback 不经过网卡，**不触发 Windows 防火墙弹窗**；0.0.0.0 会弹窗且暴露局域网 |
| **PyInstaller 模式** | **onedir + `upx=False`** | onefile 自解压到 %TEMP% 触发杀软打包器启发式 + Win 两进程僵尸问题；onedir + noupx 是免签名下压低误报的最强手段 |
| **python-magic** | **PyInstaller 中 exclude 掉** | `security.py` 已有 `MAGIC_AVAILABLE` 兜底，降级为按扩展名校验；消灭 libmagic 原生依赖（Windows 无 libmagic） |
| **Mac 免损坏** | CI 中 ad-hoc 签名 **app + sidecar + 内嵌 .dylib/.so**（`codesign -f --deep -s -`），`tauri.conf` 设 `signingIdentity:"-"` | **arm64 内核强制签名**：无签名直接 SIGKILL 显示「已损坏」无救；ad-hoc 后降级为「无法验证」走「隐私与安全性→仍要打开」 |
| **Mac sidecar 签名** | CI 里 `tauri build` **之前**手动签 sidecar | Tauri bug #11992：bundler 不签 externalBin；漏签 = arm64 全崩 |
| **Mac translocation** | DMG 内放「拖到 Applications」箭头 | 直接从 DMG 运行会进只读随机路径，sidecar 相对路径失效 |
| **Windows 安装器** | NSIS，`installMode: currentUser`（装到 %LOCALAPPDATA%，**免 UAC**） | WiX MSI 不支持 per-user，需管理员；NSIS per-user 体验最顺 |
| **Windows WebView2** | `webviewInstallMode: offlineInstaller`（+~127MB） | 默认 downloadBootstrapper 在离线/代理网络静默失败 |
| **Windows 签名** | **v1 不签名**，文档引导绕过 | 用户决定；onedir+noupx 压低误报，发布页图文教 SmartScreen / Smart App Control 绕过 |
| **DuckDB 扩展** | CI 预下载 excel/httpfs/mysql/postgres ×（osx_arm64/osx_amd64/windows_amd64）打进包，`extension_directory` 指向包内 | 首启离线可用；json/parquet 是 1.5 内建自动加载，无需单独文件 |
| **CI runner** | `macos-15`(arm64) / `macos-15-intel`(x86_64) / `windows-latest` | **`macos-13` 已于 2025-12 退役**；PyInstaller 不能交叉编译，各架构必须原生构建 |
| **内存上限** | 启动时按 `psutil.virtual_memory().total * 0.75` 封顶 8GB 动态设置 | 硬编码 8GB 在 8G 笔记本上会吃光内存卡死 |

---

## 4. 组件设计

### 4.1 后端 PyInstaller 冻结

**入口 `api/run.py`（新增）**：
```python
import sys, os, socket, multiprocessing

def _base_dir():
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    multiprocessing.freeze_support()  # Windows 必需
    base = _base_dir()
    # 只读资源（包内）
    os.environ.setdefault("DUCKDB_EXTENSION_DIRECTORY", os.path.join(base, "extensions"))
    os.environ.setdefault("PROMPTS_DIR", os.path.join(base, "prompts"))
    # 可写目录由 Tauri 通过 env 注入（CONFIG_DIR / DUCKDB_DATA_DIR / APP_DATA_DIR）；
    # 若未注入（直接运行调试），回退到 get_user_data_dir()
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    print(port, flush=True)           # 第一行就是端口，供 Tauri 读取
    import uvicorn
    from main import app
    uvicorn.run(app, fd=sock.fileno(), log_level="info")
```

**`api/duckquery.spec`（新增，要点）**：
- `collect_all('litellm')`（数据文件 model_prices_and_context_window.json + tokenizer）
- `collect_submodules('pyarrow')`、`collect_submodules('starlette')`
- hiddenimports：`uvicorn.loops.auto / uvicorn.protocols.http.auto / uvicorn.lifespan.on`、`tiktoken_ext.openai_public`、`pydantic_core`、`psycopg2`、`multipart`、`python_calamine`
- datas：`('extensions','extensions')`、`('prompts','prompts')`、`('config','config')`（默认 app-config 模板）+ openpyxl/calamine 数据
- excludes：`magic`、`tkinter`、`matplotlib`、`PIL`、`IPython`、`jupyter`
- `EXE(exclude_binaries=True)` + `COLLECT(...)` → onedir；`upx=False`
- 每架构单独构建（`target_arch` 按 runner），**不**用 `--target-arch` 交叉编译

**体积预算**：onedir 未压缩约 300–450MB（pyarrow ~80 / litellm ~60 / duckdb ~30 / pandas+numpy ~60 …）；Tauri 压缩后安装包增量约 120–200MB。

### 4.2 去容器化代码改造（后端）

新增 `api/core/common/paths.py`（或并入 config_manager）：
```python
def get_user_data_dir() -> Path:
    home = Path(os.path.expanduser("~"))
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / "DuckQuery"
    if sys.platform.startswith("win"):
        return Path(os.getenv("APPDATA", home)) / "DuckQuery"
    return home / ".local" / "share" / "DuckQuery"
```

**逐点改造（已核实 file:line）**：

| 文件:行 | 现状 | 改为 |
|---|---|---|
| `config_manager.py:209-221` `__init__` else 分支 | `Path(__file__)....parent/'config'` | `get_user_data_dir()/'config'`（保留 `CONFIG_DIR` env 优先） |
| `config_manager.py:338-347` `_resolve_project_root` | 检测 `/app` + `__file__` 回退 | `if override: return Path(override)` 否则 `get_user_data_dir()`，删 `/app` 块 |
| `config_manager.py:76` | `duckdb_memory_limit="8GB"` | 启动按 `min(total*0.75, 8GB)`（加 `psutil`） |
| `config_manager.py:671` 模块级单例 | import 期实例化（在 Tauri 注入 env 前） | 保留，但**所有可写路径解析延迟到函数内**；Tauri 必须在 **spawn 前** 注入 env |
| `main.py:172-193` secret key | `os.path.join("data", ".secret_key")`（cwd 相对，文件名还不同） | 统一走 `get_secret_key_path()` |
| `encryption.py:75` | `config_dir/'secret.key'` | 同一 `get_secret_key_path()` |
| `crypto_utils.py:39-45` | `CONFIG_DIR` env 或 `__file__/config` /'secret.key' | 同一 `get_secret_key_path()` |
| `file_datasource_manager.py:255-260` | `Path(__file__)...'data'/'file_sources'` + mkdir | `get_user_data_dir()/'data'/'file_sources'` |
| `excel_import_manager.py:23-26` | **模块级** `PENDING_BASE_DIR.mkdir()`（冻结即崩） | 改为函数 `_get_pending_base_dir()` 懒 mkdir，路径 `get_user_data_dir()/temp_files/excel_pending` |
| `file_ingestion.py:193`、`chunked_upload.py:181-198`、`join_query.py:654-682,820` | `__file__` 相对 temp_files（5 处 + 探测循环） | 统一 `get_temp_dir()`，删探测循环 |
| `set_operations.py:587` | `f"/app/exports/{filename}"` | `os.path.join(str(config_manager.get_exports_dir()), filename)` |
| `llm_context.py:12` `_PROMPTS_DIR` | `__file__` 相对（只读资源） | 加 `sys._MEIPASS` shim，spec 里 `--add-data prompts` |
| `routers/server_files.py` | 依赖 `server_data_mounts` 挂载白名单 | 加 `ALLOW_ARBITRARY_LOCAL_PATHS=1`（Tauri 注入）跳过白名单；前端改用原生文件对话框 |
| `Dockerfile:56` CMD host | `0.0.0.0`（**保留** Docker 用） | 桌面走 `run.py` 固定 `127.0.0.1`，不改 Dockerfile |

**关键风险**：`secret.key` 三处不统一，迁移时必须保证都指向同一文件，否则已存连接密码解不开（main.py 当前甚至用 `.secret_key` 不同文件名）。`get_secret_key_path()` 统一返回 `get_user_data_dir()/'config'/'secret.key'`，并做一次性迁移（若旧 `data/.secret_key` 存在则搬过去）。

### 4.3 Tauri 壳

- **依赖**：`tauri@2`、`tauri-plugin-shell`、`tauri-plugin-single-instance`、`tauri-plugin-dialog`、`tauri-plugin-updater`、`tauri-plugin-log`
- **`tauri.conf.json`**：
  - `bundle.externalBin: ["binaries/duckquery-api"]`（基名；CI 按 target-triple 落文件）
  - onedir → externalBin 指向目录内可执行文件，整个 onedir 目录进 `bundle.resources`
  - `bundle.macOS.signingIdentity: "-"`
  - `bundle.windows`: NSIS `installMode: currentUser`、`webviewInstallMode: offlineInstaller`
  - CSP：`connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:*`
- **`capabilities/default.json`**：`shell:allow-execute` 允许 sidecar `binaries/duckquery-api`
- **Rust `lib.rs`**：single-instance（**最先注册**）→ spawn sidecar → 读 stdout 端口存 State + `emit('api-ready', base)` → `get_api_base` command → `RunEvent::WindowEvent::Destroyed` 时 graceful（`child.write(b"shutdown\n")`）+ `child.kill()` + `app_handle.exit(0)`
- **前端 `client.ts` / App 启动**：`invoke('get_api_base')` 为主、监听 `api-ready` 为辅（解决竞态），拿到后设 `axios.defaults.baseURL`；现有相对 `''` baseURL 保留为非 Tauri 回退
- **图标**：`npx tauri icon ./app-icon.png`（从现有 duckq-logo 转 1024² PNG）生成 icns/ico/png 集

### 4.4 macOS 分发

- **签名链**：CI 在 PyInstaller 后、tauri build 前：`codesign -f --deep -s - <sidecar onedir>`（含内嵌 .so/.dylib），app 由 tauri 用 `-` 签
- **首次放行文档（按系统版本分流）**：
  - macOS 15 Sequoia：尝试打开（被拦）→ 系统设置 → 隐私与安全性 → 滚到「安全性」→「仍要打开」→ 输入管理员密码（**右键打开在 15 已移除**）
  - macOS 13/14：右键 → 打开，或同上隐私设置路径
  - 注明：「仍要打开」按钮约 1 小时后消失，需重试打开再触发
- **DMG**：含拖到 /Applications 的箭头与说明（清除 translocation）

### 4.5 Windows 分发

- NSIS per-user（免 UAC，装到 %LOCALAPPDATA%）
- WebView2 offlineInstaller
- 后端 onedir + noupx，绑 127.0.0.1
- **应用数据只写 %APPDATA%**，绝不写 文档/桌面/图片（避开 Controlled Folder Access 静默拦截）
- **发布页文档**：
  - SmartScreen：「Windows 已保护你的电脑」→ 点「更多信息」→「仍要运行」（很多人误点「不运行」，需图文）
  - Smart App Control（新 Win11 默认开，**无「仍要运行」**）：Windows 安全中心 → 应用和浏览器控制 → Smart App Control → 关闭
- 每次发版后把后端 exe 提交 Microsoft Security Intelligence 误报申诉（可选 checklist）

### 4.6 CI/CD（`.github/workflows/release.yml`）

- 触发：`push tags: ['v*']`
- matrix：`macos-15`(aarch64-apple-darwin) / `macos-15-intel`(x86_64-apple-darwin) / `windows-latest`(x86_64-pc-windows-msvc)，`fail-fast: false`
- 每 job：setup-python(架构对应) → `pip install -r api/requirements.txt pyinstaller psutil` → PyInstaller → 重命名 sidecar 为 target-triple 名 → **(mac) ad-hoc codesign sidecar** → setup-node + `npm ci` + `npm run build` → Rust toolchain + `Swatinem/rust-cache` → `tauri-apps/tauri-action@v0`（同 tag，首 job 建 draft release，其余追加资产）
- 签名 secrets 全部可选：缺失时 mac 走 `APPLE_SIGNING_IDENTITY=-`（ad-hoc），Windows 直接不签，**构建照样成功**
- DuckDB 扩展预下载步骤（PyInstaller 前，pin v1.5.3）
- 暖缓存预计：mac dmg ~12–15min，win exe ~8–12min，并行
- **注**：`macos-15-intel` 计划 2027-08 EOL，届时 Intel 版需迁移策略（文档备注）

### 4.7 完整版附加项

| 项 | 设计 |
|---|---|
| **自动更新** | `tauri-plugin-updater`，源指向 GitHub Releases `latest.json`；payload 用 updater keypair 签名（`TAURI_PRIVATE_KEY`/`TAURI_KEY_PASSWORD` CI secret）；**手动「检查更新」**触发（非后台轮询，隐私友好）；公钥写入 tauri.conf |
| **版本单一源** | `tauri.conf.json version` 为唯一源，CI 注入到 package.json + Python `__version__`；要求 `CHANGELOG.md`（Keep a Changelog）；releaseBody 引用 |
| **首启 UX** | App.tsx 全屏 splash「正在启动后端…」直到收到 `api-ready` 或 `get_api_base` 返回非 0；之后 `/health` 轮询（500ms，30s 超时）；超时显示带「重试」的可操作错误 |
| **启动失败处理** | sidecar spawn 失败/ stderr → 原生 dialog 区分：端口（OS 分配已规避）/ 杀软拦截（提示加排除 + 给出 sidecar 路径）/ 缺 WebView2（指向下载页）；并写崩溃日志 |
| **崩溃日志** | uvicorn 写 `<user-data>/logs/backend-YYYY-MM-DD.log`（RotatingFileHandler 留 7 天）；Tauri 启动错误经 `tauri-plugin-log` 写同目录；About 菜单加「打开日志目录」 |
| **卸载/数据** | 卸载只删程序与包内资源，**保留**用户数据目录；Settings 加「重置所有数据」（确认后清）；README 写明 |
| **许可证** | CI `pip-licenses` 生成 `THIRD_PARTY_LICENSES.txt`（DuckDB MIT / PyInstaller GPL+bootloader 例外 / psycopg2-binary LGPL 动态链接合规 / pyarrow Apache 等）；About 显示 |
| **遥测** | spawn 前 env `LITELLM_TELEMETRY=False`；README 列明全部出网调用（仅用户触发的 LLM + 手动更新检查）；默认无遥测 |
| **wasm 排除** | Tauri 构建（`TAURI_ENV_TARGET_TRIPLE` 存在）时把 `@duckdb/duckdb-wasm` 从 rollup external/optimizeDeps.exclude 剔除，避免 ~10MB wasm 进桌面包；`IS_DEMO` 在 `window.__TAURI__` 存在时强制 false |
| **原生文件对话框** | `tauri-plugin-dialog` 暴露 `open_file_dialog` command；前端检测 Tauri 上下文，把「浏览服务器目录」换成「打开文件…」，解析的绝对路径直接 POST `/api/server-files/import` |
| **大文件** | v1 支持上限建议单文件 2GB（WebView 实际限制）；前端上传前校验大小；后端 `ChunkUploadRequest` 校验 file_size；超内存上限时警告 |

---

## 5. 首次启动时序

```
用户双击 → Tauri 主进程
  → single-instance 检查（已有实例则聚焦并退出）
  → 计算 app_data_dir，确保目录存在，首启 seed 默认 app-config.json
  → env 注入（CONFIG_DIR / DUCKDB_DATA_DIR / APP_DATA_DIR / LITELLM_TELEMETRY=False）
  → spawn sidecar（onedir 内 duckquery-api）
       ↳ 后端 bind(127.0.0.1,0) → print(port) → 加载扩展(包内,离线) → uvicorn 起
  → Tauri 读 stdout 端口 → State + emit('api-ready')
  → WebView 加载前端 → splash → 收到端口 → /health 轮询 OK → 渲染主界面
关闭窗口 → graceful shutdown(stdin) + kill + app_handle.exit(0)
```

---

## 6. 成功判据（验收）

在**未装过 Docker/Python/Node** 的干净机器上：

**通用**
1. 双击安装 → 首次一次系统放行 → 启动成功
2. 上传 CSV/Excel 查询 ✅；连 MySQL 跨源 JOIN ✅；AI 问数 ✅
3. 关闭应用，后端进程随之退出（无僵尸 Python 进程）
4. 重启后数据仍在（per-user 目录持久化）
5. 断网首启：本地查询与扩展可用（扩展已离线预置）

**macOS（arm64 + Intel 各一台）**
6. 不出现「已损坏」死路；走「隐私与安全性→仍要打开」一次后正常
7. 从 DMG 拖到 Applications 后无 translocation 路径问题

**Windows**
8. SmartScreen「仍要运行」一次后可装；绑定 127.0.0.1 **不弹防火墙**
9. onedir+noupx 后端未被 Defender 默认设置隔离（抽样验证）

**自动更新**
10. 「检查更新」能发现新版本并完成更新（签名校验通过）

---

## 7. 风险与开放问题

| 风险 | 缓解 |
|---|---|
| Tauri #11992 漏签 sidecar → arm64 崩 | CI 显式 `codesign --deep` sidecar，加 arm64 真机冒烟 |
| 部分新 Win11 Smart App Control 硬拦截 | 文档专章引导关闭 SAC；告知这是免签名取舍 |
| litellm `collect_all` 体积大（+30–60MB）| 可后续改 `collect_submodules` + 仅 openai/anthropic provider 精简 |
| onedir + externalBin 路径映射 | externalBin 指向 onedir 内可执行文件，整目录进 resources（需打包后验证路径解析） |
| `macos-15-intel` 2027-08 EOL | 文档备注；届时可只留 arm64（Rosetta 兼容）或自托管 runner |
| 大文件/内存 在低配机失败 | 内存自适应 + 上传前大小校验 + 超限警告 |

---

## 8. 工作分解与估算（~9–12 有效工作日，完整版）

1. **后端去容器化 + secret.key 统一 + 内存自适应**（~2d）— 改造 §4.2，回归现有 pytest
2. **PyInstaller 冻结 + 扩展离线预置 + 去 magic**（~2d）— run.py/spec，三平台各自冒烟
3. **Tauri 壳 + sidecar 生命周期 + 端口注入 + 原生文件对话框 + 图标**（~2d）
4. **首启门 + 启动失败提示 + 崩溃日志 + 遥测关 + wasm 排除**（~1.5d）
5. **自动更新 + 版本单一源 + CHANGELOG + 许可证清单**（~1.5d）
6. **三平台 CI + Release（含 ad-hoc 签名步骤）**（~1.5d）
7. **README Mac/Win 放行图文 + 验收冒烟（三台机器）**（~1d）

> 阶段 1–2 可先各自用 pytest / 本地 `pyinstaller` 冒烟验证；阶段 3 起需在三平台真机/CI 验证。

---

## 9. 附录：受影响文件清单（新增/修改）

**新增**：`api/run.py`、`api/duckquery.spec`、`api/core/common/paths.py`、`src-tauri/*`（Cargo.toml、tauri.conf.json、capabilities、lib.rs、icons、Entitlements 可选）、`.github/workflows/release.yml`、`CHANGELOG.md`、`THIRD_PARTY_LICENSES.txt`（CI 生成）

**修改（后端）**：`config_manager.py`、`main.py`、`core/security/encryption.py`、`core/foundation/crypto_utils.py`、`core/data/file_datasource_manager.py`、`core/data/excel_import_manager.py`、`core/services/llm_context.py`、`routers/file_ingestion.py`、`routers/chunked_upload.py`、`routers/join_query.py`、`routers/set_operations.py`、`routers/server_files.py`、`api/requirements.txt`(+psutil)

**修改（前端）**：`src/api/client.ts`、`App.tsx`（splash/启动门）、上传与「浏览服务器目录」相关组件、`vite.config.*`（Tauri 时排除 wasm）、`src/demo/isDemo.ts`
