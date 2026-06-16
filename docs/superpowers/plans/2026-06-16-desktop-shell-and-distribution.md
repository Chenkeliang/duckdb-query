# Plan B — DuckQuery Tauri 壳与三平台分发 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Tauri v2 壳把 Plan A 的 `duckquery-api` 冻结后端包成三个原生安装包(Win x64 / macOS arm64 / macOS Intel),非技术用户首次一次系统放行即可使用;含完整版 UX(首启门、启动失败提示、崩溃日志、自动更新、原生文件对话框)与三平台 CI。

**Architecture:** Tauri v2 壳加载 vite 静态前端到系统 WebView,作为 sidecar 拉起 Plan A 的 onedir 后端,读 stdout 拿 OS 分配的 loopback 端口并注入前端;退出时杀后端。macOS 用 CI 内 ad-hoc 签名链规避"文件已损坏";Windows 用 NSIS per-user + WebView2 离线 + onedir(免签名下压低杀软误报)。

**Tech Stack:** Tauri v2 / Rust / `tauri-plugin-{shell,single-instance,dialog,updater,log}` / React+Vite(现有)/ tauri-action@v0 / GitHub Actions(macos-15 / macos-15-intel / windows-latest)。

**前置依赖:** **Plan A 必须先完成**(`api/run.py`、`api/duckquery.spec`、`api/scripts/fetch_duckdb_extensions.py`、`api/core/common/paths.py` 就绪,`duckquery-api` onedir 能离线起、`/health` 通)。

**约束(继承 spec):** Windows v1 不签名(文档引导);macOS ad-hoc 签名(免费、arm64 必须);后端只绑 `127.0.0.1`;提交署名 `Chen`,**无任何 AI / Co-Authored-By trailer**;**不推远程**,等用户确认。

**关键环境前提(实现者确认):**
- 前端在 `frontend/`,`npm run build` 输出 `frontend/dist`,dev server 默认 `http://localhost:5173`。
- 需安装 Rust stable + 平台 WebView 依赖(mac 自带;Win 需 WebView2,见 Task 10)。
- 自动更新需要一对 updater 密钥(Task 13 生成,私钥+密码由用户存入 GitHub Secrets)。

---

### Task 1: Scaffold Tauri v2（壳工程骨架）

**Files:**
- Create: `frontend/src-tauri/Cargo.toml`、`frontend/src-tauri/tauri.conf.json`、`frontend/src-tauri/src/main.rs`、`frontend/src-tauri/src/lib.rs`、`frontend/src-tauri/build.rs`、`frontend/src-tauri/capabilities/default.json`
- Modify: `frontend/package.json`（加 `@tauri-apps/api`、`@tauri-apps/cli`、`tauri` script）

- [ ] **Step 1: 安装 Tauri CLI 并初始化骨架**

```bash
cd frontend && npm i -D @tauri-apps/cli@^2 && npm i @tauri-apps/api@^2
npx tauri init --ci \
  --app-name DuckQuery \
  --window-title DuckQuery \
  --frontend-dist ../dist \
  --dev-url http://localhost:5173 \
  --before-dev-command "npm run dev" \
  --before-build-command "npm run build"
```
Expected: 生成 `frontend/src-tauri/`。`package.json` 加 `"tauri": "tauri"` script。

- [ ] **Step 2: 设定 identifier / 版本 / 产品名**

编辑 `frontend/src-tauri/tauri.conf.json` 顶层:
```json
{
  "productName": "DuckQuery",
  "version": "0.0.2",
  "identifier": "com.chenkeliang.duckquery",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  }
}
```

- [ ] **Step 3: 生成图标**

```bash
cd frontend
# 先把 src/assets/duckq-logo.svg 转 1024x1024 PNG 存为 app-icon.png(可用任意工具/在线)
npx tauri icon ./app-icon.png
```
Expected: `src-tauri/icons/` 下生成 icns/ico/png 全套。

- [ ] **Step 4: 验证空壳能起**

Run: `cd frontend && npm run tauri dev`
Expected: 弹出原生窗口加载现有前端(此时还没接后端,API 会报错,正常);Ctrl-C 关闭。

- [ ] **Step 5: 提交**

```bash
git add frontend/src-tauri frontend/package.json frontend/package-lock.json
git commit -m "feat(tauri): scaffold Tauri v2 shell for DuckQuery desktop"
```

