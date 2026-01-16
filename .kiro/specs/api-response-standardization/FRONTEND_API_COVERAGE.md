# 前端 API 覆盖清单

> **版本**: 1.0  
> **创建时间**: 2026-01-16  
> **状态**: ✅ 完整覆盖

---

## 📊 覆盖概览

本方案已完整覆盖前端所有 API 模块的响应处理和错误处理逻辑。

### 模块统计

| 模块 | 函数数量 | 覆盖状态 | 说明 |
|------|---------|---------|------|
| `client.ts` | 4 个工具函数 | ✅ 完整 | 核心错误处理和解包函数 |
| `asyncTaskApi.ts` | 9 个函数 | ✅ 完整 | 异步任务相关 API |
| `queryApi.ts` | 6 个函数 | ✅ 完整 | 查询相关 API |
| `tableApi.ts` | 10 个函数 | ✅ 完整 | 表相关 API |
| `dataSourceApi.ts` | 10 个函数 | ✅ 完整 | 数据源相关 API |
| `fileApi.ts` | 11 个函数 | ✅ 完整 | 文件相关 API |
| `visualQueryApi.ts` | 9 个函数 | ✅ 完整 | 可视化查询相关 API |
| **总计** | **59 个函数** | **✅ 100%** | - |

---

## 📁 详细覆盖清单

### 1. client.ts - 核心工具函数

#### 现有函数

| 函数 | 用途 | 改造方案 |
|------|------|----------|
| `apiClient` | Axios 实例 | ✅ 保持不变 |
| `uploadClient` | 上传专用实例 | ✅ 保持不变 |
| `extractMessage` | 提取错误消息 | ✅ 保持不变（兼容） |
| `handleApiError` | 错误处理 | 🔧 **升级**：支持 messageCode、blob 解析 |

#### 新增函数

| 函数 | 用途 | 优先级 |
|------|------|--------|
| `normalizeResponse<T>()` | 统一解包响应 | P0 |
| `parseBlobError()` | 解析 blob 错误 | P0 |

#### 改造详情

**handleApiError 升级**:
```typescript
// 改造前
export const handleApiError = (error: AxiosError, defaultMessage = '操作失败'): never => {
  // 只处理 detail 和 error.message
  const message = extractMessage(error.response?.data);
  throw new Error(message || defaultMessage);
};

// 改造后
export const handleApiError = (error: AxiosError, defaultMessage = '操作失败'): never => {
  const data = error.response?.data as StandardError | undefined;
  
  // 优先使用 messageCode 翻译
  if (data?.messageCode) {
    const translatedMessage = t(`errors.${data.messageCode}`);
    const finalMessage = translatedMessage !== `errors.${data.messageCode}` 
      ? translatedMessage 
      : data.message;
    
    const enhancedError = new Error(finalMessage) as ApiError;
    enhancedError.code = data.error?.code || data.messageCode;
    enhancedError.details = data.error?.details;
    throw enhancedError;
  }
  
  // 降级处理...
};
```

**normalizeResponse 新增**:
```typescript
export function normalizeResponse<T>(res: AxiosResponse): NormalizedResponse<T> {
  const { data } = res;
  
  if (!data.success) {
    throw new ApiError(data.error.code, data.error.message, data.error.details);
  }
  
  // 列表响应
  if (data.data?.items !== undefined) {
    return {
      data: data.data as T,
      items: data.data.items,
      total: data.data.total,
      page: data.data.page,
      pageSize: data.data.pageSize,
      messageCode: data.messageCode,
      message: data.message,
      timestamp: data.timestamp,
      raw: data
    };
  }
  
  // 普通响应
  return {
    data: data.data as T,
    messageCode: data.messageCode,
    message: data.message,
    timestamp: data.timestamp,
    raw: data
  };
}
```

---

### 2. asyncTaskApi.ts - 异步任务 API

#### 函数清单

| 函数 | 当前行为 | 改造方案 |
|------|----------|----------|
| `listAsyncTasks()` | `return response.data` | 使用 `normalizeResponse`，从 `items/total` 取数据 |
| `getAsyncTask()` | `return response.data` | 使用 `normalizeResponse`，从 `data` 取任务对象 |
| `submitAsyncQuery()` | `return response.data` | 使用 `normalizeResponse`，从 `data` 取 task_id |
| `cancelAsyncTask()` | `return response.data` | 使用 `normalizeResponse` |
| `retryAsyncTask()` | `return response.data` | 使用 `normalizeResponse` |
| `downloadAsyncResult()` | 返回 blob | 添加 `parseBlobError` 错误处理 |
| `getConnectionPoolStatus()` | `return response.data` | 使用 `normalizeResponse` |
| `resetConnectionPool()` | `return response.data` | 使用 `normalizeResponse` |
| `getErrorStatistics()` | `return response.data` | 使用 `normalizeResponse` |
| `clearOldErrors()` | `return response.data` | 使用 `normalizeResponse` |

