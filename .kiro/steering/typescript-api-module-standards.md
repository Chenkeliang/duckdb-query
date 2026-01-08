---
inclusion: fileMatch
fileMatchPattern: ['frontend/src/api/**/*.ts']
---

# TypeScript API 模块使用标准

> **最后更新**: 2026-01-08  
> **版本**: 1.0  
> **状态**: ✅ 已验证与代码一致

## 🎯 模块概述

TypeScript API 模块 (`frontend/src/api/`) 是项目前端与后端通信的统一接口层，提供：

- ✅ **类型安全**: 完整的 TypeScript 类型定义
- ✅ **模块化**: 按功能域组织 API 函数
- ✅ **统一错误处理**: 标准化的错误处理机制
- ✅ **可配置**: 支持超时、请求 ID、信号等配置
- ✅ **易于测试**: 纯函数设计，易于单元测试

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
├── visualQueryApi.ts      # 可视化查询相关 API
└── index.ts               # 统一导出
```

## 🔧 核心模块

### 1. client.ts - Axios 客户端配置

#### 功能

- Axios 实例配置
- 基础 URL 管理
- 超时配置
- 错误处理工具

#### 导出内容

```typescript
// Axios 实例
export const apiClient: AxiosInstance;
export const uploadClient: AxiosInstance; // 长超时，用于文件上传

// 配置
export const baseURL: string;
export function setFederatedQueryTimeout(ms: number): void;
export function getFederatedQueryTimeout(): number;

// 工具函数
export function extractMessage(payload: unknown): string;
export function handleApiError(error: AxiosError, defaultMessage?: string): never;

// 类型
export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: Record<string, unknown>;
}
```

#### 使用示例

```typescript
import { apiClient, handleApiError } from '@/api/client';

try {
  const response = await apiClient.get('/api/data');
  return response.data;
} catch (error) {
  throw handleApiError(error as never, '获取数据失败');
}
```

### 2. types.ts - 共享类型定义

#### 核心类型

```typescript
// 通用响应
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

// 查询相关
export interface QueryRequest {
  sql: string;
  datasource?: DataSource;
  is_preview?: boolean;
  save_as_table?: string;
}

export interface QueryResponse {
  success: boolean;
  data?: Record<string, unknown>[];
  columns?: ColumnInfo[];
  row_count?: number;
  execution_time_ms?: number;
  error?: QueryError;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable?: boolean;
}

// 数据源相关
export interface DataSource {
  id?: string;
  type: 'duckdb' | 'mysql' | 'postgresql' | 'sqlite' | 'file';
  name?: string;
}

export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite';

export interface DatabaseConnection {
  id: string;
  name: string;
  type: DatabaseType;
  status: 'active' | 'ready' | 'idle' | 'error';
  created_at?: string;
  updated_at?: string;
  requiresPassword?: boolean;
  params: DatabaseConnectionParams;
}

// 表相关
export interface TableInfo {
  name: string;
  type: 'TABLE' | 'VIEW';
  row_count?: number;
  source_type?: string;
  schema?: string;
}

export interface TableDetail {
  table_name: string;
  columns: ColumnInfo[];
  column_count: number;
  row_count: number;
  sample_data?: Record<string, unknown>[];
}

// 异步任务相关
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AsyncTask {
  id: string;
  name?: string;
  status: TaskStatus;
  progress?: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  result?: TaskResult;
}
```

### 3. queryApi.ts - 查询 API

#### 功能

- DuckDB 本地查询
- 联邦查询（ATTACH 外部数据库）
- 外部数据库查询
- 查询结果保存

#### 主要函数

```typescript
/**
 * 执行 DuckDB 本地查询
 */
export async function executeDuckDBSQL(
  sqlOrOptions: string | ExecuteQueryOptions,
  legacyOptions?: { requestId?: string; signal?: AbortSignal }
): Promise<QueryResponse>;

/**
 * 执行联邦查询
 */
export async function executeFederatedQuery(
  options: FederatedQueryOptions
): Promise<QueryResponse>;

/**
 * 执行外部数据库查询
 */
export async function executeExternalSQL(
  sql: string,
  datasource: DataSource,
  isPreview?: boolean
): Promise<QueryResponse>;