---

### Task 2: 后端 CORS 放行 Tauri webview 源

**Files:**
- Modify: `api/core/common/config_manager.py:185-186`（`cors_origins` 默认值）
- Test: `api/tests/test_cors_tauri_origin.py`

- [ ] **Step 1: 写失败测试**

```python
# api/tests/test_cors_tauri_origin.py
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _preflight(origin: str):
    return client.options(
        "/health",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        },
    )


def test_tauri_macos_origin_allowed():
    r = _preflight("tauri://localhost")
    assert r.headers.get("access-control-allow-origin") == "tauri://localhost"


def test_tauri_windows_origin_allowed():
    r = _preflight("http://tauri.localhost")
    assert r.headers.get("access-control-allow-origin") == "http://tauri.localhost"
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_cors_tauri_origin.py -q`
Expected: FAIL

- [ ] **Step 3: 写实现**

`config_manager.py:185-186` 把:
```python
        if self.cors_origins is None:
            self.cors_origins = ["http://localhost:3000", "http://localhost:5173"]
```
改为:
```python
        if self.cors_origins is None:
            self.cors_origins = [
                "http://localhost:3000",
                "http://localhost:5173",
                "tauri://localhost",        # macOS webview 源
                "http://tauri.localhost",   # Windows webview 源
            ]
```

- [ ] **Step 4: 运行,确认通过**

Run: `cd api && ../.venv/bin/python -m pytest tests/test_cors_tauri_origin.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add api/core/common/config_manager.py api/tests/test_cors_tauri_origin.py
git commit -m "feat(cors): allow Tauri webview origins (tauri://localhost, http://tauri.localhost)"
```

---

### Task 3: 前端 API base 注入 + 首启 splash/健康门

**Files:**
- Modify: `frontend/src/api/client.ts:11-15`
- Create: `frontend/src/desktop/apiBase.ts`、`frontend/src/desktop/apiBase.test.ts`
- Modify: 前端入口(`src/main.tsx` 或 `App.tsx`,加启动门)

- [ ] **Step 1: 写失败测试（vitest）**

```typescript
// frontend/src/desktop/apiBase.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveBaseUrl } from './apiBase';

describe('resolveBaseUrl', () => {
  beforeEach(() => { (window as any).__API_BASE__ = undefined; });

  it('uses injected __API_BASE__ when present (Tauri)', () => {
    (window as any).__API_BASE__ = 'http://127.0.0.1:51234';
    expect(resolveBaseUrl('')).toBe('http://127.0.0.1:51234');
  });

  it('falls back to provided env value when no injection (web/self-host)', () => {
    expect(resolveBaseUrl('https://api.example.com')).toBe('https://api.example.com');
  });

  it('returns empty (same-origin) when neither present', () => {
    expect(resolveBaseUrl('')).toBe('');
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd frontend && npx vitest run src/desktop/apiBase.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

```typescript
// frontend/src/desktop/apiBase.ts
/** 解析 axios baseURL：Tauri 注入的 window.__API_BASE__ 优先，否则回退现有逻辑。 */
export function resolveBaseUrl(envApiUrl: string): string {
  const injected = (window as any).__API_BASE__;
  if (typeof injected === 'string' && injected.startsWith('http')) return injected;
  return envApiUrl || '';
}
```

`client.ts:11-15` 改为:
```typescript
import { resolveBaseUrl } from '../desktop/apiBase';

const apiUrl = import.meta.env.VITE_API_URL || '';
const envBase = (apiUrl === '' || apiUrl.includes('localhost:8000') || apiUrl.includes('your-api-url-in-production'))
    ? ''
    : apiUrl;
export const baseURL = resolveBaseUrl(envBase);
```

前端入口加启动门(伪代码骨架,实现者并入现有 App):
```typescript
// 在 Tauri 环境下，先等 api-ready 再设 baseURL，再渲染主 UI
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { apiClient, uploadClient } from './api/client';