#### 改造示例

```typescript
// 改造前
export async function listAsyncTasks(options: ListTasksOptions = {}): Promise<ListTasksResponse> {
  const { limit = 20, offset = 0, orderBy = 'created_at' } = options;
  const response = await apiClient.get('/api/async-tasks', {
    params: { limit, offset, order_by: orderBy }
  });
  return response.data; // 直接返回
}

// 改造后
export async function listAsyncTasks(options: ListTasksOptions = {}): Promise<ListTasksResponse> {
  const { limit = 20, offset = 0, orderBy = 'created_at' } = options;
  const response = await apiClient.get('/api/async-tasks', {
    params: { limit, offset, order_by: orderBy }
  });
  
  const { items, total } = normalizeResponse<{ items: AsyncTask[]; total: number }>(response);
  
  return {
    success: true,
    tasks: items,
    total,
  };
}
```

---

### 3. queryApi.ts - 查询 API

#### 函数清单

| 函数 | 当前行为 | 改造方案 |
|------|----------|----------|
| `executeDuckDBSQL()` | `return response.data` | 使用 `normalizeResponse`，从 `data` 取 rows/columns |
| `executeFederatedQuery()` | `return response.data` | 使用 `normalizeResponse` + 增强错误处理 |
| `parseFederatedQueryError()` | 工具函数 | ✅ 保持不变（已支持标准错误） |
| `executeExternalSQL()` | `return response.data` | 使用 `normalizeResponse` |
| `executeSQL()` | `return response.data` | 使用 `normalizeResponse` |
| `saveQueryToDuckDB()` | `return response.data` | 使用 `normalizeResponse` |

#### 改造示例

```typescript
// 改造前
export async function executeDuckDBSQL(
  sqlOrOptions: string | ExecuteQueryOptions,
  legacyOptions?: { requestId?: string; signal?: AbortSignal }
): Promise<QueryResponse> {
  // ...
  const response = await apiClient.post('/api/duckdb/execute', payload, config);
  return response.data; // 直接返回
}

// 改造后
export async function executeDuckDBSQL(
  sqlOrOptions: string | ExecuteQueryOptions,
  legacyOptions?: { requestId?: string; signal?: AbortSignal }
): Promise<QueryResponse> {
  // ...
  const response = await apiClient.post('/api/duckdb/execute', payload, config);
  
  const { data, messageCode } = normalizeResponse<QueryResponse>(response);
  
  return {
    ...data,
    messageCode, // 保留 messageCode 供 UI 使用
  };
}
```

---

### 4. tableApi.ts - 表 API

#### 函数清单

| 函数 | 当前行为 | 改造方案 |
|------|----------|----------|
| `getDuckDBTables()` | `return response.data.tables` | 使用 `normalizeResponse`，从 `items` 取表列表 |
| `fetchDuckDBTableSummaries()` | `return response.data` | 使用 `normalizeResponse`，从 `items` 取表列表 |
| `getDuckDBTableDetail()` | `return response.data` | 使用 `normalizeResponse`，从 `data` 取表详情 |
| `deleteDuckDBTable()` | `return response.data` | 使用 `normalizeResponse` |
| `deleteDuckDBTableEnhanced()` | `return response.data` | 使用 `normalizeResponse` |
| `refreshDuckDBTableMetadata()` | `return response.data` | 使用 `normalizeResponse` |
| `getExternalTableDetail()` | `return response.data` | 使用 `normalizeResponse` |
| `getAvailableTables()` | `return response.data` | 使用 `normalizeResponse`，从 `items` 取表列表 |
| `getAllTables()` | `return response.data` | 使用 `normalizeResponse`，从 `items` 取表列表 |
| `getColumnStatistics()` | `return response.data` | 使用 `normalizeResponse` |
| `getDistinctValues()` | `return response.data` | 使用 `normalizeResponse` |

#### 改造示例

```typescript
// 改造前
export async function getDuckDBTables(): Promise<TableInfo[]> {
  const response = await apiClient.get('/api/duckdb_tables');
  const payload = response.data;
  
  if (payload && Array.isArray(payload.tables)) {
    return payload.tables;
  }
  return [];
}

// 改造后
export async function getDuckDBTables(): Promise<TableInfo[]> {
  const response = await apiClient.get('/api/duckdb/tables');
  
  const { items } = normalizeResponse<{ items: TableInfo[] }>(response);
  
  return items || [];
}
```

---

