# DuckQuery 项目 AGENT 规则（v4.0）

> **更新时间**：2026-07-09（v3.3 → v4.0：补齐桌面版 / MCP / AI / 图表四大块，消除重复，标注规范与现实的已知落差）  
> **适用范围**：全项目（前端、后端、MCP、测试、文档）  
> **权威性**：本文件为唯一 AGENT 约束来源。  
> **契约真相表**：`frontend/src/api/*` 在用路径、部署入口与字段语义见 [`docs/API_CONTRACT_FE_BE.md`](docs/API_CONTRACT_FE_BE.md)（与 §8 响应格式互补）。**改 API 时须先更新该表，再改后端与 `frontend/src/api/*`。**  
> **调用链路**：入湖 / 查询 / 元数据 / 异步的全局调用图见 [`docs/ARCHITECTURE_CALL_MAP.md`](docs/ARCHITECTURE_CALL_MAP.md)；改相关逻辑前先对照该文档。  
> **文档索引**：[`docs/README.md`](docs/README.md)（guide 用户手册 / specs 规格与提案 / history 过程存档）。

---

## 目录
1. 项目全貌（形态、技术栈、入口）  
2. 目录结构与关键文件  
3. 运行、测试与打包  
4. 前端开发规范  
5. UI / 样式规范（**禁止自定义**）  
6. 查询结果区（DataGrid + 图表）  
7. 后端开发规范  
8. API 与响应规范  
9. MCP Server 规范  
10. 测试规范  
11. 质量检查清单  
12. 代理行为约束

---

## 1. 项目全貌

### 双形态

| 形态 | 组成 | 入口 |
|------|------|------|
| **Docker / 服务器** | 前端(nginx) + 后端(uvicorn) 分离容器 | `api/main.py`；`./quick-start.sh` |
| **桌面版（已发布 1.0.x）** | Tauri 2 壳 + PyInstaller 冻结后端 sidecar；带 GitHub Releases 自动更新 | `api/run.py`（sidecar：绑 127.0.0.1 随机端口，写 `runtime.json` 供壳与 MCP 发现）|

### 技术栈

| 层级 | 技术 | 版本要点 |
|------|------|----------|
| 前端框架 | React 18 + Vite 7 + TypeScript 5.9 | |
| UI 组件 | shadcn/ui + **Tailwind CSS v4** | v4 与 v3 语法有破坏性差异，写类名以 v4 为准 |
| 状态/数据 | TanStack Query 5.x + React Hooks | |
| 表格/图表 | TanStack Table 8（DataGrid）+ ChartView（结果区图表、点击下钻） | |
| 桌面壳 | Tauri 2.x（`@tauri-apps/api` ^2） | `frontend/src-tauri/` |
| 后端框架 | FastAPI + Python（CI 3.11，本地 3.13） | |
| 数据库 | DuckDB 1.5.3（本地）+ MySQL/PostgreSQL/SQLite/DuckDB 文件（联邦 ATTACH） | |
| AI | OpenAI 兼容 LLM 接入；统一 **Agent Engine + 多 Profile**（`data_qa` / `generate_sql` / `repair_sql` / `explain_sql` / `suggest_chart`，`mode` 判别），端点 `POST /api/ai/agent/{stream,run}` | `api/routers/ai.py` + `core/services/ai_{agent,profiles}.py`，密钥 Fernet 加密 |
| MCP | 独立子包 `mcp/duckquery_mcp`（Python ≥3.10） | 见 §9 |
| 国际化 | react-i18next（zh / en 全量） | |
| 质量 | 自定义 pylint 插件（W9020-9023）+ 自定义 eslint 插件（见 §5 落差标注） | `lint-rules/` |

### 入口文件

| 入口 | 路径 | 说明 |
|------|------|------|
| 前端主入口 | `frontend/src/main.tsx` | React 应用入口 |
| 查询工作台 | `frontend/src/QueryWorkbenchPage.tsx` | 查询主页面 |
| 后端（开发/服务器） | `api/main.py` | FastAPI 应用入口 |
| 后端（桌面 sidecar） | `api/run.py` | PyInstaller 冻结入口：env 注入可写目录、随机端口、首行打印端口 |
| 桌面壳 | `frontend/src-tauri/` | `tauri.conf.json`、`Cargo.toml`、capabilities |