/**
 * 保存查询结果为表
 */
export async function saveQueryToDuckDB(
  sql: string,
  datasource: DataSource,
  tableAlias: string,
  queryData?: Record<string, unknown>[] | null
): Promise<{ success: boolean; table_name?: string; message?: string }>;

/**
 * 解析联邦查询错误
 */
export function parseFederatedQueryError(error: Error): {
  type: 'connection' | 'authentication' | 'timeout' | 'network' | 'query';
  message: string;
  connectionId?: string;
  connectionName?: string;
  host?: string;
};
```

#### 使用示例

```typescript
import {
  executeDuckDBSQL,
  executeFederatedQuery,
  parseFederatedQueryError
} from '@/api';

// 本地查询
const result = await executeDuckDBSQL({
  sql: 'SELECT * FROM my_table LIMIT 100',
  isPreview: true
});

// 联邦查询
try {
  const result = await executeFederatedQuery({
    sql: 'SELECT * FROM db1.table1 JOIN db2.table2 ON ...',
    attachDatabases: [
      { alias: 'db1', connectionId: 'conn1' },
      { alias: 'db2', connectionId: 'conn2' }
    ],
    timeout: 300000 // 5 分钟
  });
} catch (error) {
  const parsedError = parseFederatedQueryError(error as Error);
  
  switch (parsedError.type) {
    case 'connection':
      toast.error(`连接失败: ${parsedError.connectionName}`);
      break;
    case 'authentication':
      toast.error('认证失败');
      break;
    case 'timeout':
      toast.error(`连接超时: ${parsedError.host}`);
      break;
  }
}

// 保存查询结果
await saveQueryToDuckDB(
  'SELECT * FROM source_table',
  { type: 'duckdb' },
  'new_table_name'
);
```

### 4. tableApi.ts - 表 API

#### 功能

- DuckDB 表管理
- 外部数据库表查询
- 表详情获取
- 列统计信息

#### 主要函数

```typescript
/**
 * 获取 DuckDB 表列表
 */
export async function getDuckDBTables(): Promise<TableInfo[]>;

/**
 * 获取 DuckDB 表摘要（新端点）
 */
export async function fetchDuckDBTableSummaries(): Promise<{
  success: boolean;
  tables: TableInfo[];
}>;

/**
 * 获取表详情
 */
export async function getDuckDBTableDetail(tableName: string): Promise<TableDetail>;

/**
 * 删除表
 */
export async function deleteDuckDBTableEnhanced(tableName: string): Promise<ApiResponse>;

/**
 * 刷新表元数据
 */
export async function refreshDuckDBTableMetadata(tableName: string): Promise<TableDetail>;

/**
 * 获取外部表详情
 */
export async function getExternalTableDetail(
  connectionId: string,
  tableName: string,
  schema?: string
): Promise<TableDetail>;

/**
 * 获取列统计信息
 */
export async function getColumnStatistics(
  tableName: string,
  columnName: string
): Promise<{
  success: boolean;
  statistics: {
    min?: number | string;
    max?: number | string;
    count: number;
    distinct_count: number;
    null_count: number;
  };
}>;
```

#### 使用示例

```typescript
import {
  getDuckDBTables,
  getDuckDBTableDetail,
  deleteDuckDBTableEnhanced,
  getColumnStatistics
} from '@/api';

// 获取表列表
const tables = await getDuckDBTables();

// 获取表详情
const detail = await getDuckDBTableDetail('my_table');
console.log(detail.columns); // 列信息
console.log(detail.sample_data); // 示例数据

// 删除表
await deleteDuckDBTableEnhanced('my_table');

// 获取列统计
const stats = await getColumnStatistics('my_table', 'age');
console.log(stats.statistics.min); // 最小值
console.log(stats.statistics.max); // 最大值
console.log(stats.statistics.distinct_count); // 去重数量
```

### 5. dataSourceApi.ts - 数据源 API

#### 功能

- 数据库连接 CRUD
- 连接测试
- 连接刷新
- 数据源列表

#### 主要函数

```typescript
/**
 * 获取数据库连接列表
 */
export async function listDatabaseConnections(): Promise<{
  success: boolean;
  connections: DatabaseConnection[];
}>;