### 5. dataSourceApi.ts - 数据源 API

#### 函数清单

| 函数 | 当前行为 | 改造方案 |
|------|----------|----------|
| `listDatabaseConnections()` | 部分手动从 `data.items` 取 | 使用 `normalizeResponse`，确保类型含 `messageCode/timestamp` |
| `getDatabaseConnection()` | `return response.data` | 使用 `normalizeResponse` |
| `createDatabaseConnection()` | `return response.data` | 使用 `normalizeResponse` |
| `updateDatabaseConnection()` | `return response.data` | 使用 `normalizeResponse` |
| `deleteDatabaseConnection()` | `return response.data` | 使用 `normalizeResponse` |
| `testDatabaseConnection()` | `return response.data` | 使用 `normalizeResponse` |
| `testConnection()` | `return response.data` | 使用 `normalizeResponse` |
| `refreshDatabaseConnection()` | `return response.data` | 使用 `normalizeResponse` |
| `listAllDataSources()` | `return response.data` | 使用 `normalizeResponse`，从 `items` 取数据源列表 |
| `listDatabaseDataSources()` | `return response.data` | 使用 `normalizeResponse`，从 `items` 取数据源列表 |
| `listFileDataSources()` | `return response.data` | 使用 `normalizeResponse`，从 `items` 取数据源列表 |

#### 改造示例

```typescript
// 改造前
export async function listDatabaseConnections(): Promise<{
  success: boolean;
  connections: DatabaseConnection[];
}> {
  const response = await apiClient.get('/api/datasources/databases');
  const payload = response.data;
  
  // 手动从 data.items 取
  if (payload?.data?.items) {
    return {
      success: true,
      connections: payload.data.items,
    };
  }
  
  return { success: false, connections: [] };
}

// 改造后
export async function listDatabaseConnections(): Promise<{
  success: boolean;
  connections: DatabaseConnection[];
  messageCode: string;
  timestamp: string;
}> {
  const response = await apiClient.get('/api/datasources/databases');
  
  const { items, messageCode, timestamp } = normalizeResponse<{ items: DatabaseConnection[] }>(response);
  
  return {
    success: true,
    connections: items || [],
    messageCode,
    timestamp,
  };
}
```

---

### 6. fileApi.ts - 文件 API

#### 函数清单

| 函数 | 当前行为 | 改造方案 |
|------|----------|----------|
| `uploadFile()` | `return response.data` | 使用 `normalizeResponse` |
| `uploadFileEnhanced()` | `return response.data` | 使用 `normalizeResponse` |
| `uploadFileToDuckDB()` | `return response.data` | 使用 `normalizeResponse` |
| `readFromUrl()` | `return response.data` | 使用 `normalizeResponse` |
| `getUrlInfo()` | `return response.data` | 使用 `normalizeResponse` |
| `inspectExcelSheets()` | `return response.data` | 使用 `normalizeResponse` |
| `importExcelSheets()` | `return response.data` | 使用 `normalizeResponse` |
| `getServerMounts()` | `return response.data` | 使用 `normalizeResponse`，从 `items` 取挂载点列表 |
| `browseServerDirectory()` | `return response.data` | 使用 `normalizeResponse`，从 `items` 取文件列表 |
| `importServerFile()` | `return response.data` | 使用 `normalizeResponse` |
| `inspectServerExcelSheets()` | `return response.data` | 使用 `normalizeResponse` |
| `importServerExcelSheets()` | `return response.data` | 使用 `normalizeResponse` |
| `getFilePreview()` | `return response.data` | 使用 `normalizeResponse` |

#### 改造示例

```typescript
// 改造前
export async function uploadFileToDuckDB(
  file: File,
  tableAlias: string
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('table_alias', tableAlias);
  
  const response = await uploadClient.post('/api/upload', formData);
  return response.data; // 直接返回
}

// 改造后
export async function uploadFileToDuckDB(
  file: File,
  tableAlias: string
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('table_alias', tableAlias);
  
  const response = await uploadClient.post('/api/upload', formData);
  
  const { data, messageCode } = normalizeResponse<UploadResponse>(response);
  
  return {
    ...data,
    messageCode, // 保留 messageCode 供 UI 使用
  };
}
```

---

### 7. visualQueryApi.ts - 可视化查询 API

#### 函数清单

