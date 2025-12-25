# DuckQuery 项目 AGENT 规则（v3.1）

> **更新时间**：2025-12-12  
> **适用范围**：全项目（前端、后端、测试、文档）  
> **权威性**：本文件为唯一 AGENT 约束来源（替代/合并 `AGENTS2.md`）。若两者冲突，以本文件为准。

---

## 目录
1. 项目架构与双入口隔离  
2. 目录结构与关键文件  
3. 运行与测试  
4. 前端开发规范（新布局）  
5. UI / 样式规范（新布局，**禁止自定义**）  
6. AG Grid v34 规范（新布局）  
7. 状态管理与入口约束  
8. 后端开发规范  
9. API 与响应规范  
10. 测试规范  
11. 质量检查清单  
12. 代理行为约束

---

## 1. 项目架构与双入口隔离

### 技术栈
| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite + TypeScript |
| UI 组件 | 新布局：shadcn/ui + Tailwind CSS / 旧布局：MUI v5 |
| 状态管理 | 新布局：TanStack Query + Hooks / 旧布局：旧实现保持不动 |
| 表格 | AG Grid v34 Community |
| 后端框架 | FastAPI + Python 3.11+ |
| 数据库 | DuckDB |
| 国际化 | react-i18next |

### 双入口（强制隔离，互不影响）
| 入口 | 路径 | UI 组件 | 样式 | 说明 |
|------|------|---------|------|------|
| 旧入口 | `frontend/src/ShadcnApp.jsx` | MUI v5 | `frontend/src/styles/modern.css` | 旧 UI **保持不变** |
| 新入口 | `frontend/src/DuckQueryApp.jsx` | shadcn/ui | Tailwind（`tailwind.css`） | 新功能只在 `new/` 开发 |

**隔离规则（必须遵守）**
- 新布局代码（`frontend/src/new/`）：
  - 禁止导入 `@mui/*`、`@mui/icons-material`
  - 禁止引用 `modern.css`
  - 禁止使用旧类名（如 `.dq-shell`、`.page-intro`）
- 旧布局代码（`frontend/src/components/`）：
  - 禁止导入 shadcn/ui
  - 禁止依赖 Tailwind-only 新类名
  - 未经指示不要修改旧布局任何文件

---

## 2. 目录结构与关键文件

```
duckdb-query/
├── api/                          # 后端 FastAPI
│   ├── core/                     # DuckDB 引擎/连接池/任务
│   ├── routers/                  # API 路由
│   ├── models/                   # Pydantic 模型
│   ├── utils/                    # 响应/工具
│   └── tests/                    # 后端测试
├── frontend/
│   └── src/
│       ├── new/                  # 新布局（shadcn/ui + Tailwind）⭐ 新功能区
│       │   ├── components/ui/    # shadcn/ui 组件库
│       │   ├── Layout/           # 布局组件（Sidebar, Header, PageShell）
│       │   ├── DataSource/       # 数据源管理组件
│       │   ├── Query/            # 查询相关组件
│       │   │   ├── VisualQuery/  # 可视化查询构建器
│       │   │   ├── SQLQuery/     # SQL 查询编辑器
│       │   │   ├── ResultPanel/  # 结果展示面板（AG Grid）
│       │   │   ├── DataSourcePanel/ # 数据源树形面板
│       │   │   ├── AsyncTasks/   # 异步任务面板
│       │   │   └── QueryTabs/    # 查询标签页
│       │   ├── hooks/            # 共享 Hooks（TanStack Query）
│       │   ├── providers/        # Context Providers
│       │   └── utils/            # 工具函数
│       ├── components/           # 旧布局（MUI）- 不改
│       ├── services/             # 前端 API 客户端
│       ├── styles/
│       │   ├── tailwind.css      # 新布局主题变量（已配置）
│       │   └── modern.css        # 旧布局样式（不改）
│       └── i18n/                 # 国际化
├── config/                       # 配置
├── docs/                         # 文档
├── temp_files/                   # 临时文件（不提交）
├── exports/                      # 导出文件
└── docker-compose.yml
```

**关键文件索引**