/**
 * 创建数据库连接
 */
export async function createDatabaseConnection(
  connectionData: CreateConnectionRequest
): Promise<ApiResponse<{ connection: DatabaseConnection }>>;

/**
 * 更新数据库连接
 */
export async function updateDatabaseConnection(
  connectionId: string,
  connectionData: UpdateConnectionRequest
): Promise<ApiResponse<{ connection: DatabaseConnection }>>;

/**
 * 删除数据库连接
 */
export async function deleteDatabaseConnection(
  connectionId: string
): Promise<ApiResponse>;

/**
 * 测试数据库连接
 */
export async function testDatabaseConnection(
  connectionData: CreateConnectionRequest
): Promise<ConnectionTestResult>;

/**
 * 刷新数据库连接
 */
export async function refreshDatabaseConnection(
  connectionId: string
): Promise<{
  success: boolean;
  message?: string;
  connection?: DatabaseConnection;
  test_result?: ConnectionTestResult;
}>;

/**
 * 获取所有数据源（文件 + 数据库）
 */
export async function listAllDataSources(
  filters?: DataSourceFilter
): Promise<ApiResponse>;
```

#### 使用示例

```typescript
import {
  listDatabaseConnections,
  createDatabaseConnection,
  testDatabaseConnection,
  refreshDatabaseConnection
} from '@/api';

// 获取连接列表
const { connections } = await listDatabaseConnections();

// 测试新连接
const testResult = await testDatabaseConnection({
  type: 'mysql',
  name: 'My MySQL',
  params: {
    host: 'localhost',
    port: 3306,
    database: 'mydb',
    username: 'user',
    password: 'pass'
  }
});

if (testResult.success) {
  // 创建连接
  await createDatabaseConnection({
    type: 'mysql',
    name: 'My MySQL',
    params: { /* ... */ }
  });
}

// 刷新连接
const refreshResult = await refreshDatabaseConnection('conn-id');
console.log(refreshResult.test_result?.latency_ms); // 延迟
```

### 6. fileApi.ts - 文件 API

#### 功能

- 文件上传
- URL 导入
- Excel 表格检查
- 服务器文件浏览

#### 主要函数

```typescript
/**
 * 上传文件到 DuckDB
 */
export async function uploadFileToDuckDB(
  file: File,
  options?: {
    tableName?: string;
    onProgress?: (progress: UploadProgress) => void;
  }
): Promise<UploadResponse>;

/**
 * 从 URL 读取文件
 */
export async function readFromUrl(
  url: string,
  options?: {
    tableName?: string;
    fileType?: string;
  }
): Promise<UploadResponse>;

/**
 * 检查 Excel 表格
 */
export async function inspectExcelSheets(
  file: File
): Promise<{
  success: boolean;
  sheets: Array<{ name: string; row_count: number }>;
}>;

/**
 * 导入 Excel 表格
 */
export async function importExcelSheets(
  file: File,
  sheets: string[],
  tablePrefix?: string
): Promise<{
  success: boolean;
  tables: string[];
}>;
```

### 7. asyncTaskApi.ts - 异步任务 API

#### 功能

- 任务提交
- 任务状态查询
- 任务取消
- 任务结果下载

#### 主要函数

```typescript
/**
 * 提交异步查询任务
 */
export async function submitAsyncQuery(
  request: CreateTaskRequest
): Promise<{
  success: boolean;
  task_id: string;
}>;

/**
 * 获取任务列表
 */
export async function listAsyncTasks(): Promise<{
  success: boolean;
  tasks: AsyncTask[];
}>;

/**
 * 获取任务状态
 */
export async function getAsyncTaskStatus(
  taskId: string
): Promise<{
  success: boolean;
  task: AsyncTask;
}>;

/**
 * 取消任务
 */
export async function cancelAsyncTask(
  taskId: string
): Promise<{
  success: boolean;
  message?: string;
}>;

/**
 * 下载任务结果
 */
export async function downloadTaskResult(
  taskId: string,
  format: 'csv' | 'parquet'
): Promise<Blob>;
```

## 🎯 使用模式

### 模式 1: 基础查询

```typescript
import { executeDuckDBSQL } from '@/api';

