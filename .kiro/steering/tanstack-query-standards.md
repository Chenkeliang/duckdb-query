# TanStack Query 使用标准规范

## 🎯 核心原则

### 1. 统一数据获取方式
- **强制使用 TanStack Query** 进行所有服务端数据获取
- **禁止使用** `useState` + `useEffect` + `fetch` 的传统模式
- **统一 queryKey** 命名规范，避免缓存冲突

### 2. 请求去重与缓存优先
- **自动请求去重** - 相同 queryKey 的请求会自动合并
- **智能缓存** - 优先使用缓存，减少不必要的网络请求
- **共享数据** - 多个组件可以共享同一份数据

## 📋 标准使用模式

### 模式 1: 创建共享 Hook（推荐）

对于会被多个组件使用的数据，必须创建共享 hook：

```typescript
// ✅ 正确：创建共享 hook
// frontend/src/new/hooks/useDuckDBTables.ts

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDuckDBTables } from '@/services/apiClient';

export const DUCKDB_TABLES_QUERY_KEY = ['duckdb-tables'] as const;

export const useDuckDBTables = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: DUCKDB_TABLES_QUERY_KEY,
    queryFn: getDuckDBTables,
    staleTime: 5 * 60 * 1000, // 5 分钟
    gcTime: 10 * 60 * 1000, // 10 分钟
    refetchOnWindowFocus: true,
    refetchOnMount: false, // 优先使用缓存
  });

  const tables = Array.isArray(query.data) ? query.data : [];

  // 提供强制刷新方法
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: DUCKDB_TABLES_QUERY_KEY });
    return query.refetch();
  };

  return {
    tables,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    refresh,
  };
};

// 导出缓存失效工具函数
export const invalidateDuckDBTables = (queryClient: ReturnType<typeof useQueryClient>) => {
  return queryClient.invalidateQueries({ queryKey: DUCKDB_TABLES_QUERY_KEY });
};
```

**使用场景**：
- 表列表（多个页面都需要）
- 数据源列表
- 用户信息
- 系统配置

### 模式 2: 组件内直接使用

对于只在单个组件使用的数据：

```typescript
// ✅ 正确：组件内直接使用
import { useQuery } from '@tanstack/react-query';

function MyComponent() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-data', id],
    queryFn: () => fetchData(id),
    staleTime: 1 * 60 * 1000, // 1 分钟
  });

  if (isLoading) return <div>加载中...</div>;
  return <div>{data}</div>;
}
```

### 模式 3: Mutation（数据变更）

对于会改变服务端数据的操作：

```typescript
// ✅ 正确：使用 useMutation
import { useMutation, useQueryClient } from '@tanstack/react-query';

function UploadComponent() {
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: uploadFile,
    onSuccess: () => {
      // 上传成功后，使表列表缓存失效
      queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] });
      toast.success('上传成功');
    },
    onError: (error) => {
      toast.error('上传失败：' + error.message);
    },
  });

  return (
    <button onClick={() => uploadMutation.mutate(file)}>
      上传
    </button>
  );
}
```

## 🔑 QueryKey 命名规范

### 规范格式

```typescript
// 格式：['资源名称', ...参数]

// ✅ 正确的命名
['duckdb-tables']                    // 所有表
['duckdb-tables', 'uploaded']        // 上传的表
['duckdb-tables', { type: 'csv' }]   // CSV 表
['datasources']                      // 所有数据源
['datasources', id]                  // 单个数据源
['query-results', queryId]           // 查询结果

// ❌ 错误的命名
['tables']                           // 太泛化
['getTables']                        // 不要用函数名
['duckdb_tables']                    // 使用 kebab-case，不是 snake_case
```

### QueryKey 常量化

```typescript
// ✅ 正确：导出 queryKey 常量
export const DUCKDB_TABLES_QUERY_KEY = ['duckdb-tables'] as const;
export const DATASOURCES_QUERY_KEY = ['datasources'] as const;

// 使用时
useQuery({
  queryKey: DUCKDB_TABLES_QUERY_KEY,
  queryFn: getDuckDBTables,
});
```

## ⚙️ 缓存策略配置

### 标准配置

```typescript
// 频繁变化的数据（如实时状态）
{
  staleTime: 0,                    // 立即过期
  gcTime: 5 * 60 * 1000,          // 5 分钟后清理
  refetchOnWindowFocus: true,      // 窗口聚焦时刷新
  refetchInterval: 30 * 1000,      // 每 30 秒自动刷新
}

// 中等频率变化的数据（如表列表）
{
  staleTime: 5 * 60 * 1000,       // 5 分钟内新鲜
  gcTime: 10 * 60 * 1000,         // 10 分钟后清理
  refetchOnWindowFocus: true,      // 窗口聚焦时刷新
  refetchOnMount: false,           // 优先使用缓存
}

// 很少变化的数据（如系统配置）
{
  staleTime: 30 * 60 * 1000,      // 30 分钟内新鲜
  gcTime: 60 * 60 * 1000,         // 1 小时后清理
  refetchOnWindowFocus: false,     // 不自动刷新
  refetchOnMount: false,           // 优先使用缓存
}
```