| 函数 | 当前行为 | 改造方案 |
|------|----------|----------|
| `generateVisualQuery()` | `return response.data` | 使用 `normalizeResponse` |
| `previewVisualQuery()` | `return response.data` | 使用 `normalizeResponse` |
| `validateVisualQueryConfig()` | 客户端验证 | ✅ 保持不变（无 API 调用） |
| `listSqlFavorites()` | 手动处理 `data` 或数组 | 使用 `normalizeResponse`，从 `items` 取收藏列表 |
| `getSqlFavorite()` | `return response.data` | 使用 `normalizeResponse` |
| `createSqlFavorite()` | `return response.data` | 使用 `normalizeResponse` |
| `updateSqlFavorite()` | `return response.data` | 使用 `normalizeResponse` |
| `deleteSqlFavorite()` | `return response.data` | 使用 `normalizeResponse` |
| `incrementFavoriteUsage()` | `return response.data` | 使用 `normalizeResponse` |
| `getAppFeatures()` | `return response.data` | 使用 `normalizeResponse` |

#### 改造示例

```typescript
// 改造前
export async function listSqlFavorites(): Promise<SqlFavorite[]> {
  const response = await apiClient.get('/api/sql-favorites');
  const payload = response.data;
  
  // 手动处理多种格式
  if (payload && Array.isArray(payload.data)) {
    return payload.data as SqlFavorite[];
  }
  if (Array.isArray(payload)) {
    return payload as SqlFavorite[];
  }
  return [];
}

// 改造后
export async function listSqlFavorites(): Promise<SqlFavorite[]> {
  const response = await apiClient.get('/api/sql-favorites');
  
  const { items } = normalizeResponse<{ items: SqlFavorite[] }>(response);
  
  return items || [];
}
```

---

## 🎯 UI 层改造

### Toast 提示改造

```typescript
// 改造前
try {
  await createDatabaseConnection(data);
  toast.success('创建成功');
} catch (error) {
  toast.error(error.message);
}

// 改造后
try {
  const { messageCode } = await createDatabaseConnection(data);
  toast.success(t(`success.${messageCode}`) || '创建成功');
} catch (error) {
  if (error instanceof ApiError) {
    toast.error(t(`errors.${error.code}`) || error.message);
  }
}
```

### 表单错误提示改造

```typescript
// 改造前
catch (error) {
  setError('root', { message: error.message });
}

// 改造后
catch (error) {
  if (error instanceof ApiError) {
    // 使用 messageCode 翻译
    const message = t(`errors.${error.code}`) || error.message;
    setError('root', { message });
    
    // 如果有字段级错误
    if (error.details) {
      Object.entries(error.details).forEach(([field, msg]) => {
        setError(field, { message: msg as string });
      });
    }
  }
}
```

---

## ✅ 验收标准

### 代码层面

- [ ] 所有 API 函数使用 `normalizeResponse` 解包
- [ ] 所有错误处理使用 `handleApiError`
- [ ] 下载接口使用 `parseBlobError`
- [ ] 所有 Toast 提示使用 `messageCode` 翻译
- [ ] 所有表单错误使用 `messageCode` 翻译

### 类型层面

- [ ] 旧 `ApiResponse` 标记为 `@deprecated`
- [ ] 新增 `StandardSuccess<T>` 类型
- [ ] 新增 `StandardList<T>` 类型
- [ ] 新增 `StandardError` 类型
- [ ] 新增 `NormalizedResponse<T>` 类型

### 测试层面

- [ ] `normalizeResponse` 单元测试覆盖
- [ ] `handleApiError` 单元测试覆盖
- [ ] `parseBlobError` 单元测试覆盖
- [ ] 每个 API 模块集成测试覆盖

---

## 📊 改造优先级

### P0 - 核心基础设施（必须先做）

1. `client.ts` - 新增 `normalizeResponse` 和 `parseBlobError`
2. `client.ts` - 升级 `handleApiError`
3. `types.ts` - 新增标准类型定义

### P1 - 高频 API 模块

1. `queryApi.ts` - 查询相关（最高频）
2. `tableApi.ts` - 表相关（高频）
3. `dataSourceApi.ts` - 数据源相关（高频）

### P2 - 其他 API 模块

1. `asyncTaskApi.ts` - 异步任务
2. `fileApi.ts` - 文件上传
3. `visualQueryApi.ts` - 可视化查询

### P3 - UI 层改造

1. Toast 提示改造
2. 表单错误提示改造
3. 加载状态改造

---

## 🔗 相关文档

- [设计文档](./design.md) - 第 3 节：前端设计
- [任务清单](./tasks.md) - 阶段 3-4：前端实施
- [快速参考](./QUICK_REFERENCE.md) - 前端代码片段
- [TypeScript API 模块标准](.kiro/steering/typescript-api-module-standards.md)
- [前端开发约束](.kiro/steering/frontend-constraints.md)

---

**文档版本**: 1.0  
**最后更新**: 2026-01-16  
**维护者**: 项目团队  
**审核状态**: ✅ 完整覆盖