async function waitForBackend(): Promise<string | null> {
  if (!(window as any).__TAURI__) return null;            // 非 Tauri 直接放行
  try {
    const base = await invoke<string>('get_api_base');
    if (base && !base.endsWith(':0')) return base;
  } catch { /* 还没就绪 */ }
  return await new Promise((resolve) => {
    listen<string>('api-ready', (e) => resolve(e.payload));
  });
}
// 拿到后: (window as any).__API_BASE__ = base; apiClient.defaults.baseURL = base; uploadClient.defaults.baseURL = base;
// 然后 /health 轮询(500ms,30s 超时)通过再渲染；超时显示带"重试"的错误。
```

- [ ] **Step 4: 运行,确认通过**

Run: `cd frontend && npx vitest run src/desktop/apiBase.test.ts && npx tsc --noEmit`
Expected: PASS + 类型通过

- [ ] **Step 5: 提交**

```bash
git add frontend/src/desktop/apiBase.ts frontend/src/desktop/apiBase.test.ts frontend/src/api/client.ts frontend/src/main.tsx
git commit -m "feat(desktop): inject backend base URL and gate first-run on backend health"
```

---

### Task 4: 桌面构建排除 duckdb-wasm + IS_DEMO 守卫

**Files:**
- Modify: `frontend/vite.config.js`（Tauri 构建时 external 掉 wasm）
- Modify: `frontend/src/demo/isDemo.ts`（`window.__TAURI__` 存在时强制非 demo）
- Test: `frontend/src/demo/isDemo.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// frontend/src/demo/isDemo.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { computeIsDemo } from './isDemo';