| 文件 | 用途 |
|------|------|
| `frontend/src/new/Query/ResultPanel/AGGridWrapper.tsx` | AG Grid 封装组件 |
| `frontend/src/new/Query/ResultPanel/hooks/useGridStats.ts` | Grid 统计信息 Hook |
| `frontend/src/new/Query/ResultPanel/hooks/useAGGridConfig.ts` | Grid 配置 Hook |
| `frontend/src/new/Query/ResultPanel/hooks/useColumnTypeDetection.ts` | 列类型检测 Hook |
| `frontend/src/new/hooks/useDuckDBTables.ts` | DuckDB 表列表 Hook |
| `frontend/src/new/hooks/useDataSources.ts` | 数据源列表 Hook |
| `frontend/src/new/hooks/useDatabaseConnections.ts` | 数据库连接 Hook |
| `frontend/src/new/utils/cacheInvalidation.ts` | 缓存失效工具 |
| `frontend/src/services/apiClient.js` | 前端 API 客户端 |
| `api/core/duckdb_pool.py` | DuckDB 连接池 |
| `api/core/task_manager.py` | 异步任务管理 |
| `api/utils/response_helpers.py` | 统一响应格式 |
| `api/routers/async_tasks.py` | 异步任务 API |
| `api/routers/duckdb_query.py` | DuckDB 查询 API |

---

## 3. 运行与测试

### 后端
```bash
cd api
python -m uvicorn main:app --reload
python -m pytest tests -q        # 等价：根目录 python -m pytest api/tests -q
python -m mypy .                 # 类型检查（如需要）
```

### 前端
```bash
cd frontend
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

---

## 4. 前端开发规范（新布局）

### 4.1 文件与命名
| 类型 | 规则 | 示例 |
|------|------|------|
| 组件 | PascalCase.tsx | `DataPasteCard.tsx` |
| Hook | camelCase.ts（use 前缀） | `useDuckDBTables.ts` |
| 工具 | camelCase.ts | `cacheInvalidation.ts` |
| 测试 | *.test.tsx / *.test.ts | `useDuckDBTables.test.ts` |
| 常量 | UPPER_SNAKE_CASE | `DUCKDB_TABLES_QUERY_KEY` |

### 4.2 导入约束
**正确示例**
```tsx
import { Button } from '@/new/components/ui/button';
import { Card } from '@/new/components/ui/card';
import { Home } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
```

**禁止示例**
```tsx
import { Button } from '@mui/material';     // 禁止（新布局）
import '@/styles/modern.css';               // 禁止（新布局）
```

### 4.3 TypeScript 与表单
- Props 必须定义接口/类型
- 禁止滥用 `any`
- 表单使用 `react-hook-form + zod`

```tsx
interface DatabaseFormProps {
  onSaved?: () => void;
}

// zod schema
const schema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
});
type FormData = z.infer<typeof schema>;
```

### 4.4 数据获取（TanStack Query 强制）
- 新布局所有服务端数据必须使用 TanStack Query
- 禁止 `useEffect + fetch + useState` 管服务端数据
- 共享数据抽成 `frontend/src/new/hooks/` 的共享 Hook

**示例**
```tsx
export const DUCKDB_TABLES_QUERY_KEY = ['duckdb-tables'] as const;