### 配置说明

- **staleTime**: 数据被认为是"新鲜"的时间，在此期间不会重新请求
- **gcTime**: 缓存保留时间（原 cacheTime），超过后清理未使用的缓存
- **refetchOnWindowFocus**: 窗口重新聚焦时是否刷新
- **refetchOnMount**: 组件挂载时是否刷新
- **refetchInterval**: 自动轮询间隔

## 🔄 缓存失效策略

### 场景 1: 数据变更后刷新

```typescript
// ✅ 正确：使用 invalidateQueries
const queryClient = useQueryClient();

const handleDelete = async (id: string) => {
  await deleteTable(id);
  
  // 使表列表缓存失效，触发重新获取
  await queryClient.invalidateQueries({ 
    queryKey: ['duckdb-tables'] 
  });
};
```

### 场景 2: 乐观更新

```typescript
// ✅ 正确：乐观更新
const mutation = useMutation({
  mutationFn: updateTable,
  onMutate: async (newData) => {
    // 取消正在进行的查询
    await queryClient.cancelQueries({ queryKey: ['duckdb-tables'] });
    
    // 保存旧数据
    const previousData = queryClient.getQueryData(['duckdb-tables']);
    
    // 乐观更新
    queryClient.setQueryData(['duckdb-tables'], (old) => {
      return old.map(table => 
        table.id === newData.id ? newData : table
      );
    });
    
    return { previousData };
  },
  onError: (err, newData, context) => {
    // 回滚
    queryClient.setQueryData(['duckdb-tables'], context.previousData);
  },
  onSettled: () => {
    // 最终刷新
    queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] });
  },
});
```

### 场景 3: 批量失效

```typescript
// ✅ 正确：批量使缓存失效
const handleBatchOperation = async () => {
  await batchUpdate();
  
  // 使所有相关缓存失效
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] }),
    queryClient.invalidateQueries({ queryKey: ['datasources'] }),
    queryClient.invalidateQueries({ queryKey: ['query-results'] }),
  ]);
};
```

## 🚫 禁止的做法

### ❌ 禁止：传统的 fetch 模式

```typescript
// ❌ 错误：不要使用 useState + useEffect
const [data, setData] = useState([]);
const [loading, setLoading] = useState(false);

useEffect(() => {
  setLoading(true);
  fetch('/api/tables')
    .then(res => res.json())
    .then(setData)
    .finally(() => setLoading(false));
}, []);

// ✅ 正确：使用 TanStack Query
const { data, isLoading } = useQuery({
  queryKey: ['duckdb-tables'],
  queryFn: getDuckDBTables,
});
```

### ❌ 禁止：重复定义 queryKey

```typescript
// ❌ 错误：在多个地方硬编码 queryKey
// ComponentA.tsx
useQuery({ queryKey: ['tables'], ... });

// ComponentB.tsx
useQuery({ queryKey: ['tables'], ... });

// ✅ 正确：使用常量
// hooks/useTables.ts
export const TABLES_QUERY_KEY = ['duckdb-tables'] as const;

// ComponentA.tsx
useQuery({ queryKey: TABLES_QUERY_KEY, ... });

// ComponentB.tsx
useQuery({ queryKey: TABLES_QUERY_KEY, ... });
```

### ❌ 禁止：忽略缓存失效

```typescript
// ❌ 错误：数据变更后不刷新
const handleUpload = async (file) => {
  await uploadFile(file);
  // 没有刷新表列表！用户看不到新上传的表
};

// ✅ 正确：数据变更后刷新
const handleUpload = async (file) => {
  await uploadFile(file);
  await queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] });
};
```

### ❌ 禁止：过度刷新

```typescript
// ❌ 错误：频繁调用 refetch
useEffect(() => {
  const interval = setInterval(() => {
    refetch(); // 每秒刷新一次，太频繁！
  }, 1000);
  return () => clearInterval(interval);
}, []);

// ✅ 正确：使用 refetchInterval 配置
useQuery({
  queryKey: ['duckdb-tables'],
  queryFn: getDuckDBTables,
  refetchInterval: 30 * 1000, // 30 秒自动刷新
});
```