describe('computeIsDemo', () => {
  afterEach(() => { (window as any).__TAURI__ = undefined; });

  it('is false in Tauri even if VITE_DEMO=true', () => {
    (window as any).__TAURI__ = {};
    expect(computeIsDemo('true')).toBe(false);
  });

  it('honors VITE_DEMO in browser', () => {
    expect(computeIsDemo('true')).toBe(true);
    expect(computeIsDemo(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `cd frontend && npx vitest run src/demo/isDemo.test.ts`
Expected: FAIL（`computeIsDemo` 不存在）

- [ ] **Step 3: 写实现**

`isDemo.ts` 重构为可测函数 + 保留导出常量:
```typescript
export function computeIsDemo(viteDemo: string | undefined): boolean {
  if ((window as any).__TAURI__) return false;   // 桌面永不走 wasm demo
  return viteDemo === 'true';
}
export const IS_DEMO = computeIsDemo(import.meta.env.VITE_DEMO);
```

`vite.config.js` 在 Tauri 构建(`process.env.TAURI_ENV_TARGET_TRIPLE` 存在)时排除 wasm。把 `build` 块改为:
```javascript
  build: {
    rollupOptions: {
      external: process.env.TAURI_ENV_TARGET_TRIPLE ? ['@duckdb/duckdb-wasm'] : [],
      output: { /* …现有 manualChunks 不变… */ },
    },
  },
```

- [ ] **Step 4: 运行,确认通过 + 体积抽查**

Run: `cd frontend && npx vitest run src/demo/isDemo.test.ts && TAURI_ENV_TARGET_TRIPLE=x86_64-apple-darwin npm run build`
Expected: PASS;构建产物 `dist/` 中不含 duckdb-wasm 的大 `.wasm` chunk。

- [ ] **Step 5: 提交**

```bash
git add frontend/vite.config.js frontend/src/demo/isDemo.ts frontend/src/demo/isDemo.test.ts
git commit -m "build(desktop): exclude duckdb-wasm from Tauri bundle, force IS_DEMO=false in Tauri"
```

---

### Task 5: sidecar 接入（externalBin + 资源 + 权限）

**Files:**
- Modify: `frontend/src-tauri/tauri.conf.json`（externalBin / resources / CSP / bundle）
- Modify: `frontend/src-tauri/capabilities/default.json`
- Create: `frontend/src-tauri/binaries/`（CI 落 sidecar;本地手动拷 Plan A 产物冒烟）

- [ ] **Step 1: 写 tauri.conf 的 bundle/security 段**

```json
{
  "app": {
    "windows": [{ "title": "DuckQuery", "width": 1280, "height": 800 }],
    "security": {
      "csp": {
        "default-src": "'self' ipc: http://ipc.localhost",
        "connect-src": "ipc: http://ipc.localhost http://127.0.0.1:*",
        "img-src": "'self' asset: http://asset.localhost data:",
        "style-src": "'unsafe-inline' 'self'",
        "script-src": "'self'"
      }
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "nsis"],
    "externalBin": ["binaries/duckquery-api"],
    "resources": ["binaries/duckquery-api/**"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```
> onedir：externalBin 指向目录内可执行文件,`resources` 把整个 onedir 目录纳入。CI 会把 Plan A 的 `dist/duckquery-api/` 落到 `binaries/duckquery-api-<triple>/`(见 Task 14)。

- [ ] **Step 2: 写 capabilities**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "shell:default",
    { "identifier": "shell:allow-execute", "allow": [{ "name": "binaries/duckquery-api", "sidecar": true }] }
  ]
}
```

- [ ] **Step 3: 本地放置 sidecar 冒烟**

```bash
cd frontend && mkdir -p src-tauri/binaries
# 把 Plan A 的本机产物拷成 target-triple 名(arm64 mac 示例)
cp -R ../api/dist/duckquery-api src-tauri/binaries/duckquery-api-aarch64-apple-darwin
```

- [ ] **Step 4: 验证**

Run: `cd frontend && npm run tauri dev`（下一个 Task 完成 lib.rs 后才会真正拉起后端;此步只验证配置不报 schema 错）
Expected: 配置校验通过,窗口能起。

- [ ] **Step 5: 提交（binaries 不入库）**

```bash
echo "frontend/src-tauri/binaries/" >> .gitignore
git add frontend/src-tauri/tauri.conf.json frontend/src-tauri/capabilities/default.json .gitignore
git commit -m "feat(tauri): wire duckquery-api sidecar (externalBin + resources + shell perm)"
```

---

### Task 6: Rust 生命周期（spawn + 读端口 + 退出杀进程）

**Files:**
- Modify: `frontend/src-tauri/src/lib.rs`
- Modify: `frontend/src-tauri/Cargo.toml`（加插件依赖）

- [ ] **Step 1: 加依赖**

```bash
cd frontend && npx tauri add shell && npx tauri add single-instance
```
确认 `Cargo.toml` 含 `tauri-plugin-shell = "2"`、`tauri-plugin-single-instance = "2"`。

- [ ] **Step 2: 写 lib.rs（研究已验证的完整模式)**

```rust
use std::sync::Mutex;
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

#[derive(Default)]
struct ApiPort(u16);

#[tauri::command]
fn get_api_base(state: tauri::State<Mutex<ApiPort>>) -> String {
    format!("http://127.0.0.1:{}", state.lock().unwrap().0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") { let _ = win.set_focus(); }
        }))
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(ApiPort::default()))
        .manage(Mutex::new(Option::<CommandChild>::None))
        .invoke_handler(tauri::generate_handler![get_api_base])
        .setup(|app| {
            let handle = app.handle().clone();
            let cmd = handle.shell().sidecar("duckquery-api").expect("sidecar missing");
            let (mut rx, child) = cmd.spawn().expect("failed to spawn sidecar");
            *handle.state::<Mutex<Option<CommandChild>>>().lock().unwrap() = Some(child);
            tauri::async_runtime::spawn(async move {
                let mut port_set = false;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            let line = String::from_utf8_lossy(&bytes);
                            if !port_set {
                                if let Ok(port) = line.trim().parse::<u16>() {
                                    *handle.state::<Mutex<ApiPort>>().lock().unwrap() = ApiPort(port);
                                    let _ = handle.emit("api-ready", format!("http://127.0.0.1:{}", port));
                                    port_set = true;
                                }
                            }
                        }
                        CommandEvent::Stderr(bytes) => eprintln!("sidecar: {}", String::from_utf8_lossy(&bytes)),
                        _ => {}
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri app")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } | RunEvent::WindowEvent { event: tauri::WindowEvent::Destroyed, .. } = event {
                let st = app_handle.state::<Mutex<Option<CommandChild>>>();
                if let Ok(mut g) = st.lock() {
                    if let Some(mut child) = g.take() {
                        let _ = child.write(b"shutdown\n"); // 优雅(应对 Win 两进程)
                        let _ = child.kill();
                    }
                }
            }
        });
}
```
> `main.rs` 调 `app_lib::run()`（init 已生成）。

- [ ] **Step 3: 验证（关键:拉起后端 + 查询 + 退出无僵尸)**

```bash
cd frontend && npm run tauri dev
```
Expected: 窗口起来后短暂 splash → 主界面;能上传 CSV 查询、连库 JOIN、AI 问数。**关闭窗口后** `ps aux | grep duckquery-api` 应无残留进程。

- [ ] **Step 4: 提交**

```bash
git add frontend/src-tauri/src/lib.rs frontend/src-tauri/Cargo.toml frontend/src-tauri/Cargo.lock
git commit -m "feat(tauri): spawn sidecar, read OS-assigned port, kill on exit (no zombie)"
```

---

### Task 7: 后端启动失败的原生提示

**Files:**
- Modify: `frontend/src-tauri/src/lib.rs`（spawn 失败 / 超时 → dialog）
- Modify: `frontend/src-tauri/Cargo.toml`、`capabilities/default.json`（dialog 插件）

- [ ] **Step 1: 加 dialog 插件**

```bash
cd frontend && npx tauri add dialog
```

- [ ] **Step 2: 写实现**

在 `setup` 里:① `cmd.spawn()` 改为匹配 `Err` 时弹原生 dialog「后端被安全软件拦截?请把 <sidecar 路径> 加入杀软白名单」并记录;② 起一个 watchdog:若 N 秒(如 30s)内未收到端口,弹 dialog 提示启动超时并给出日志目录路径。用 `tauri_plugin_dialog::DialogExt` 的 `message()`/`blocking_message()`。前端侧 Task 3 的 `/health` 轮询超时也显示「重试」。

- [ ] **Step 3: 验证（强制失败)**

```bash
cd frontend && mv src-tauri/binaries/duckquery-api-aarch64-apple-darwin{,.bak} && npm run tauri dev
```
Expected: 弹出"后端启动失败/被拦截"的原生提示而非白屏;恢复:`mv ...bak 回去`。

- [ ] **Step 4: 提交**

```bash
git add frontend/src-tauri/src/lib.rs frontend/src-tauri/Cargo.toml frontend/src-tauri/capabilities/default.json
git commit -m "feat(tauri): native dialog on backend spawn failure / startup timeout"
```

---

### Task 8: 崩溃/支持日志落盘 + 打开日志目录

**Files:**
- Modify: `frontend/src-tauri/src/lib.rs`、`Cargo.toml`（`tauri-plugin-log`)
- Modify: `api/run.py`（uvicorn 文件日志到用户目录）

- [ ] **Step 1: 加 log 插件 + 后端文件日志**

```bash
cd frontend && npx tauri add log
```
`api/run.py` 在 `main()` 起 uvicorn 前,配置 RotatingFileHandler 写到 `get_user_data_dir()/logs/backend-YYYY-MM-DD.log`(保留 7 天),uvicorn `log_config` 指向它;Tauri 侧 `tauri_plugin_log` 输出到同目录。

- [ ] **Step 2: 加「打开日志目录」入口**

在前端 About/Help 加一个按钮,调一个 `#[tauri::command] open_logs_dir` 用 `tauri_plugin_shell` 或 `opener` 打开 `app_data_dir/logs`。

- [ ] **Step 3: 验证**

启动后到 `~/Library/Application Support/DuckQuery/logs/` 确认有 `backend-*.log`;点 About 的「打开日志目录」能在 Finder 打开。

- [ ] **Step 4: 提交**

```bash
git add frontend/src-tauri api/run.py
git commit -m "feat(desktop): persist backend+shell logs to user data dir, add open-logs action"
```

---

### Task 9: 原生文件对话框替代「服务器目录浏览」

**Files:**
- Modify: 前端上传/「浏览服务器目录」相关组件(检测 Tauri 上下文切换为「打开文件…」)
- 依赖 Plan A Task 9 的后端 `ALLOW_ARBITRARY_LOCAL_PATHS`(run.py 已默认开)

- [ ] **Step 1: 写实现**

前端在 `window.__TAURI__` 存在时,把「浏览服务器目录」按钮替换为「打开本地文件…」,调:
```typescript
import { open } from '@tauri-apps/plugin-dialog';
const selected = await open({ multiple: true, filters: [{ name: 'Data', extensions: ['csv','xlsx','xls','json','parquet'] }] });
// selected 为绝对路径数组 → 逐个 POST /api/server-files/import { path }
```

- [ ] **Step 2: 验证**

`npm run tauri dev` → 点「打开本地文件…」选一个宿主机任意路径的 CSV → 成功导入并可查询(走 Plan A 的 ALLOW_ARBITRARY_LOCAL_PATHS 分支)。

- [ ] **Step 3: 提交**

```bash
git add frontend/src
git commit -m "feat(desktop): native file dialog replaces server-dir browse in Tauri context"
```

---

### Task 10: Windows 打包配置（NSIS per-user + WebView2 离线）

**Files:**
- Modify: `frontend/src-tauri/tauri.conf.json`（`bundle.windows`）

- [ ] **Step 1: 写配置**

```json
{
  "bundle": {
    "windows": {
      "nsis": { "installMode": "currentUser" },
      "webviewInstallMode": { "type": "offlineInstaller" }
    }
  }
}
```

- [ ] **Step 2: 验证（Windows 机器或 CI 产物）**

在干净 Windows 上装 NSIS 产物:**无 UAC 提权**,装到 `%LOCALAPPDATA%`;离线也能装(WebView2 离线内置);启动后绑 127.0.0.1**不弹防火墙**。

- [ ] **Step 3: 提交**

```bash
git add frontend/src-tauri/tauri.conf.json
git commit -m "feat(win): NSIS per-user install + offline WebView2 bootstrapper"
```

---

### Task 11: macOS ad-hoc 签名链（免「文件已损坏」）

**Files:**
- Modify: `frontend/src-tauri/tauri.conf.json`（`bundle.macOS.signingIdentity`）
- Create: `frontend/src-tauri/Entitlements.plist`（为未来公证预留）

- [ ] **Step 1: 写配置**

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "-",
      "minimumSystemVersion": "13.0",
      "dmg": { "appPosition": { "x": 180, "y": 170 }, "applicationFolderPosition": { "x": 480, "y": 170 } }
    }
  }
}
```
> DMG 的两个 position 让「应用图标 → Applications 文件夹」并排,形成拖拽引导(清除 translocation)。

`Entitlements.plist`(为将来 Developer ID 公证预留;ad-hoc 阶段非必需):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.allow-jit</key><true/>
</dict></plist>
```

