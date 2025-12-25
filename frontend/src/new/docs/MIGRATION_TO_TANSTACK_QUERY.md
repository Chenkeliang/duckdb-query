# 迁移到 TanStack Query 指南

本文档指导如何将现有的数据获取代码迁移到 TanStack Query。

> [!NOTE]
> **Status Update**: The migration of `useDuckQuery` has been formally completed (Dec 2024). This document now serves as a reference for patterns and effective practices.

## 📋 目录

- [为什么要迁移](#为什么要迁移)
- [迁移步骤](#迁移步骤)
- [常见模式迁移](#常见模式迁移)
- [缓存管理迁移](#缓存管理迁移)
- [错误处理迁移](#错误处理迁移)
- [测试迁移](#测试迁移)

## 为什么要迁移

### 旧方式的问题

```tsx
// ❌ 旧方式：使用 useState + useEffect
const [tables, setTables] = useState([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

useEffect(() => {
  setLoading(true);
  fetch('/api/duckdb_tables')
    .then(res => res.json())
    .then(setTables)
    .catch(setError)
    .finally(() => setLoading(false));
}, []);
```

**问题**：
- ❌ 每次组件挂载都重新请求
- ❌ 多个组件使用时会发送重复请求
- ❌ 没有缓存机制
- ❌ 手动管理加载和错误状态
- ❌ 数据变更后需要手动刷新

### 新方式的优势

```tsx
// ✅ 新方式：使用 TanStack Query
const { tables, isLoading, error } = useDuckDBTables();
```

**优势**：
- ✅ 自动请求去重
- ✅ 智能缓存（5 分钟）
- ✅ 多个组件共享数据
- ✅ 自动管理状态
- ✅ 统一的缓存失效机制

## 迁移步骤

### 步骤 1: 安装依赖

确保项目已安装 TanStack Query：

```bash
npm install @tanstack/react-query
```

### 步骤 2: 设置 QueryClient

在应用根组件中设置 QueryClientProvider（已完成）：

```tsx
// main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 分钟
      gcTime: 10 * 60 * 1000, // 10 分钟
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 2,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
    </QueryClientProvider>
  );
}
```

### 步骤 3: 迁移数据获取代码

#### 3.1 迁移表列表获取

**旧代码**：

```tsx
// ❌ 旧方式
const [tables, setTables] = useState([]);
const [loading, setLoading] = useState(false);

useEffect(() => {
  const fetchTables = async () => {
    setLoading(true);
    try {
      const data = await getDuckDBTables();
      setTables(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  fetchTables();
}, []);
```

**新代码**：

```tsx
// ✅ 新方式
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';

const { tables, isLoading } = useDuckDBTables();
```

#### 3.2 迁移数据库连接获取

**旧代码**：

```tsx
// ❌ 旧方式
const [connections, setConnections] = useState([]);

useEffect(() => {
  listDatabaseConnections().then(res => {
    if (res.success) {
      setConnections(res.connections);
    }
  });
}, []);
```

**新代码**：

```tsx
// ✅ 新方式
import { useDatabaseConnections } from '@/new/hooks/useDataSources';

const { connections, isLoading } = useDatabaseConnections();
```

## 常见模式迁移

### 模式 1: 带刷新按钮的列表

**旧代码**：

```tsx
// ❌ 旧方式
const [tables, setTables] = useState([]);
const [loading, setLoading] = useState(false);

const fetchTables = async () => {
  setLoading(true);
  try {
    const data = await getDuckDBTables();
    setTables(data);
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  fetchTables();
}, []);

return (
  <div>
    <button onClick={fetchTables} disabled={loading}>
      刷新
    </button>
    {tables.map(table => <div key={table.name}>{table.name}</div>)}
  </div>
);
```

**新代码**：

```tsx
// ✅ 新方式
const { tables, isLoading, isFetching, refresh } = useDuckDBTables();

return (
  <div>
    <button onClick={refresh} disabled={isFetching}>
      {isFetching ? '刷新中...' : '刷新'}
    </button>
    {isLoading ? (
      <div>加载中...</div>
    ) : (
      tables.map(table => <div key={table.name}>{table.name}</div>)
    )}
  </div>
);
```

### 模式 2: 文件上传后刷新

**旧代码**：

```tsx
// ❌ 旧方式
const [tables, setTables] = useState([]);

const handleUpload = async (file) => {
  await uploadFile(file);
  // 手动重新获取
  const data = await getDuckDBTables();
  setTables(data);
};
```

**新代码**：

```tsx
// ✅ 新方式
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAfterFileUpload } from '@/new/utils/cacheInvalidation';

const queryClient = useQueryClient();
const { tables } = useDuckDBTables();

const handleUpload = async (file) => {
  await uploadFile(file);
  // 使缓存失效，自动重新获取
  await invalidateAfterFileUpload(queryClient);
};
```

### 模式 3: 条件查询

**旧代码**：

```tsx
// ❌ 旧方式
const [dataSources, setDataSources] = useState([]);
const [filter, setFilter] = useState('all');

useEffect(() => {
  listAllDataSources({ type: filter }).then(res => {
    setDataSources(res.datasources);
  });
}, [filter]);
```

**新代码**：

```tsx
// ✅ 新方式
const [filter, setFilter] = useState('all');
const { dataSources } = useDataSources({ type: filter });
// 当 filter 变化时，会自动重新查询
```

## 缓存管理迁移

### 旧方式：手动清理缓存

**旧代码**：

```tsx
// ❌ 旧方式
import requestManager from '@/utils/requestManager';

const handleUpload = async (file) => {
  await uploadFile(file);
  requestManager.clearAllCache(); // 清理所有缓存
  // 然后手动重新获取
  const data = await getDuckDBTables();
  setTables(data);
};
```

### 新方式：使用缓存失效工具

**新代码**：

```tsx
// ✅ 新方式
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAfterFileUpload } from '@/new/utils/cacheInvalidation';

const queryClient = useQueryClient();

const handleUpload = async (file) => {
  await uploadFile(file);
  // 只失效相关缓存，自动重新获取
  await invalidateAfterFileUpload(queryClient);
};
```

### 缓存失效场景映射

| 场景 | 旧方式 | 新方式 |
|------|--------|--------|
| 文件上传 | `requestManager.clearAllCache()` | `invalidateAfterFileUpload(queryClient)` |
| 表删除 | `requestManager.clearAllCache()` | `invalidateAfterTableDelete(queryClient)` |
| 数据库连接变更 | `requestManager.clearCache('/api/datasources')` | `invalidateAfterDatabaseChange(queryClient)` |
| 异步任务完成 | `triggerRefresh()` | `invalidateAllDataCaches(queryClient)` |

## 错误处理迁移

### 旧方式：手动错误处理

**旧代码**：

```tsx
// ❌ 旧方式
const [error, setError] = useState(null);

useEffect(() => {
  getDuckDBTables()
    .then(setTables)
    .catch(err => {
      setError(err.message);
      toast.error('获取表列表失败');
    });
}, []);

if (error) {
  return <div>错误: {error}</div>;
}
```

### 新方式：自动错误处理

**新代码**：

```tsx
// ✅ 新方式
const { tables, isLoading, isError, error } = useDuckDBTables();

if (isError) {
  return <div>错误: {error?.message}</div>;
}

if (isLoading) {
  return <div>加载中...</div>;
}

return <div>{/* 渲染表列表 */}</div>;
```

## 测试迁移

### 旧方式：Mock fetch

**旧代码**：

```tsx
// ❌ 旧方式
import { render, waitFor } from '@testing-library/react';

global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve([{ name: 'table1' }]),
  })
);

test('should fetch tables', async () => {
  const { getByText } = render(<TableList />);
  await waitFor(() => {
    expect(getByText('table1')).toBeInTheDocument();
  });
});
```

### 新方式：Mock API + QueryClient

**新代码**：

```tsx
// ✅ 新方式
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as apiClient from '@/services/apiClient';

jest.mock('@/services/apiClient');

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

test('should fetch tables', async () => {
  (apiClient.getDuckDBTables as jest.Mock).mockResolvedValue([
    { name: 'table1' },
  ]);

  const { getByText } = render(<TableList />, {
    wrapper: createWrapper(),
  });

  await waitFor(() => {
    expect(getByText('table1')).toBeInTheDocument();
  });
});
```

## 迁移检查清单

### 代码迁移

- [ ] 移除 `useState` 用于存储服务端数据
- [ ] 移除 `useEffect` 用于数据获取
- [ ] 使用对应的 TanStack Query hook
- [ ] 更新加载状态检查（`loading` → `isLoading`）
- [ ] 更新错误处理（使用 `isError` 和 `error`）

### 缓存管理

- [ ] 移除 `requestManager.clearAllCache()` 调用
- [ ] 使用 `invalidate*` 工具函数
- [ ] 确保数据变更后调用缓存失效

### 测试

- [ ] 更新测试以使用 QueryClientProvider
- [ ] Mock API 函数而非 fetch
- [ ] 测试缓存失效逻辑

### 性能优化

- [ ] 验证请求去重生效（多个组件只发送 1 次请求）
- [ ] 验证缓存生效（组件重新挂载不发送请求）
- [ ] 验证后台刷新（使用 `isFetching` 显示状态）

## 常见问题

### Q: 如何在组件外使用缓存失效？

A: 创建一个 queryClient 实例并传递：

```tsx
import { QueryClient } from '@tanstack/react-query';
import { invalidateDuckDBTables } from '@/new/hooks/useDuckDBTables';

const queryClient = new QueryClient();

// 在任何地方使用
export const refreshTables = () => {
  invalidateDuckDBTables(queryClient);
};
```

### Q: 如何禁用缓存？

A: 设置 `staleTime: 0`：

```tsx
const { tables } = useDuckDBTables();
// 或者在 hook 内部配置
```

### Q: 如何立即刷新而不等待缓存失效？

A: 使用 `refetch()`：

```tsx
const { tables, refetch } = useDuckDBTables();

const handleForceRefresh = async () => {
  await refetch(); // 立即重新获取
};
```

### Q: 旧代码中的 `requestManager` 还需要吗？

A: 对于已迁移到 TanStack Query 的部分，不再需要 `requestManager`。但在迁移完成前，两者可以共存。

## 参考资源

- [TanStack Query 官方文档](https://tanstack.com/query/latest)
- [项目 TanStack Query 使用标准规范](../../../../.kiro/steering/tanstack-query-standards.md)
- [Hooks 使用指南](../hooks/README.md)
- [缓存失效工具函数](../utils/cacheInvalidation.ts)

## 获取帮助

如果在迁移过程中遇到问题，请参考：

1. [Hooks 使用指南](../hooks/README.md)
2. [示例组件](../examples/DataSourceExample.tsx)
3. [测试示例](../hooks/__tests__/useDuckDBTables.test.ts)