## 📁 文件组织规范

### 目录结构

```
frontend/src/new/
├── hooks/
│   ├── useDuckDBTables.ts      # 表列表查询 hook
│   ├── useDatasources.ts       # 数据源查询 hook
│   ├── useQueryWorkspace.ts    # 查询工作台状态
│   └── README.md               # Hook 使用文档
├── services/
│   └── apiClient.ts            # API 调用函数
└── components/
    └── ...
```

### Hook 文件模板

```typescript
// frontend/src/new/hooks/useXXX.ts

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchXXX } from '@/services/apiClient';

/**
 * XXX 数据查询 Hook
 * 
 * 特性：
 * - 自动请求去重
 * - 智能缓存（X 分钟）
 * - 提供手动刷新方法
 * 
 * 使用示例：
 * ```tsx
 * const { data, isLoading, refresh } = useXXX();
 * ```
 */

export const XXX_QUERY_KEY = ['xxx'] as const;

export const useXXX = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: XXX_QUERY_KEY,
    queryFn: fetchXXX,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: false,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: XXX_QUERY_KEY });
    return query.refetch();
  };

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    refresh,
  };
};

export const invalidateXXX = (queryClient: ReturnType<typeof useQueryClient>) => {
  return queryClient.invalidateQueries({ queryKey: XXX_QUERY_KEY });
};
```

## 📊 请求去重示例

### 场景：3 个组件同时需要表列表

```tsx
// ❌ 旧方式：发送 3 次请求
function ComponentA() {
  const [tables, setTables] = useState([]);
  useEffect(() => {
    fetch('/api/tables').then(r => r.json()).then(setTables);
  }, []);
  return <div>{tables.length}</div>;
}

function ComponentB() {
  const [tables, setTables] = useState([]);
  useEffect(() => {
    fetch('/api/tables').then(r => r.json()).then(setTables); // 重复请求！
  }, []);
  return <ul>{tables.map(t => <li>{t.name}</li>)}</ul>;
}

function ComponentC() {
  const [tables, setTables] = useState([]);
  useEffect(() => {
    fetch('/api/tables').then(r => r.json()).then(setTables); // 又一次重复请求！
  }, []);
  return <select>{tables.map(t => <option>{t.name}</option>)}</select>;
}

// ✅ 新方式：只发送 1 次请求
function ComponentA() {
  const { tables } = useDuckDBTables(); // 发起请求
  return <div>{tables.length}</div>;
}

function ComponentB() {
  const { tables } = useDuckDBTables(); // 复用请求
  return <ul>{tables.map(t => <li>{t.name}</li>)}</ul>;
}

function ComponentC() {
  const { tables } = useDuckDBTables(); // 复用请求
  return <select>{tables.map(t => <option>{t.name}</option>)}</select>;
}
```

**结果**：3 个组件，只发送 1 次 HTTP 请求！✨

## ✅ 代码审查检查清单

### 数据获取
- [ ] 是否使用了 TanStack Query 而非 useState + useEffect？
- [ ] 是否为常用数据创建了共享 hook？
- [ ] queryKey 是否使用了常量？
- [ ] queryKey 命名是否符合规范（kebab-case）？

### 缓存策略
- [ ] staleTime 是否根据数据变化频率合理设置？
- [ ] 是否配置了 refetchOnMount: false 优先使用缓存？
- [ ] 是否在数据变更后调用 invalidateQueries？

### 性能优化
- [ ] 是否避免了重复请求？
- [ ] 是否避免了过度刷新？
- [ ] 是否使用了乐观更新（如果适用）？

### 文档
- [ ] 共享 hook 是否有清晰的注释？
- [ ] 是否在 README.md 中记录了使用方法？

## 🎯 最佳实践总结

1. **统一使用 TanStack Query** - 所有服务端数据获取必须使用
2. **创建共享 Hook** - 常用数据必须创建共享 hook
3. **常量化 QueryKey** - 导出 queryKey 常量，避免硬编码
4. **合理配置缓存** - 根据数据变化频率设置 staleTime
5. **及时失效缓存** - 数据变更后调用 invalidateQueries
6. **优先使用缓存** - 设置 refetchOnMount: false
7. **完善文档** - 为共享 hook 编写使用文档

## 📚 参考资源

- [TanStack Query 官方文档](https://tanstack.com/query/latest)
- [项目 Hook 使用文档](frontend/src/new/hooks/README.md)
- [useDuckDBTables 实现](frontend/src/new/hooks/useDuckDBTables.ts)

---

**版本**: 1.0  
**创建时间**: 2024-12-04  
**适用范围**: 所有前端数据获取场景  
**状态**: ✅ 强制执行