- [ ] **Step 2: 验证（真机 / CI 后)**

> sidecar 的 ad-hoc 签名在 CI 里做(Task 14 的 `codesign -f --deep -s -` 步骤,在 `tauri build` 之前)。本任务只定壳侧配置。真机验收(Task 16)确认下载 dmg 后**不报「已损坏」**,走「隐私与安全性→仍要打开」一次即可。

- [ ] **Step 3: 提交**

```bash
git add frontend/src-tauri/tauri.conf.json frontend/src-tauri/Entitlements.plist
git commit -m "feat(mac): ad-hoc signing identity + DMG drag layout + entitlements for future notarization"
```

---

### Task 12: 版本单一源 + CHANGELOG

**Files:**
- Create: `CHANGELOG.md`
- Create: `scripts/sync-version.mjs`（从 tauri.conf.json 同步到 package.json + python `__version__`)

- [ ] **Step 1: 写 CHANGELOG 与同步脚本**

`CHANGELOG.md`(Keep a Changelog 格式,首条 `## [0.0.2] - 桌面版`)。`scripts/sync-version.mjs` 读 `frontend/src-tauri/tauri.conf.json` 的 `version`,写入 `frontend/package.json` 的 `version` 和 `api/__version__.py`(新增 `__version__ = "x.y.z"`,被 main.py 引用展示)。

