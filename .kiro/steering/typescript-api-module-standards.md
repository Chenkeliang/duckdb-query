---
inclusion: fileMatch
fileMatchPattern: ['frontend/src/api/**/*.ts']
---

# TypeScript API 模块使用标准（2026-01 更新）

> **最后更新**: 2026-01-19  
> **版本**: 2.0  
> **状态**: ✅ 已验证与代码一致

## 🎯 模块概述

TypeScript API 模块 (`frontend/src/api/`) 是项目前端与后端通信的统一接口层。

## 📁 模块结构

```
frontend/src/api/
├── client.ts              # Axios 客户端配置
├── types.ts               # 共享类型定义
├── queryApi.ts            # 查询相关 API
├── tableApi.ts            # 表相关 API
├── dataSourceApi.ts       # 数据源相关 API
├── fileApi.ts             # 文件相关 API
├── asyncTaskApi.ts        # 异步任务相关 API
├── pivotQueryApi.ts       # 透视查询（`/api/pivot-query/*`）及 SQL 收藏、应用配置
├── databaseSchemasApi.ts  # 外部库 schemas / 表列表 / 表详情
├── settingsShortcutsApi.ts # 设置：快捷键
└── index.ts               # 统一导出
```

## 🔧 核心模块

### 1. client.ts - Axios 客户端配置

```typescript
export const apiClient: AxiosInstance;
export const uploadClient: AxiosInstance; // 长超时，用于文件上传
export function handleApiError(error: AxiosError, defaultMessage?: string): never;
```

### 2. types.ts - 共享类型定义

```typescript
// 标准响应格式
export interface StandardSuccess<T = unknown> {
  success: true;
  data: T;
  messageCode: string;
  message: string;
  timestamp: string;
}

export interface StandardError {
  success: false;
  error: { code: string; message: string; details?: Record<string, unknown>; };
  messageCode: string;
  message: string;
  timestamp: string;
}


// 查询相关
export interface QueryResponse {
  success: boolean;
  data?: Record<string, unknown>[];
  columns?: ColumnInfo[];
  row_count?: number;
  execution_time_ms?: number;
}

// 表相关
export interface TableInfo {
  name: string;
  type: 'TABLE' | 'VIEW';
  row_count?: number;
  source_type?: string;
}

// 数据库连接
export interface DatabaseConnection {
  id: string;
  name: string;
  type: 'mysql' | 'postgresql' | 'sqlite';
  status: 'active' | 'ready' | 'idle' | 'error';
  created_at?: string;
}
```

### 3. queryApi.ts - 查询 API

```typescript
// 执行 DuckDB 本地查询
export async function executeDuckDBSQL(
  sqlOrOptions: string | ExecuteQueryOptions
): Promise<QueryResponse>;

// 执行联邦查询
export async function executeFederatedQuery(
  options: FederatedQueryOptions
): Promise<QueryResponse>;

// 保存查询结果为表
export async function saveQueryToDuckDB(
  sql: string, datasource: DataSource, tableAlias: string
): Promise<{ success: boolean; table_name?: string }>;
```

### 4. tableApi.ts - 表 API

```typescript
export async function getDuckDBTables(): Promise<TableInfo[]>;
export async function getDuckDBTableDetail(tableName: string): Promise<TableDetail>;
export async function deleteDuckDBTableEnhanced(tableName: string): Promise<ApiResponse>;
export async function refreshDuckDBTableMetadata(tableName: string): Promise<TableDetail>;
```

### 5. dataSourceApi.ts - 数据源 API

```typescript
export async function listDatabaseConnections(): Promise<{ connections: DatabaseConnection[] }>;
export async function createDatabaseConnection(data: CreateConnectionRequest): Promise<ApiResponse>;
export async function updateDatabaseConnection(id: string, data: UpdateConnectionRequest): Promise<ApiResponse>;
export async function deleteDatabaseConnection(id: string): Promise<ApiResponse>;
export async function testDatabaseConnection(data: CreateConnectionRequest): Promise<ConnectionTestResult>;
export async function refreshDatabaseConnection(id: string): Promise<RefreshResult>;
export async function pasteData(data: PasteDataRequest): Promise<PasteDataResponse>;
```

### 6. fileApi.ts - 文件 API

```typescript
export async function uploadFileToDuckDB(file: File, options?: UploadOptions): Promise<UploadResponse>;
export async function readFromUrl(url: string, options?: UrlImportOptions): Promise<UploadResponse>;
export async function inspectExcelSheets(file: File): Promise<{ sheets: SheetInfo[] }>;
export async function importExcelSheets(file: File, sheets: string[]): Promise<{ tables: string[] }>;
```

### 7. asyncTaskApi.ts - 异步任务 API

```typescript
export async function submitAsyncQuery(request: CreateTaskRequest): Promise<{ task_id: string }>;
export async function listAsyncTasks(): Promise<{ tasks: AsyncTask[] }>;
export async function getAsyncTaskStatus(taskId: string): Promise<{ task: AsyncTask }>;
export async function cancelAsyncTask(taskId: string): Promise<{ success: boolean }>;
```

## 🎯 使用示例

### 基础查询

```typescript
import { executeDuckDBSQL } from '@/api';

const result = await executeDuckDBSQL({
  sql: 'SELECT * FROM my_table LIMIT 100',
  isPreview: true
});
```

### 联邦查询

```typescript
import { executeFederatedQuery, parseFederatedQueryError } from '@/api';

try {
  const result = await executeFederatedQuery({
    sql: 'SELECT * FROM db1.table1 JOIN db2.table2 ON ...',
    attachDatabases: [
      { alias: 'db1', connectionId: 'conn1' },
      { alias: 'db2', connectionId: 'conn2' }
    ],
    timeout: 300000
  });
} catch (error) {
  const parsedError = parseFederatedQueryError(error as Error);
  toast.error(parsedError.message);
}
```

### 粘贴数据创建表

```typescript
import { pasteData } from '@/api';

const result = await pasteData({
  data: clipboardText,
  table_name: 'my_table',
  delimiter: '\t',
  has_header: true
});
```

## 🚫 禁止的做法

```typescript
// ❌ 禁止：直接使用 fetch
const response = await fetch('/api/duckdb/tables');

// ✅ 正确：使用 API 模块
import { getDuckDBTables } from '@/api';
const tables = await getDuckDBTables();

// ❌ 禁止：绕过类型系统
const result: any = await executeDuckDBSQL(sql);

// ✅ 正确：使用类型
const result: QueryResponse = await executeDuckDBSQL({ sql });
```

## 📚 相关文档

- [API 统一化规则](./api-unification-rules.md)
- [前端开发约束](./frontend-constraints.md)
- [TanStack Query 使用标准](./tanstack-query-standards.md)

---

**维护者**: 项目团队  
**审核周期**: 每月更新
