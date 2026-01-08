# require-tanstack-query

强制在新布局中使用 TanStack Query 进行服务端数据获取。

## 规则详情

此规则禁止在新布局 (`frontend/src/new/`) 中使用传统的 `useState` + `useEffect` + `fetch` 模式管理服务端数据，强制使用 TanStack Query。

### 为什么需要这个规则？

1. **请求去重**: TanStack Query 自动合并相同的请求
2. **智能缓存**: 减少不必要的网络请求
3. **数据共享**: 多个组件可以共享同一份数据
4. **更好的用户体验**: 自动处理加载状态、错误状态、重试等
5. **代码更简洁**: 减少样板代码

## 错误示例

```tsx
// ❌ 错误：使用 useState + useEffect + fetch
function MyComponent() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/duckdb/tables')
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error.message}</div>;
  return <div>{data.length} 个表</div>;
}
```

```tsx
// ❌ 错误：在组件中直接使用 useQuery（常用数据应使用共享 Hook）
function MyComponent() {
  const { data } = useQuery({
    queryKey: ['duckdb-tables'],
    queryFn: getDuckDBTables
  });

  return <div>{data?.length} 个表</div>;
}
```

```tsx
// ❌ 错误：使用 axios 但不用 TanStack Query
function MyComponent() {
  const [tables, setTables] = useState([]);

  useEffect(() => {
    axios.get('/api/duckdb/tables').then(res => {
      setTables(res.data.tables);
    });
  }, []);

  return <div>{tables.length} 个表</div>;
}
```

## 正确示例

```tsx
// ✅ 正确：使用共享 Hook
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';

function MyComponent() {
  const { tables, isLoading, error } = useDuckDBTables();

  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>错误: {error.message}</div>;
  return <div>{tables.length} 个表</div>;
}
```

```tsx
// ✅ 正确：在共享 Hook 中使用 useQuery
// frontend/src/new/hooks/useDuckDBTables.ts
import { useQuery } from '@tanstack/react-query';
import { getDuckDBTables } from '@/api';

export const DUCKDB_TABLES_QUERY_KEY = ['duckdb-tables'] as const;

export function useDuckDBTables() {
  const query = useQuery({
    queryKey: DUCKDB_TABLES_QUERY_KEY,
    queryFn: getDuckDBTables,
    staleTime: 5 * 60 * 1000,
  });

  return {
    tables: query.data?.tables ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}
```

```tsx
// ✅ 正确：组件内使用 useQuery（非常用数据）
function MyComponent({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => getUserProfile(userId),
    staleTime: 1 * 60 * 1000,
  });

  if (isLoading) return <div>加载中...</div>;
  return <div>{data?.name}</div>;
}
```

## 配置选项

```json
{
  "rules": {
    "duckquery/require-tanstack-query": ["error", {
      "allowedPaths": [
        "**/components/**",
        "**/services/**",
        "**/*.test.*"
      ],
      "sharedHookPatterns": [
        "useDuckDBTables",
        "useDataSources",
        "useDatabaseConnections"
      ]
    }]
  }
}
```

### `allowedPaths`

允许使用传统方式的文件路径模式（glob 格式）。

默认值：
```json
[
  "**/components/**",  // 旧布局
  "**/services/**",    // API 客户端
  "**/*.test.*",       // 测试文件
  "**/__tests__/**"    // 测试目录
]
```

### `sharedHookPatterns`

共享 Hook 的命名模式列表。

默认值：
```json
[
  "useDuckDBTables",
  "useDataSources",
  "useDatabaseConnections",
  "useTableColumns",
  "useSchemas",
  "useSchemaTables"
]
```

## 何时不使用此规则

- 在旧布局 (`frontend/src/components/`) 中
- 在 API 客户端模块 (`frontend/src/api/`) 中
- 在测试文件中
- 在共享 Hook 文件中（允许直接使用 `useQuery`）

## 相关规则

- `no-fetch-in-useeffect` - 禁止在 useEffect 中直接调用 API

## 参考资源

- [TanStack Query 官方文档](https://tanstack.com/query/latest)
- [项目 TanStack Query 使用标准](.kiro/steering/tanstack-query-standards.md)
- [前端 Hooks 使用指南](frontend/src/new/hooks/README.md)

## 版本

此规则在 v1.0.0 中引入。
