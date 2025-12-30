# Frontend Modernization Design

## Architecture Overview

### Current State

```
frontend/src/
├── DuckQueryApp.jsx          # Main entry (JavaScript, 493 lines)
├── main.jsx                   # React root (JavaScript)
├── services/
│   └── apiClient.js          # Axios-based API (41KB, 1200+ lines)
└── new/
    └── hooks/
        └── useAppShell.ts    # Composition hook
```

### Target State

```
frontend/src/
├── App.tsx                    # Clean TypeScript entry
├── main.tsx                   # TypeScript root
├── api/                       # Modular typed API (保留 axios)
│   ├── index.ts              # Re-exports
│   ├── client.ts             # Axios instance + interceptors
│   ├── queryApi.ts           # Query execution endpoints
│   ├── dataSourceApi.ts      # Data source management
│   ├── fileApi.ts            # File upload/URL import
│   ├── asyncTaskApi.ts       # Async task management
│   └── types.ts              # Shared API types
├── hooks/
│   └── useAppShell.ts        # Clean, modern hook
└── new/                       # Existing components (unchanged)
```

---

## ⚠️ 风险与应对策略

| 改动点 | 潜在影响 | 应对措施 |
|--------|----------|----------|
| **Phase 1: 入口迁移** | 路径别名、测试文件、懒加载引用受影响 | 同一提交中更新 `vite.config.ts`、`tsconfig.json`；迁移前运行 `npx tsc --noEmit` |
| **Phase 2: API 重命名** | 所有消费方编译失败 | 同步更新所有调用方；可选提供别名过渡层 |
| **Phase 3: apiClient 拆分** | 丢失 axios 特性（取消、进度、超时） | **保留 axios**，仅重组文件结构，不改底层实现 |
| **Phase 4: 文档** | 文档与实现脱节 | 列为硬性结项条件 |

---

## Phase 1: Entry File Migration

### 预迁移检查

```bash
# 在迁移前运行，了解潜在类型问题
cd frontend
npx tsc --noEmit
```

### 1.1 Convert `main.jsx` → `main.tsx`

```tsx
// main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

### 1.2 Convert `DuckQueryApp.jsx` → `App.tsx`

**关键改动:**

1. **重命名**: `DuckQueryApp.jsx` → `App.tsx`
2. **类型定义**: 添加 `AppState`, `HeaderGlobalProps` 接口
3. **Logo 合并**: `LogoLight`/`LogoDark` 统一为 `Logo`（当前指向同一 SVG）
4. **原子更新**: 同时更新 `main.tsx` 导入路径

**类型定义:**

```tsx
type TabId = 'datasource' | 'queryworkbench' | 'settings';
type DataSourceTabId = 'upload' | 'database' | 'paste';
type QueryTabId = 'query' | 'tasks';

interface HeaderGlobalProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  locale: string;
  onLocaleChange: () => void;
  onOpenGithub: () => void;
}
```

---

## Phase 2: useAppShell Modernization

### 方案 A: 直接重命名 (破坏性)

```tsx
// 新 API
export interface AppActions {
  setDarkMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  closeWelcome: () => void;  // 移除 setShowWelcome
  setCurrentTab: (tab: string) => void;
  setPreviewQuery: (sql: string) => void;
  refreshData: () => void;   // 原 triggerRefresh
  connectDatabase: (params: DatabaseConnectParams) => Promise<DatabaseConnectResult>;
  saveDatabase: (params: DatabaseConnectParams) => Promise<DatabaseConnectResult>;
}
```

### 方案 B: 兼容别名 (渐进式) ✅ 推荐

```tsx
export interface AppActions {
  // 新命名
  setDarkMode: typeof setIsDarkMode;
  closeWelcome: () => void;
  refreshData: () => void;
  connectDatabase: typeof handleDatabaseConnect;
  saveDatabase: typeof handleDatabaseSaveConfig;
  