export function useDuckDBTables() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: DUCKDB_TABLES_QUERY_KEY,
    queryFn: fetchDuckDBTableSummaries,
    staleTime: 5 * 60 * 1000,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: DUCKDB_TABLES_QUERY_KEY });

  return { tables: query.data?.tables ?? [], ...query, refresh };
}
```

**QueryKey 命名**
- ✅ `['duckdb-tables']`、`['datasources', id]`、`['async-tasks']`
- ❌ `['tables']`、`['getTables']`、`['duckdb_tables']`

**Mutation 后必须失效缓存**
```tsx
const mutation = useMutation({
  mutationFn: deleteDuckDBTableEnhanced,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: DUCKDB_TABLES_QUERY_KEY });
  },
});
```

---

## 5. UI / 样式规范（新布局，**禁止自定义**）

> **总原则**：新布局只能使用 **shadcn/ui 组件 + Tailwind 类**。  
> 不新增/不引入自定义 CSS、主题、token、变量、颜色、z-index。若确需扩展，先征求指示。

### 5.1 禁止自定义清单
- ❌ 新布局禁止新增/导入任何自定义 CSS 文件（除第三方库官方 CSS 外）
- ❌ 禁止在新布局新增 CSS 变量/主题/设计 token（包括改 `tailwind.css`/`tailwind.config.js`）
- ❌ 禁止 inline style（除非是动态尺寸/位置且无 Tailwind 等价）
- ❌ 禁止 Tailwind arbitrary values（如 `text-[11px]`, `bg-[#fff]`, `z-[999]`）
- ❌ 禁止硬编码颜色（`#hex`、`rgb()`、Tailwind 原色如 `bg-blue-500`）
- ❌ 禁止直接使用 CSS var（`var(--*)`）
- ❌ 禁止 `!important`

> 历史遗留如有违例（目前仓库里存在少量），按“就近改动、逐步清理”原则演进。


> **扩展流程**：如果确实需要新增语义类/样式（如新增状态色、新组件变体），先提需求说明场景，由项目负责人确认是否允许调整 `tailwind.css` / `tailwind.config.js`。未经确认禁止自行修改。
### 5.2 组件优先级
1. **优先 shadcn/ui**：Button / Input / Card / Dialog / Tabs / DropdownMenu / Tooltip / Toast
2. Tailwind 只做布局与间距（flex/grid/gap/padding 等）
3. 不重复造轮子（不要手写弹窗/Toast/Select）

### 5.3 标准模式（示例）
#### 卡片
```tsx
<Card className="border-border shadow-sm">
  <CardHeader>
    <CardTitle className="text-foreground">标题</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* 内容 */}
  </CardContent>
</Card>
```

#### 输入框
```tsx
<Input placeholder="请输入..." className="bg-input border-border" />
```

#### Tabs
```tsx
<Tabs defaultValue="a">
  <TabsList>
    <TabsTrigger value="a">A</TabsTrigger>
    <TabsTrigger value="b">B</TabsTrigger>
  </TabsList>
  <TabsContent value="a">...</TabsContent>
</Tabs>
```

#### Dialog / Toast / Tooltip
- 用 shadcn/ui；不要手写 CSS 浮层。

### 5.4 图标
- 新布局统一使用 `lucide-react`
- 禁止 MUI Icons

---

## 6. AG Grid v34 规范（新布局）

### 6.1 只用官方 Alpine CSS 主题
- 允许的 CSS：
  - `ag-grid-community/styles/ag-grid.css`
  - `ag-grid-community/styles/ag-theme-alpine.css`
- 禁止自定义 ag-grid 主题 CSS / 覆盖 `--ag-*`（新布局）

### 6.2 必须禁用 Theming API
AG Grid v34 默认启用 Theming API（默认 `themeQuartz`），会运行时注入样式覆盖 CSS 主题。  
新布局必须显式设置：
```ts
gridOptions.theme = 'legacy';
```
> `'legacy'` 仅是 AG Grid 的 CSS 主题模式开关，和旧 UI/`modern.css` 无关。

### 6.3 配置对象稳定性（防止无限循环）
AG Grid 会在配置对象引用变化时触发 `modelUpdated` 事件。若事件回调中有 `setState`，会导致 React 无限更新循环。

**必须遵守**：
- `gridOptions` 和 `defaultColDef` 必须用 `useMemo` 包裹，稳定引用
- 事件回调中的 `setState` 必须做浅比较，值没变就返回原引用

**正确示例**（AGGridWrapper.tsx）：
```tsx
// ✅ 用 useMemo 稳定配置对象
const defaultColDef = useMemo(() => ({
  sortable: true,
  filter: true,
  ...customDefaultColDef,
}), [customDefaultColDef]);

const gridOptions = useMemo(() => ({
  theme: 'legacy',
  rowSelection: enableRowSelection ? 'multiple' : undefined,
  ...customGridOptions,
}), [enableRowSelection, customGridOptions]);
```

**正确示例**（useGridStats.ts）：
```tsx
// ✅ 浅比较避免无意义 setState（必须比较所有 stats 字段）
setStats((prev) => {
  if (
    prev.totalRows === newStats.totalRows &&
    prev.filteredRows === newStats.filteredRows &&
    prev.selectedRows === newStats.selectedRows &&
    prev.columnCount === newStats.columnCount &&
    prev.visibleColumnCount === newStats.visibleColumnCount
  ) {
    return prev; // 值没变，返回原引用，不触发重渲染
  }
  return newStats;
});
```

> **注意**：浅比较必须覆盖所有 stats 字段，漏掉任何字段都可能导致状态不同步。

**错误示例**：
```tsx
// ❌ 每次 render 创建新对象 → 触发 modelUpdated → 无限循环
const gridOptions = { theme: 'legacy', ... };

// ❌ 无差别 setState → 无限循环
setStats({ totalRows, filteredRows, ... });
```

### 6.4 推荐：使用单独 props 而非整块 gridOptions
AG Grid React 官方推荐不传整块 `gridOptions`，而是使用 `AgGridReact` 的单独 props。这样可以从规则层面减少配置对象引用变化导致的问题：

```tsx
// ✅ 推荐：使用单独 props
<AgGridReact
  rowData={rowData}
  columnDefs={columnDefs}
  defaultColDef={defaultColDef}
  rowSelection="multiple"
  animateRows={true}
  onGridReady={handleGridReady}
/>

// ⚠️ 可用但需谨慎：传整块 gridOptions（必须 useMemo）
<AgGridReact
  gridOptions={gridOptions}  // 必须用 useMemo 稳定
/>
```

---

## 7. 状态管理与入口约束
- 业务状态集中在 `useAppShell` (`frontend/src/new/hooks/useAppShell.ts`)，返回 `{ state, actions }`
- `DuckQueryApp.jsx` 通过 `useAppShell` 获取全局状态
- `useAppShell` 组合了 `useAppActions` 等细粒度 Hooks
- 状态机/全局状态的演进应在 `frontend/src/new/hooks/` 下的独立 Hook 中完成，并通过 `useAppShell` 聚合

---

## 8. 后端开发规范
- 遵循 PEP 8
- 公共 API 必须有 docstring + 类型标注
- 路由命名 kebab-case
- 时间写回 DuckDB 前统一为 UTC naive

### DuckDB 连接（关键）
- 辅助函数必须无状态
- 接收可选连接参数并调用 `_use_connection()` / `with_duckdb_connection()`
- 禁止模块级长连接/全局 duckdb.connect()

---

## 9. API 与响应规范

### 9.1 端点命名
- 统一 `/api/...`
- 资源名 kebab-case

### 9.2 统一响应格式
成功：
```json
{ "success": true, "data": {}, "messageCode": "OPERATION_SUCCESS", "message": "操作成功" }
```
错误：
```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "错误描述" } }
```
列表：
```json
{ "success": true, "data": { "items": [], "total": 0 }, "messageCode": "LIST_RETRIEVED" }
```

### 9.3 前端调用
- 新布局优先使用 `frontend/src/services/apiClient.js` 中增强版 API
- 禁止引入旧版/废弃方法（如文档中标记 deprecated 的函数）

---

## 10. 测试规范

### 前端
- 新布局组件/共享 Hook 必须有单测
- 测试文件放在同目录 `__tests__/`

```
frontend/src/new/Foo/Foo.tsx
frontend/src/new/Foo/__tests__/Foo.test.tsx
```

### 后端
```bash
python -m pytest api/tests -q
```

---

## 11. 质量检查清单（提交前）

### 新布局 UI
- [ ] 未使用自定义 CSS / token / arbitrary values
- [ ] 未使用硬编码颜色 / CSS var / `!important`
- [ ] 仅使用 shadcn/ui + Tailwind 标准类
- [ ] 图标统一 lucide-react

### 新旧入口隔离
- [ ] 新布局无 MUI/modern.css 引用
- [ ] 旧布局文件未被修改

### AG Grid
- [ ] 新布局无自定义 ag-grid 主题 CSS
- [ ] `gridOptions.theme = 'legacy'` 已设置

### 数据获取
- [ ] 新布局用 TanStack Query
- [ ] QueryKey 常量化 + kebab-case
- [ ] Mutation 后 `invalidateQueries`

### 构建
- [ ] `npm run build` 通过
- [ ] `npm run lint` 无错误
- [ ] `npx tsc --noEmit` 无错误

---

## 12. 代理行为约束
- 未经指示不修改代码；仅分析则不动代码
- 不做全局安装，避免触碰非项目文件
- 清理/删除前先 grep 查引用，确认无用再删