- [ ] **Step 2: 验证**

Run: `node scripts/sync-version.mjs`
Expected: 三处版本一致。

- [ ] **Step 3: 提交**

```bash
git add CHANGELOG.md scripts/sync-version.mjs api/__version__.py frontend/package.json
git commit -m "build: single-source version from tauri.conf + CHANGELOG"
```

---

### Task 13: 自动更新（Tauri updater，手动检查）

**Files:**
- Modify: `frontend/src-tauri/tauri.conf.json`（updater plugin + pubkey + endpoints）
- Modify: `frontend/src-tauri/Cargo.toml`、`capabilities/default.json`
- Modify: 前端 About 加「检查更新」按钮

- [ ] **Step 1: 生成 updater 密钥**

```bash
cd frontend && npx tauri signer generate -w ~/.tauri/duckquery-updater.key
```
> **私钥 + 密码由用户保管**,存入 GitHub Secrets `TAURI_PRIVATE_KEY` / `TAURI_KEY_PASSWORD`(用户在仓库 Settings → Secrets 添加,或授权我用 `gh secret set`)。**公钥**写入 tauri.conf。

- [ ] **Step 2: 配置 + UI**

```bash
cd frontend && npx tauri add updater
```
`tauri.conf.json` `plugins.updater`:
```json
{
  "plugins": {
    "updater": {
      "pubkey": "<上一步生成的公钥>",
      "endpoints": ["https://github.com/Chenkeliang/duckdb-query/releases/latest/download/latest.json"]
    }
  }
}
```
前端 About 加「检查更新」按钮,调 `@tauri-apps/plugin-updater` 的 `check()`,有更新则提示并 `downloadAndInstall()`(**手动触发,不后台轮询**)。