  // 兼容别名 (deprecated, 下个大版本移除)
  /** @deprecated Use setDarkMode instead */
  setIsDarkMode: typeof setDarkMode;
  /** @deprecated Use closeWelcome instead */
  setShowWelcome: (value: boolean) => void;
  /** @deprecated Use refreshData instead */
  triggerRefresh: typeof refreshData;
}
```

### 注释更新

```tsx
/**
 * useAppShell Hook
 * 
 * 应用状态管理的组合入口，整合主题、欢迎页、预览状态等 Hooks。
 * 
 * @example
 * const { state, actions } = useAppShell();
 * const { isDarkMode, currentTab } = state;
 * const { setDarkMode, refreshData } = actions;
 */
```

---

## Phase 3: API Modularization

### ⚠️ 核心原则: 保留 axios

当前 `apiClient.js` 使用 axios 并封装了:
- 请求/响应拦截器
- 超时配置
- FormData 上传进度
- 请求取消 (AbortController)
- 统一错误处理

**拆分只重组文件结构，不改变底层行为。**

### 3.1 共享 Axios 实例

```tsx
// api/client.ts
import axios from 'axios';
import type { AxiosInstance, AxiosError } from 'axios';

export const apiClient: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// 响应拦截器 (从 apiClient.js 迁移)
apiClient.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError) => {
    // 统一错误处理逻辑
    return Promise.reject(error);
  }
);

// 导出用于上传的实例 (无 JSON header)
export const uploadClient: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 600000, // 10 minutes for large files
});
```

### 3.2 模块拆分示例

```tsx
// api/queryApi.ts
import { apiClient } from './client';
import type { QueryRequest, QueryResponse, QueryCancelResponse } from './types';

export async function executeQuery(
  sql: string, 
  options?: { timeout?: number; signal?: AbortSignal }
): Promise<QueryResponse> {
  return apiClient.post('/api/query', { sql, ...options });
}

export async function cancelQuery(queryId: string): Promise<QueryCancelResponse> {
  return apiClient.post(`/api/query/${queryId}/cancel`);
}
```

```tsx
// api/fileApi.ts
import { uploadClient } from './client';
import type { UploadProgress, UploadResponse } from './types';

export async function uploadFile(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  
  return uploadClient.post('/api/upload', formData, {
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      }
    },
  });
}
```

### 3.3 Re-export Index

```tsx
// api/index.ts
export * from './queryApi';
export * from './dataSourceApi';
export * from './fileApi';
export * from './asyncTaskApi';
export * from './types';
export { apiClient, uploadClient } from './client';
```

---

## Phase 4: 验证与文档

### 硬性结项条件

- [ ] `npm run build` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run test` 通过 (如有测试)

### 回归测试清单

| 功能 | 测试步骤 |
|------|----------|
| 导航 | 切换 datasource / queryworkbench / settings |
| 文件上传 | 拖拽 CSV 上传，验证进度条 |
| 数据库连接 | 测试 MySQL 连接 |
| 主题切换 | 点击主题按钮，验证暗色/亮色 |
| 语言切换 | 切换中英文 |
| 查询执行 | 运行 SQL 并查看结果 |
| 异步任务 | 创建导出任务，查看状态 |

### 文档更新

- [ ] `docs/NEW_UI_API_REFERENCE.md` - 更新 API 导入示例
- [ ] `README.md` / `README_zh.md` - 如有技术栈变化需更新

---

## 迁移策略

### 分阶段提交

```
commit 1: Phase 1A - main.jsx → main.tsx
commit 2: Phase 1B - DuckQueryApp.jsx → App.tsx
commit 3: Phase 2 - useAppShell modernization
commit 4: Phase 3A - api/client.ts + types.ts
commit 5: Phase 3B - queryApi.ts + dataSourceApi.ts
commit 6: Phase 3C - fileApi.ts + asyncTaskApi.ts
commit 7: Phase 3D - Delete apiClient.js, update all imports
commit 8: Phase 4 - Documentation updates
```

### 回滚策略

每个阶段独立可部署。如出现问题:
- 回滚该阶段的 commit
- 旧文件在显式删除前保持可用
