# TanStack Query Hooks 使用指南

本目录包含基于 TanStack Query 的数据查询 hooks，遵循项目的 [TanStack Query 使用标准规范](../../../../.kiro/steering/tanstack-query-standards.md)。

## 📋 可用 Hooks

### 1. useDuckDBTables

查询 DuckDB 表列表。

```tsx
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';

function MyComponent() {
  const { tables, isLoading, isFetching, refresh } = useDuckDBTables();

  if (isLoading) return <div>加载中...</div>;

  return (
    <div>
      <button onClick={refresh}>刷新</button>
      <ul>
        {tables.map(table => (
          <li key={table.name}>{table.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

**特性**：
- ✅ 自动请求去重
- ✅ 5 分钟智能缓存
- ✅ 优先使用缓存（refetchOnMount: false）
- ✅ 失败自动重试（2 次，指数退避）

### 2. useDataSources

查询所有数据源（包括数据库连接和文件数据源）。

```tsx
import { useDataSources } from '@/new/hooks/useDataSources';

function DataSourceList() {
  const { dataSources, total, isLoading, refresh } = useDataSources({
    type: 'database', // 可选过滤
    status: 'active'
  });

  return (
    <div>
      <h2>数据源列表 ({total})</h2>
      {dataSources.map(ds => (
        <div key={ds.id}>{ds.name}</div>
      ))}
    </div>
  );
}
```

### 3. useDatabaseConnections

查询数据库连接列表。

```tsx
import { useDatabaseConnections } from '@/new/hooks/useDataSources';

function ConnectionList() {
  const { connections, isLoading, refresh } = useDatabaseConnections();

  return (
    <div>
      {connections.map(conn => (
        <div key={conn.id}>{conn.name}</div>
      ))}
    </div>
  );
}
```

## 🔄 缓存失效（Cache Invalidation）

### 使用场景

当数据发生变更时，需要手动使缓存失效以触发重新获取：

#### 1. 异步任务完成后

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAllDataCaches } from '@/new/utils/cacheInvalidation';

function AsyncTaskList() {
  const queryClient = useQueryClient();

  const handleTaskCompleted = async () => {
    // 刷新所有相关缓存
    await invalidateAllDataCaches(queryClient);
  };

  return <AsyncTaskList onTaskCompleted={handleTaskCompleted} />;
}
```

#### 2. 文件上传后

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAfterFileUpload } from '@/new/utils/cacheInvalidation';

function FileUpload() {
  const queryClient = useQueryClient();

  const handleUpload = async (file) => {
    await uploadFile(file);
    await invalidateAfterFileUpload(queryClient);
  };

  return <button onClick={() => handleUpload(file)}>上传</button>;
}
```

#### 3. 数据库连接变更后

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAfterDatabaseChange } from '@/new/utils/cacheInvalidation';

function DatabaseForm() {
  const queryClient = useQueryClient();

  const handleSave = async (connection) => {
    await createDatabaseConnection(connection);
    await invalidateAfterDatabaseChange(queryClient);
  };

  return <form onSubmit={handleSave}>...</form>;
}
```

#### 4. 表删除后

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAfterTableDelete } from '@/new/utils/cacheInvalidation';

function TableList() {
  const queryClient = useQueryClient();

  const handleDelete = async (tableName) => {
    await deleteDuckDBTable(tableName);
    await invalidateAfterTableDelete(queryClient);
  };

  return <button onClick={() => handleDelete('my_table')}>删除</button>;
}
```

## 📊 请求去重示例

### 场景：3 个组件同时需要表列表

```tsx
// ❌ 旧方式：发送 3 次请求
function ComponentA() {
  const [tables, setTables] = useState([]);
  useEffect(() => {
    fetch('/api/duckdb_tables').then(r => r.json()).then(setTables);
  }, []);
  return <div>{tables.length}</div>;
}

function ComponentB() {
  const [tables, setTables] = useState([]);
  useEffect(() => {
    fetch('/api/duckdb_tables').then(r => r.json()).then(setTables); // 重复请求！
  }, []);
  return <ul>{tables.map(t => <li>{t.name}</li>)}</ul>;
}

