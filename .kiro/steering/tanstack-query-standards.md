---
inclusion: always
---
# TanStack Query 使用标准规范（2026-01 更新）

> **最后更新**: 2026-01-19  
> **版本**: 2.0  
> **状态**: ✅ 强制执行

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
// frontend/src/hooks/useDuckDBTables.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDuckDBTables } from '@/api';

export const DUCKDB_TABLES_QUERY_KEY = ['duckdb-tables'] as const;

export const useDuckDBTables = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: DUCKDB_TABLES_QUERY_KEY,
    queryFn: getDuckDBTables,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: false,
  });

  const tables = Array.isArray(query.data) ? query.data : [];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: DUCKDB_TABLES_QUERY_KEY });
    return query.refetch();
  };

  return { tables, isLoading: query.isLoading, isError: query.isError, refresh };
};


export const invalidateDuckDBTables = (queryClient: ReturnType<typeof useQueryClient>) => {
  return queryClient.invalidateQueries({ queryKey: DUCKDB_TABLES_QUERY_KEY });
};
```

### 模式 2: 组件内直接使用

对于只在单个组件使用的数据：

```typescript
import { useQuery } from '@tanstack/react-query';

function MyComponent() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-data', id],
    queryFn: () => fetchData(id),
    staleTime: 1 * 60 * 1000,
  });

  if (isLoading) return <div>加载中...</div>;
  return <div>{data}</div>;
}
```

### 模式 3: Mutation（数据变更）

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateAfterTableCreate } from '@/utils/cacheInvalidation';

function UploadComponent() {
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: uploadFile,
    onSuccess: async () => {
      await invalidateAfterTableCreate(queryClient);
      toast.success('上传成功');
    },
    onError: (error) => {
      toast.error('上传失败：' + error.message);
    },
  });

  return <button onClick={() => uploadMutation.mutate(file)}>上传</button>;
}
```

## 🔑 QueryKey 命名规范

```typescript
// ✅ 正确的命名（kebab-case）
['duckdb-tables']
['datasources']
['datasources', id]
['database-connections']
['schemas', connectionId]
['schema-tables', connectionId, schema]
['async-tasks']

// ❌ 错误的命名
['tables']           // 太泛化
['getTables']        // 不要用函数名
['duckdb_tables']    // 使用 kebab-case，不是 snake_case
```

### QueryKey 常量化

```typescript
// ✅ 正确：导出 queryKey 常量
export const DUCKDB_TABLES_QUERY_KEY = ['duckdb-tables'] as const;
export const DATASOURCES_QUERY_KEY = ['datasources'] as const;
export const DATABASE_CONNECTIONS_QUERY_KEY = ['database-connections'] as const;
```

## ⚙️ 缓存策略配置

```typescript
// 频繁变化的数据（如实时状态）
{ staleTime: 0, gcTime: 5 * 60 * 1000, refetchOnWindowFocus: true, refetchInterval: 30 * 1000 }

// 中等频率变化的数据（如表列表）
{ staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000, refetchOnWindowFocus: true, refetchOnMount: false }

// 很少变化的数据（如系统配置）
{ staleTime: 30 * 60 * 1000, gcTime: 60 * 60 * 1000, refetchOnWindowFocus: false, refetchOnMount: false }
```

## 🔄 缓存失效策略

### 使用统一的缓存失效工具

```typescript
import { useQueryClient } from '@tanstack/react-query';
import {
  invalidateAllDataCaches,
  invalidateAfterFileUpload,
  invalidateAfterTableDelete,
  invalidateAfterTableCreate,
  invalidateAfterDatabaseChange,
} from '@/utils/cacheInvalidation';

const queryClient = useQueryClient();

// 异步任务完成后
await invalidateAllDataCaches(queryClient);

// 文件上传后
await invalidateAfterFileUpload(queryClient);

// 表删除后
await invalidateAfterTableDelete(queryClient);

// 表创建后
await invalidateAfterTableCreate(queryClient);

// 数据库连接变更后
await invalidateAfterDatabaseChange(queryClient);
```

## 🚫 禁止的做法

### ❌ 禁止：传统的 fetch 模式

```typescript
// ❌ 错误
const [data, setData] = useState([]);
useEffect(() => {
  fetch('/api/tables').then(r => r.json()).then(setData);
}, []);

// ✅ 正确
const { data } = useQuery({ queryKey: ['duckdb-tables'], queryFn: getDuckDBTables });
```

### ❌ 禁止：重复定义 queryKey

```typescript
// ❌ 错误：硬编码 queryKey
useQuery({ queryKey: ['tables'], ... });

// ✅ 正确：使用常量
useQuery({ queryKey: DUCKDB_TABLES_QUERY_KEY, ... });
```

### ❌ 禁止：绕过缓存失效工具

```typescript
// ❌ 错误：直接调用 invalidateQueries
queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] });

// ✅ 正确：使用封装函数
await invalidateAfterTableCreate(queryClient);
```

## 📁 文件组织规范

```
frontend/src/
├── hooks/
│   ├── useDuckDBTables.ts      # 表列表查询 hook
│   ├── useDataSources.ts       # 数据源查询 hook
│   ├── useDatabaseConnections.ts # 数据库连接 hook
│   ├── useTableColumns.ts      # 表列信息 hook
│   ├── useSchemas.ts           # Schema 列表 hook
│   └── README.md               # Hook 使用文档
├── utils/
│   └── cacheInvalidation.ts    # 缓存失效工具
└── api/
    └── ...                     # API 调用函数
```

## ✅ 代码审查检查清单

- [ ] 是否使用了 TanStack Query 而非 useState + useEffect？
- [ ] 是否为常用数据创建了共享 hook？
- [ ] queryKey 是否使用了常量？
- [ ] queryKey 命名是否符合规范（kebab-case）？
- [ ] 是否在数据变更后调用缓存失效工具？
- [ ] 是否使用了 `@/utils/cacheInvalidation.ts` 中的函数？

---

**维护者**: 项目团队  
**审核周期**: 每月更新