---

## 2. 目录结构与关键文件

```
duckdb-query/
├── api/                              # 后端 FastAPI
│   ├── main.py / run.py              # 双入口（服务器 / 桌面 sidecar）
│   ├── duckquery.spec                # PyInstaller 打包 spec
│   ├── core/
│   │   ├── common/                   # 通用（时区、配置、连接别名、异常处理器）
│   │   ├── data/                     # 文件导入、Excel
│   │   ├── database/                 # DuckDB 引擎、联邦 ATTACH/优化器、元数据管理
│   │   ├── foundation/               # 基础设施（crypto_utils: Fernet，供 AI 密钥）
│   │   ├── security/                 # encryption.py（Fernet 兼容读取路径）
│   │   └── services/                 # 透视/集合 SQL 生成、表元数据、AI 配置、Agent Engine + Profiles
│   ├── middleware/                   # 中间件
│   ├── routers/                      # 21 个路由（见下表）
│   ├── models/                       # Pydantic 模型
│   ├── services/                     # 顶层服务（datasource_aggregator 等，≠ core/services）
│   ├── utils/                        # response_helpers、safe_filename、encryption_utils
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── api/                      # TS API 模块 ⭐（barrel: index.ts，见 §4.2 落差）
│   │   ├── hooks/                    # 共享 Hooks（TanStack Query）⭐
│   │   ├── utils/                    # cacheInvalidation、sqlUtils、sqlLiteral ⭐
│   │   ├── Query/                    # SQLQuery / JoinQuery / PivotTable / SetOperations /
│   │   │                             # ResultPanel / DataGrid / Charts / DataSourcePanel /
│   │   │                             # AsyncTasks / QueryTabs
│   │   ├── DataSource/  Settings/  Extensions/  Layout/  components/ui/  i18n/
│   │   └── styles/tailwind.css
│   └── src-tauri/                    # Tauri 2 壳（binaries/ 放 PyInstaller sidecar）
├── mcp/                              # MCP Server 独立子包（见 §9）
│   └── duckquery_mcp/{server,client,config,safety}.py + tools/*
├── lint-rules/                       # 自定义 eslint + pylint 插件（含测试）
├── config/                           # app-config.example.jsonc
├── scripts/                          # 辅助脚本（数据生成、检查）
├── docs/                             # 索引见 docs/README.md（guide/specs/history 分区）
├── .github/                          # CI、PULL_REQUEST_TEMPLATE.md（大写）
└── docker-compose.yml / quick-start.sh
```

**api/routers/ 全量（21）**：`ai`、`async_tasks`、`chunked_upload`、`config_api`、`database_tables`、`datasources`、`duckdb_extensions`、`duckdb_query`、`file_ingestion`、`join_query`、`paste_data`、`pivot_query`、`query_cancel`、`query_export`、`query_sql_utils`、`server_files`、`set_operations`、`settings`、`sql_favorites`、`system_control`、`url_reader`。

**关键文件索引（精选）**

| 文件 | 用途 |
|------|------|
| `frontend/src/api/index.ts` | API barrel（`@/api`）；**新增模块必须在此导出** |
| `frontend/src/api/client.ts` | `apiClient`、`normalizeResponse`、错误归一化 |
| `frontend/src/api/aiApi.ts` / `extensionsApi.ts` / `queryExportApi.ts` / `engineCompatApi.ts` | AI / 扩展 / 结果导出 / 引擎兼容 API 模块（已入 barrel） |
| `frontend/src/utils/cacheInvalidation.ts` | 缓存失效工具（§4.5） |
| `frontend/src/utils/sqlLiteral.ts` | SQL 字符串字面量转义（`sqlStringLiteral`），**禁止再手写 replace** |
| `frontend/src/Query/SQLQuery/sqlDialect.ts` | **唯一** DuckDB 方言入口（勿用 `StandardSQL.spec.keywords`） |
| `frontend/src/components/SQLHighlight.tsx` | 只读 SQL 高亮 |
| `api/utils/response_helpers.py` | 统一响应 + `error_json_response`（错误主路径） |
| `api/utils/safe_filename.py` | `safe_filename_base`：用户可控文件名统一清洗（防穿越/注入） |
| `api/utils/encryption_utils.py` | 连接密码 XOR v2 加密（本机 `secret.key`，见 §7.6） |
| `api/core/common/timezone_utils.py` | 时区工具（§7.3） |
| `api/core/common/connection_alias.py` | `resolve_attach_databases_for_async` 等联邦别名解析 |
| `api/core/database/federated_optimizer.py` | 联邦下推优化器（半连接键下推、时间界建议） |
| `mcp/duckquery_mcp/safety.py` | `confirm_required` / `tool_allowed` / `is_write_sql`（§9） |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR 自检：契约 / lint / pytest（注意大写文件名） |