function ComponentC() {
  const [tables, setTables] = useState([]);
  useEffect(() => {
    fetch('/api/duckdb_tables').then(r => r.json()).then(setTables); // 又一次重复请求！
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

## 🎯 最佳实践

### 1. 优先使用缓存

所有 hooks 默认配置了 `refetchOnMount: false`，优先使用缓存：

```tsx
// ✅ 正确：组件挂载时使用缓存
function MyComponent() {
  const { tables } = useDuckDBTables(); // 如果缓存有效，不会发起新请求
  return <div>{tables.length}</div>;
}

// ❌ 错误：每次挂载都重新请求
function MyComponent() {
  const [tables, setTables] = useState([]);
  useEffect(() => {
    fetch('/api/duckdb_tables').then(r => r.json()).then(setTables);
  }, []); // 每次挂载都请求
  return <div>{tables.length}</div>;
}
```

### 2. 数据变更后及时失效缓存

```tsx
// ✅ 正确：数据变更后刷新
const handleUpload = async (file) => {
  await uploadFile(file);
  await invalidateAfterFileUpload(queryClient);
};

// ❌ 错误：数据变更后不刷新
const handleUpload = async (file) => {
  await uploadFile(file);
  // 没有刷新！用户看不到新上传的文件
};
```

### 3. 使用 isFetching 显示后台刷新状态

```tsx
function TableList() {
  const { tables, isLoading, isFetching, refresh } = useDuckDBTables();

  if (isLoading) return <div>首次加载中...</div>;

  return (
    <div>
      <button onClick={refresh} disabled={isFetching}>
        {isFetching ? '刷新中...' : '刷新'}
      </button>
      <ul>
        {tables.map(table => <li key={table.name}>{table.name}</li>)}
      </ul>
    </div>
  );
}
```

### 4. 避免过度刷新

```tsx
// ❌ 错误：频繁调用 refetch
useEffect(() => {
  const interval = setInterval(() => {
    refetch(); // 每秒刷新一次，太频繁！
  }, 1000);
  return () => clearInterval(interval);
}, []);

// ✅ 正确：使用合理的刷新间隔或按需刷新
const handleUserAction = async () => {
  await performAction();
  await invalidateCache(queryClient); // 只在需要时刷新
};
```

## 🚫 禁止的做法

### ❌ 禁止：传统的 fetch 模式

```tsx
// ❌ 错误：不要使用 useState + useEffect
const [data, setData] = useState([]);
const [loading, setLoading] = useState(false);

useEffect(() => {
  setLoading(true);
  fetch('/api/duckdb_tables')
    .then(res => res.json())
    .then(setData)
    .finally(() => setLoading(false));
}, []);

// ✅ 正确：使用 TanStack Query
const { tables, isLoading } = useDuckDBTables();
```

### ❌ 禁止：忽略缓存失效

```tsx
// ❌ 错误：数据变更后不刷新
const handleUpload = async (file) => {
  await uploadFile(file);
  // 没有刷新表列表！用户看不到新上传的表
};

// ✅ 正确：数据变更后刷新
const handleUpload = async (file) => {
  await uploadFile(file);
  await invalidateAfterFileUpload(queryClient);
};
```

## 📚 参考资源

- [TanStack Query 官方文档](https://tanstack.com/query/latest)
- [项目 TanStack Query 使用标准规范](../../../../.kiro/steering/tanstack-query-standards.md)
- [缓存失效工具函数](../utils/cacheInvalidation.ts)

## 🎉 优势总结

### 对开发者

- 🔧 **易于使用** - 一行代码获取数据
- 📝 **易于维护** - 统一的数据获取方式
- 🧪 **易于测试** - 清晰的数据流

### 对用户

- 🚀 **更快的加载** - 智能缓存减少请求
- 🔄 **实时更新** - 数据变更自动刷新
- 💪 **更好的体验** - 减少重复请求，提升性能

### 对产品

- 📈 **性能优化** - 请求去重，减少服务器负载
- 🔄 **数据一致性** - 统一的缓存管理
- 🎨 **易于扩展** - 添加新数据源只需创建新 hook