- [ ] **Step 3: 验证（基本可编译 + UI 出现）**

`npm run tauri dev` → About 能看到「检查更新」按钮(端到端更新流程在有两个 Release 后才能完整验)。

- [ ] **Step 4: 提交**

```bash
git add frontend/src-tauri frontend/src
git commit -m "feat(updater): manual check-for-updates via Tauri updater (signed payloads)"
```

---

### Task 14: 三平台 CI / Release（含 ad-hoc 签名）

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: 写 workflow（研究已验证）**

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    permissions: { contents: write }
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-15
            target: aarch64-apple-darwin
            py_arch: arm64
            duck_platform: osx_arm64
          - platform: macos-15-intel
            target: x86_64-apple-darwin
            py_arch: x64
            duck_platform: osx_amd64
          - platform: windows-latest
            target: x86_64-pc-windows-msvc
            py_arch: x64
            duck_platform: windows_amd64
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with: { python-version: '3.12', architecture: ${{ matrix.py_arch }}, cache: pip }

      - name: Build backend (PyInstaller onedir)
        run: |
          pip install -r api/requirements.txt pyinstaller
          python api/scripts/fetch_duckdb_extensions.py ${{ matrix.duck_platform }}
          cd api && pyinstaller duckquery.spec --noconfirm

      - name: Stage sidecar (macOS)
        if: runner.os == 'macOS'
        run: |
          mkdir -p frontend/src-tauri/binaries
          cp -R api/dist/duckquery-api frontend/src-tauri/binaries/duckquery-api-${{ matrix.target }}
          # 关键: ad-hoc 签名整个 onedir(含内嵌 .so/.dylib),tauri build 之前
          codesign -f --deep -s - frontend/src-tauri/binaries/duckquery-api-${{ matrix.target }}/duckquery-api

      - name: Stage sidecar (Windows)
        if: runner.os == 'Windows'
        run: |
          mkdir frontend\src-tauri\binaries
          xcopy /E /I api\dist\duckquery-api frontend\src-tauri\binaries\duckquery-api-${{ matrix.target }}
        shell: cmd

      - uses: actions/setup-node@v4
        with: { node-version: lts/*, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: cd frontend && npm ci

      - uses: dtolnay/rust-toolchain@stable
        with: { targets: ${{ matrix.target }} }
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: './frontend/src-tauri -> target' }

      - name: Build & release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
        with:
          projectPath: frontend
          tagName: v__VERSION__
          releaseName: 'DuckQuery v__VERSION__'
          releaseDraft: true
          args: --target ${{ matrix.target }}
```
> Windows v1 不签名(无 cert secret),onedir+noupx 已在 Plan A spec 落实。mac 缺 Apple cert → tauri 用 `signingIdentity:"-"` ad-hoc。三个 job 同 tag,首个建 draft release,其余追加资产。

- [ ] **Step 2: 验证（打 tag 触发)**

```bash
git tag v0.0.2-rc1 && git push origin v0.0.2-rc1   # 需用户授权推送
```
Expected: Actions 跑出 3 个产物(arm64 dmg / intel dmg / win nsis exe)到一个 draft Release。

- [ ] **Step 3: 提交**

```bash
git add .github/workflows/release.yml
git commit -m "ci: three-target Tauri release (macOS arm64/Intel + Windows) with ad-hoc mac signing"
```

---

### Task 15: 安装文档 + 第三方许可证

**Files:**
- Modify: `README.md`、`README_en.md`（新增「桌面版安装」章节）
- Modify: `.github/workflows/release.yml`（加 `pip-licenses` 生成 `THIRD_PARTY_LICENSES.txt` 并随 Release 发布）

- [ ] **Step 1: 写安装章节**

README 加「桌面版安装」:
- **macOS**:下载对应芯片的 dmg → 拖到 Applications → 首次打开被拦 → 系统设置 → 隐私与安全性 → 「仍要打开」→ 输入密码(注明 15 已无右键打开;按钮约 1 小时消失需重试)。
- **Windows**:下载 setup.exe → SmartScreen「更多信息」→「仍要运行」;若新 Win11 被 Smart App Control 硬拦 → Windows 安全中心 → 应用和浏览器控制 → Smart App Control → 关闭。
- 截图占位(真机截图在 Task 16 验收时补)。

- [ ] **Step 2: CI 生成许可证清单**

`release.yml` 加一步:`pip install pip-licenses && pip-licenses --format=plain-vertical --output-file THIRD_PARTY_LICENSES.txt`,并把该文件作为 Release 资产。

- [ ] **Step 3: 提交**

```bash
git add README.md README_en.md .github/workflows/release.yml
git commit -m "docs: desktop install guide (macOS Privacy-allow / Windows SmartScreen) + third-party licenses"
```

---

### Task 16: 三机验收冒烟（用户提供测试机）

> 需要干净的 Mac(arm64 + Intel)与 Windows,**由用户执行或协助**(我无法在真机装)。

- [ ] **Step 1: macOS arm64 + Intel**：下载对应 dmg → 拖到 Applications → 「仍要打开」一次 → 启动。**不出现「已损坏」**。
- [ ] **Step 2: 功能**：上传 CSV/Excel 查询 ✅;连 MySQL 跨源 JOIN ✅;AI 问数 ✅;原生「打开本地文件」任意路径 ✅。
- [ ] **Step 3: 进程**：关闭应用 → 无残留 `duckquery-api` 进程。
- [ ] **Step 4: 持久化 + 离线**：重启后数据在;断网首启本地查询与扩展可用。
- [ ] **Step 5: Windows**：SmartScreen「仍要运行」→ 免 UAC 装到 %LOCALAPPDATA% → 绑 127.0.0.1 不弹防火墙 → 上述功能全通。
- [ ] **Step 6: 补真机截图进 README,标记 Plan B 完成。**

---

## 自检（Self-Review）

**Spec 覆盖**(对照 spec §4.3–§4.7 + 完整性 gap):
- Tauri 壳 / externalBin / 单实例 / 端口注入 / CORS+CSP / 图标 → Task 1,2,3,5,6 ✅
- 首启门 / 启动失败提示 / 崩溃日志 / 原生文件对话框 / wasm 排除 / 遥测 → Task 3,7,8,9,4(遥测在 Plan A run.py)✅
- macOS ad-hoc 免损坏 + translocation + Sequoia 文档 → Task 11,15 ✅
- Windows NSIS per-user + WebView2 离线 + 127.0.0.1 + SmartScreen/SAC 文档 → Task 10,15 ✅
- 自动更新 + 版本单一源 + CHANGELOG + 许可证 → Task 12,13,15 ✅
- 三平台 CI(macos-15 / macos-15-intel / windows + ad-hoc 签名步骤)→ Task 14 ✅
- 验收判据 → Task 16 ✅

**占位符扫描**:Rust/YAML/JSON 给了完整代码;少量"实现者并入现有组件"处(Task 3 启动门、Task 9 文件对话框 UI)是与现网 UI 的集成点,非逻辑占位。截图占位是真机产物,Task 16 补。

**类型/命名一致**:`get_api_base` / `api-ready` 事件 / `duckquery-api` sidecar 基名 / `__API_BASE__` / `resolveBaseUrl` / `computeIsDemo` / `ALLOW_ARBITRARY_LOCAL_PATHS`(承接 Plan A)在各 Task 间一致。

**跨计划依赖**:Task 5/14 依赖 Plan A 的 `dist/duckquery-api`、`duckquery.spec`、`fetch_duckdb_extensions.py`;Task 9 依赖 Plan A 的 `ALLOW_ARBITRARY_LOCAL_PATHS`;Task 3 依赖 Plan A 的 `/health`。

**需用户参与的非代码项**:Task 13 updater 密钥存 Secrets;Task 14 推 tag(需授权推送);Task 16 真机验收 + 截图。