### 2.1 前后端契约与 PR 模板

| 资源 | 用途 |
|------|------|
| [`docs/API_CONTRACT_FE_BE.md`](docs/API_CONTRACT_FE_BE.md) | 端点、成功体、`data` 字段语义、前端消费入口；**与后端路由、§8.2 同源维护** |
| [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) | PR 勾选：是否改 API、是否已更新契约表、验证命令 |

---

## 3. 运行、测试与打包

统一使用**根 `.venv`**（本地 Python 3.13；CI 3.11）。

### 后端
```bash
cd api
../.venv/bin/python -m uvicorn main:app --reload
../.venv/bin/python -m pytest tests -q
# pre-commit 同款 pylint（注意：全项目扫描，不是只扫改动文件）
../.venv/bin/python -m pylint --rcfile=.pylintrc routers/ core/ models/ utils/ services/
```

### 前端
```bash
cd frontend
npm install
npm run dev
npm run lint          # --max-warnings 0
npx tsc --noEmit
npm run test          # vitest run（test:watch / test:coverage 亦可用）
npm run build
```

### MCP
```bash
cd mcp && ../.venv/bin/python -m pytest tests -q
```

### 桌面版打包（macOS 本机验证过的配方）
```bash
../.venv/bin/pip install -r api/requirements.txt   # 打包前必须同步 venv(漂移曾致 calamine 漏装、.xls 全挂而冒烟全绿)
cd api && ../.venv/bin/pyinstaller duckquery.spec --noconfirm --distpath dist --workpath build
rm -rf frontend/src-tauri/binaries/duckquery-api \
  && cp -R api/dist/duckquery-api frontend/src-tauri/binaries/duckquery-api
find frontend/src-tauri/binaries/duckquery-api \( -name '*.so' -o -name '*.dylib' \) \
  -exec codesign --force --timestamp=none --sign - {} +
codesign --force --timestamp=none --sign - frontend/src-tauri/binaries/duckquery-api/duckquery-api
cd frontend && npx tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'
# 产物: frontend/src-tauri/target/release/bundle/macos/DuckQuery.app
```
要点：sidecar 必须在 `tauri build` **之前** ad-hoc 签名（Tauri #11992：bundler 不签 externalBin，arm64 漏签直接 SIGKILL）；`createUpdaterArtifacts:false` 因 minisign 私钥仅在 CI。三平台正式发布走 `.github/workflows/release.yml`。

**改码 ≠ 生效**：桌面 App 是冻结二进制，改 `api/` 后必须重新打包；MCP 是常驻进程，改 `mcp/` 后必须重启/重连。验证行为前先核对进程启动时间与提交时间。

---

## 4. 前端开发规范

### 4.1 文件与命名
| 类型 | 规则 | 示例 |
|------|------|------|
| 组件 | PascalCase.tsx | `DataPasteCard.tsx` |
| Hook | camelCase.ts（use 前缀） | `useDuckDBTables.ts` |
| 工具 | camelCase.ts | `cacheInvalidation.ts` |
| 测试 | *.test.tsx / *.test.ts（同目录 `__tests__/`） | `useDuckDBTables.test.ts` |
| 常量 | UPPER_SNAKE_CASE | `DUCKDB_TABLES_QUERY_KEY` |