async function runQuery(sql: string) {
  try {
    const result = await executeDuckDBSQL({
      sql,
      isPreview: true
    });

    console.log(`查询返回 ${result.row_count} 行`);
    console.log(`执行时间: ${result.execution_time_ms}ms`);
    
    return result.data;
  } catch (error) {
    console.error('查询失败:', error.message);
    throw error;
  }
}
```

### 模式 2: 带取消的查询

```typescript
import { executeDuckDBSQL } from '@/api';

function QueryComponent() {
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const runQuery = async (sql: string) => {
    // 取消之前的查询
    abortControllerRef.current?.abort();
    
    // 创建新的 AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsRunning(true);
    try {
      const result = await executeDuckDBSQL({
        sql,
        isPreview: true,
        signal: controller.signal
      });
      
      return result;
    } catch (error) {
      if (error.name === 'CanceledError') {
        console.log('查询已取消');
      } else {
        throw error;
      }
    } finally {
      setIsRunning(false);
    }
  };

  const cancelQuery = () => {
    abortControllerRef.current?.abort();
  };

  return (
    <div>
      <button onClick={() => runQuery(sql)} disabled={isRunning}>
        执行查询
      </button>
      {isRunning && (
        <button onClick={cancelQuery}>取消</button>
      )}
    </div>
  );
}
```

### 模式 3: 联邦查询

```typescript
import { executeFederatedQuery, parseFederatedQueryError } from '@/api';
import { toast } from 'sonner';

async function runFederatedQuery(
  sql: string,
  databases: Array<{ alias: string; connectionId: string }>
) {
  try {
    const result = await executeFederatedQuery({
      sql,
      attachDatabases: databases,
      isPreview: true,
      timeout: 300000 // 5 分钟
    });

    return result;
  } catch (error) {
    const parsedError = parseFederatedQueryError(error as Error);
    
    // 根据错误类型显示不同的提示
    switch (parsedError.type) {
      case 'connection':
        toast.error(`无法连接到数据库: ${parsedError.connectionName}`);
        break;
      case 'authentication':
        toast.error('数据库认证失败，请检查用户名和密码');
        break;
      case 'timeout':
        toast.error(`连接超时: ${parsedError.host}`);
        break;
      case 'network':
        toast.error('网络连接失败，请检查数据库服务是否可用');
        break;
      case 'query':
        toast.error(`查询错误: ${parsedError.message}`);
        break;
    }
    
    throw error;
  }
}
```

### 模式 4: 文件上传带进度

```typescript
import { uploadFileToDuckDB } from '@/api';

function FileUpload() {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setProgress(0);

    try {
      const result = await uploadFileToDuckDB(file, {
        tableName: 'my_table',
        onProgress: (p) => {
          setProgress(p.percent);
        }
      });

      toast.success(`文件上传成功，表名: ${result.table_name}`);
    } catch (error) {
      toast.error(`上传失败: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        disabled={isUploading}
      />
      {isUploading && (
        <div>
          <progress value={progress} max={100} />
          <span>{progress}%</span>
        </div>
      )}
    </div>
  );
}
```

## 🚫 禁止的做法

### ❌ 禁止：直接使用 fetch

```typescript
// ❌ 错误
const response = await fetch('/api/duckdb/tables');
const data = await response.json();

// ✅ 正确
import { getDuckDBTables } from '@/api';
const tables = await getDuckDBTables();
```

### ❌ 禁止：绕过类型系统

```typescript
// ❌ 错误
const result: any = await executeDuckDBSQL(sql);

// ✅ 正确
const result: QueryResponse = await executeDuckDBSQL({ sql });
```

### ❌ 禁止：忽略错误处理

```typescript
// ❌ 错误
const result = await executeDuckDBSQL({ sql });
// 没有 try-catch

// ✅ 正确
try {
  const result = await executeDuckDBSQL({ sql });
} catch (error) {
  toast.error(`查询失败: ${error.message}`);
}
```

## 📚 相关文档

- [API 统一化规则](./api-unification-rules.md)
- [前端开发约束](./frontend-constraints.md)
- [TanStack Query 使用标准](./tanstack-query-standards.md)

---

**维护者**: 项目团队  
**审核周期**: 每月更新  
**反馈渠道**: 项目 Issue 或 PR