### 4.2 导入与 API 调用（原 §4.2 与 §7.2 合并）

**规则**
- 业务代码从 **`@/api`**（barrel `index.ts`）导入 API 函数；禁止 `@/api/xxxApi`、`@/api/client`、`@/api/types` 深路径。
- `frontend/src/api/*.ts` 内部模块间用相对路径（`./client`），**禁止**在 api 子模块内 `from '@/api'`（barrel 循环依赖）。
- **禁止**对本后端 `/api/...` 裸 `fetch` 或绕过 `apiClient` 的 axios（会绕开统一错误体、`normalizeResponse`、超时约定）。例外仅第三方 URL，且须注释「第三方」。
- **SSE streaming 例外（仅限 API 模块内）**：`POST` 流式端点（如 `/api/ai/agent/stream`）必须用浏览器 `fetch` + `ReadableStream` 读取（`EventSource` 只支持 `GET`，`apiClient`/axios 不给逐块流）。此裸 `fetch` **只允许写在 `frontend/src/api/*.ts`（如 `agentApi.ts` 的 `streamAgent`）内并封装为函数**；业务组件仍**禁止**裸 `fetch`，一律经 barrel 调 `streamAgent`/`runAgent` 等封装。
- 新增固定端点：先在 `frontend/src/api/` 建封装、**在 `index.ts` 导出**，业务侧从 `@/api` 导入。
- UI 组件从 `@/components/ui/*`；图标 `lucide-react`；TanStack Query `@tanstack/react-query`。

> ✅ 落差已收敛（2026-07-09）：`aiApi` / `engineCompatApi` / `extensionsApi` / `queryExportApi` 已补进 barrel，13 处深路径导入已全部迁回 `@/api`。业务代码现为零深路径。

```tsx
// ✅ import { executeDuckDBSQL, getDuckDBTables } from '@/api';
// ❌ import { getTables } from '@/api/tableApi';   ❌ fetch('/api/duckdb/tables')
```

### 4.2.1 SQL 编辑器（CodeMirror 6）

| 组件 | 路径 | 说明 |
|------|------|------|
| 可编辑 | `Query/SQLQuery/SQLEditor.tsx` | 工作台主 SQL 输入 |
| 只读预览 | `components/SQLHighlight.tsx` | 历史、JOIN/透视/集合 SQL 预览 |
| 方言 | `Query/SQLQuery/sqlDialect.ts` | **唯一** DuckDB 方言定义入口 |
| 主题 | `sqlEditorTheme.ts` + `sqlHighlightStyles.ts` | 浅/深两套整包，`Compartment` 切换 |

- 必须用 `duckDBDialect`；❌ 禁止 `StandardSQL.spec.keywords` 拼接（`spec` 无词表，`SELECT` 会被当 Identifier）。扩展词表基于 `PostgreSQL.spec.keywords`。
- 只读 SQL 展示优先 `SQLHighlight`，避免无高亮的 `<pre className="font-mono">`。

### 4.3 TypeScript 与表单
- Props 必须定义接口/类型；禁止滥用 `any`。
- 表单现状：**受控组件 + useState + 手写校验**（如 `DataSource/DatabaseForm.tsx`）。`react-hook-form` / `zod` 曾作为零使用的"纸面依赖"存在，已于 2026-07-09 卸载——若将来要引入表单库，须整表单统一迁移并更新本节，不接受单点混用。

### 4.4 数据获取（TanStack Query 强制）
- 所有服务端数据必须 TanStack Query；禁止 `useEffect + fetch + useState`。
- 共享数据抽成 `frontend/src/hooks/` 共享 Hook（`useDuckDBTables` / `useDataSources` / `useDatabaseConnections` / `useSchemas` / `useSchemaTables` / `useTableColumns` / 业务壳 `useAppShell`）。
- QueryKey：kebab.resource 风格（`['duckdb-tables']`、`['datasources', id]`）；重命名 Key 须同步 `cacheInvalidation.ts` 前缀失效逻辑。

### 4.5 缓存刷新规则（强制）

创建/删除表的操作**必须**调用 `frontend/src/utils/cacheInvalidation.ts`：

| 场景 | 刷新函数 |
|------|----------|
| SQL saveAsTable / 异步任务完成 | `invalidateAllDataCaches()` |
| 透视 saveAsTable / 粘贴数据建表 | `invalidateAfterTableCreate()` |
| 文件上传/导入 | `invalidateAfterFileUpload()` |
| 表删除 | `invalidateAfterTableDelete()` |
| 数据库连接变更 | `invalidateAfterDatabaseChange()` |

### 4.6 国际化
- 用户可见文案一律 `react-i18next`（zh / en 词条成对维护于 `src/i18n/locales/`）；禁止硬编码中文/英文串进组件。

---

## 5. UI / 样式规范（**禁止自定义**）

> **总原则**：只能使用 **shadcn/ui 组件 + Tailwind v4 标准类**。

- ❌ 新增/导入自定义 CSS 文件、CSS 变量/design token
- ❌ inline style（动态尺寸/位置除外）
- ❌ Tailwind arbitrary values（`text-[11px]`）
- ❌ 硬编码颜色（`#hex`、`rgb()`）、`!important`
- 组件优先级：shadcn/ui（Button/Input/Card/Dialog/Tabs/DropdownMenu/Tooltip/Toast）→ Tailwind 布局与间距；图标统一 `lucide-react`，禁止 MUI。

> 🔌 **自动化兜底现状（2026-07-09 已接线）**：`eslint-plugin-duckquery` 经相对路径接入 `frontend/eslint.config.js`。已按 error 强制：`no-mui-in-new-layout`、`no-fetch-in-useeffect`、`require-tanstack-query`（接线时存量已清零）。存量过大暂 off（计数见 eslint.config.js 注释，烧完一类开一类）：`no-hardcoded-colors`(75)、`no-arbitrary-tailwind`(223)、`enforce-import-order`(641)、`require-i18n`(648)——这四类目前仍靠人工 review，**新代码不得扩大存量**。

---

## 6. 查询结果区（DataGrid + 图表）

- 表格：**仅** `ResultPanel` → `DataGridWrapper` → `Query/DataGrid/DataGrid.tsx`（TanStack Table + 虚拟滚动）；列定义经 `useDataGridColumns`；禁止 ag-grid；`columns` 引用须 `useMemo` 稳定。
- 图表：结果区 table|chart 切换由 `Query/Charts/ChartView` 承载（轴选择、AI 图表建议、全屏、**点击图元下钻**——生成带 WHERE 的明细 SQL 填入编辑器、不自动执行）。图表 SQL 拼接一律经 `sqlLiteral.ts`。

---

## 7. 后端开发规范

### 7.1 基本规范
- PEP 8；公共 API docstring + 类型标注；路由命名 kebab-case。
- **异常/日志/HTTP 错误消息一律英文**——自定义 pylint 规则强制：W9020（通用消息中文）、W9021（logger 中文）、W9022（HTTPException 中文）、W9023（raise 消息中文）。中文注释/文档不受限。

### 7.2 DuckDB 连接
- 使用 `with_duckdb_connection()`（`api/core/database/duckdb_engine.py`）上下文管理器；禁止模块级长连接/全局 `duckdb.connect()`。
- 阻塞型工作（大 I/O、外部库内省）在 async 路由中须 `asyncio.to_thread` / 线程池，勿阻塞事件循环。

### 7.3 时区处理
按**目标字段类型**选函数（`api/core/common/timezone_utils.py`）：

| 目标类型 | 函数 | 场景 |
|----------|------|------|
| `str` | `get_current_time_iso()` | JSON 文件、API 响应 |
| `datetime` | `get_current_time()` | Pydantic 模型、ORM |
| `datetime(UTC naive)` | `get_storage_time()` | DuckDB 存储 |

### 7.4 标识符与用户可控输入（强制走共享原语）
| 输入 | 原语 | 位置 |
|------|------|------|
| 表名/别名清洗 | `sanitize_identifier(value, allow_leading_digit=, prefix=)`（用户别名 `True`，文件名默认值 `False`） | `core/data/excel_import_manager.py` |
| 导出/下载文件名 | `safe_filename_base()`（防 `..` 穿越、引号注入 COPY） | `api/utils/safe_filename.py` |
| SQL 字符串字面量（前端拼 SQL） | `sqlStringLiteral()` | `frontend/src/utils/sqlLiteral.ts` |
| SQL 标识符引用 | `'"' + name.replace('"','""') + '"'` 双引号转义 | 各生成器内已有惯例 |

**禁止**在新代码里重新手写这些 replace/正则。

### 7.5 异步任务结果表（安全语义，2026-07-09 起）
- `custom_table_name` 清洗后为空 → 回退 task_id 派生名，**绝不建空名表**。
- 自定义名撞 `main` 已有表且未传 `overwrite=true` → **抛错拒绝**，不做静默 `CREATE OR REPLACE`；仅"重试任务"固定 `overwrite=True`。

### 7.6 凭据加密（定位声明，勿"升级"）
- 数据库连接密码：`api/utils/encryption_utils.py` **XOR 流加密（v2 前缀）**，密钥为**本机自动生成**的 `secret.key`（旧硬编码默认键仅保留兼容解密）。这是**本地单机应用的混淆定位**——app 自身必须能解密，密码学强度对本威胁模型无意义，**不要提议换 Fernet/AES“加固”**。
- AI 供应商 API Key：`core/foundation/crypto_utils.py`（Fernet）。
- `core/security/encryption.py` 的 Fernet 写路径无调用方（读取兼容用），勿在新代码启用。
- 任何密码不得明文回传前端（`***ENCRYPTED***` 哨兵回填）。

---

## 8. API 与响应规范

### 8.1 端点命名
- 统一 `/api/...`，资源名 kebab-case。

### 8.2 统一响应格式

成功体 / 列表体 / 错误体字段与 `api/utils/response_helpers.py`、`frontend/src/api/types.ts` 保持一致：

```json
// 成功                                   // 列表 data                 // 错误
{"success": true, "data": {},            {"items": [], "total": 0}   {"success": false,
 "messageCode": "OPERATION_SUCCESS",                                  "error": {"code": "...", "message": "...", "details": {}},
 "message": "...", "timestamp": "..."}                                "messageCode": "...", "message": "...", "timestamp": "..."}
```

### 8.3 后端使用
```python
from utils.response_helpers import (
    create_success_response, create_list_response, error_json_response, MessageCode,
)

return create_success_response(data={"table": t}, message_code=MessageCode.TABLE_CREATED)
return create_list_response(items=tables, total=len(tables), message_code=MessageCode.TABLES_RETRIEVED)
# 错误主路径：不要 raise HTTPException(detail=...)，路由层统一
return error_json_response(status_code=400, code="VALIDATION_ERROR", message="...", details={...})
```

### 8.4 前端类型与解包
- `StandardSuccess` / `StandardError` 定义于 `frontend/src/api/types.ts`；`normalizeResponse`（`client.ts`）统一解包，列表用 `items`/`total`。

### 8.5 契约维护流程
| 动作 | 顺序 |
|------|------|
| 改端点 JSON 形状/语义 | 1) 更新契约表对应行 → 2) 改 `api/routers/*` 与 Pydantic → 3) 改 `frontend/src/api/*` → 4) 改调用方/单测 |
| 新增 `/api/...` 端点 | 契约表新增一行后再实现；前端经 `apiClient` + `normalizeResponse` + barrel 导出 |

---

## 9. MCP Server 规范

`mcp/duckquery_mcp`：独立 Python 包（≥3.10），经 HTTP 调用后端；工具集在 `tools/`（query / discover / sources / transform / export / ai_settings / passthrough）。

### 9.1 模式与门控（安全核心）
- 运行模式 `DUCKQUERY_MCP_MODE` = `read-only` | `normal`（默认）| `full`。
- **所有可变更/可外泄操作**（建表、导入、导出、DDL/DML、保存连接、非 GET passthrough）必须过 `safety.confirm_required(cfg, is_mutating, confirm)`：read-only 直接拦 → normal 要求调用方显式 `confirm=true` → full 放行。新增写类工具**必须**接同一门控，不得自行实现。
- SQL 读写判定用 `safety.is_write_sql`（注意 `EXPLAIN ANALYZE` 会真执行，按写处理）。
- 后端 `/api/duckdb/execute` 另有独立 DROP 硬拦（与 confirm 是两层，confirm 绕不过它）；删表走 `DELETE /api/duckdb/tables/{name}`。

### 9.2 后端发现
- 顺序：env `DUCKQUERY_API_BASE` → `~/Library/Application Support/DuckQuery/runtime.json`（桌面 App 动态端口）→ 探测已知端口。

### 9.3 文档一致性
- 工具 docstring 是 LLM 的使用说明书，参数枚举（如 `import_mode: auto|literal|variant`）必须与后端校验**逐字一致**；后端改枚举时同步改 docstring 与 `mcp/tests`。

---

## 10. 测试规范

- 前端：组件/共享 Hook 必须有单测，放同目录 `__tests__/`；`npm run test`（vitest）。
- 后端：`cd api && ../.venv/bin/python -m pytest tests -q`。
- MCP：`cd mcp && ../.venv/bin/python -m pytest tests -q`；写类工具的 confirm 门控必须有回归测试（无 confirm 被拦、confirm=true 放行）。
- **SQL 生成器的测试必须在真实 DuckDB 上执行生成的 SQL 并断言结果值**——纯字符串断言拦不住 Binder Error / 列名漂移（2026-07 透视总计 bug 的直接教训，样例见 `api/tests/test_pivot_query_generator.py` 的 `*_executes` 用例）。
- 回归测试须在 docstring 注明复现的历史 bug 与日期。

---

## 11. 质量检查清单（提交前）

### UI / 前端
- [ ] 仅 shadcn/ui + Tailwind v4 标准类；图标 lucide-react；无硬编码颜色 / arbitrary values / `!important`
- [ ] 服务端数据经 TanStack Query；本后端请求经 `@/api`（新模块已入 barrel）
- [ ] Mutation 后调用缓存刷新；用户文案走 i18n（zh/en 成对）
- [ ] `npm run lint`、`npx tsc --noEmit`、`npm run test`、`npm run build` 全过

### 后端 / MCP
- [ ] 统一响应格式；错误走 `error_json_response`
- [ ] 异常/日志消息英文（W9020-9023）；用户可控输入走 §7.4 共享原语
- [ ] pylint 全项目 10/10（pre-commit 同款命令）；pytest 过
- [ ] MCP 写类工具接 `confirm_required` 且有门控测试

### API / 契约
- [ ] 改响应字段或端点：已同步 [`docs/API_CONTRACT_FE_BE.md`](docs/API_CONTRACT_FE_BE.md)

---

## 12. 代理行为约束

- 未经指示不修改代码；仅分析则不动代码。
- 不做全局安装；清理/删除前先 grep 查引用。
- 桌面版/MCP 行为验证前先确认运行的是新代码（§3"改码 ≠ 生效"）。

### 12.1 透视表 Tab（**禁止误删**）

查询工作台「透视表」为**在产功能**（`QueryTabs` → `PivotPanel`），清理时**不得**删除：

| 层级 | 路径 |
|------|------|
| 前端 UI | `frontend/src/Query/PivotTable/`（`PivotPanel`、`PivotTableDesigner`、`buildPivotQueryPayload`） |
| 前端 API | `frontend/src/api/pivotQueryApi.ts`（`generatePivotQuery` / `previewPivotQuery`） |
| 后端 | `api/routers/pivot_query.py`、`core/services/pivot_query_generator.py`、`pivot_query_sql_common.py`、`models/pivot_query_models.py` |
| 关联 | `core/services/table_metadata_service.py`、`set_operation_generator.py` |

历史注：Visual 构建器（`VisualQuery/`、`/api/visual-query/*`、`regular_query_generator`）已于 2026-05 移除，勿恢复。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **duckdb-query** (14531 symbols, 28251 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/duckdb-query/context` | Codebase overview, check index freshness |
| `gitnexus://repo/duckdb-query/clusters` | All functional areas |
| `gitnexus://repo/duckdb-query/processes` | All execution flows |
| `gitnexus://repo/duckdb-query/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
