# Design Document

## Overview

本设计文档描述了前端数据源集成修复的技术方案。主要解决前端与后端统一数据源 API 的集成问题，包括数据解析、连接测试、异步任务预览跳转等多个方面。

## Architecture

### 数据流架构

```
后端 API (/api/datasources)
    │
    ▼
统一响应格式: { success, data: { items: [...] }, messageCode, message }
    │
    ▼
前端 API 客户端 (apiClient.js / requestManager.js)
    │
    ▼
数据映射层 (useDuckQuery.js / useDataSources.ts)
    │
    ▼
UI 组件 (DuckQueryApp.jsx / DataSourcePanel / etc.)
```

### 关键修复点

1. **数据源解析**：正确解析 `data.items` 而非 `connections`
2. **连接测试**：区分新密码和加密密码的测试流程
3. **异步任务预览**：跳转到正确的查询工作台
4. **Settings 页面**：创建新的设置页面组件

## Components and Interfaces

### 1. 数据源解析修复 (useDuckQuery.js)

**修改位置**: `frontend/src/hooks/useDuckQuery.js`

**修改内容**:
- 正确解析 `connectionsRes.data.items` 
- 映射 `item.subtype` 为 `type`
- 映射 `item.connection_info` 为 `params`
- 处理加密密码占位符

```javascript
// 修复前
let connections = [];
if (connectionsRes.success) {
  connections = connectionsRes.connections || [];
}

// 修复后
let connections = [];
if (connectionsRes.success) {
  const items = connectionsRes.data?.items ?? [];
  connections = items.map(item => ({
    id: item.id?.replace(/^db_/, "") || item.id,
    name: item.name,
    type: item.subtype,
    status: item.status,
    params: {
      host: item.connection_info?.host,
      port: item.connection_info?.port,
      database: item.connection_info?.database,
      username: item.connection_info?.username,
      password: item.connection_info?.password === "***ENCRYPTED***" ? "" : item.connection_info?.password,
      ...item.metadata
    }
  }));
}
```

### 2. 连接测试修复 (DuckQueryApp.jsx)

**修改位置**: `frontend/src/DuckQueryApp.jsx` - `handleTestConnection`

**修改内容**:
- 检测加密密码占位符 `***ENCRYPTED***`
- 对已保存连接使用 `refreshDatabaseConnection` API
- 对新密码使用 `testDatabaseConnection` API
- 正确读取 `result.data.connection_test.success`

```javascript
const handleTestConnection = async params => {
  let result;
  if (params.params?.password === "***ENCRYPTED***" && params.id) {
    // 使用 refresh 端点测试已保存连接
    result = await refreshDatabaseConnection(params.id);
  } else {
    // 使用 test 端点测试新密码
    result = await testDatabaseConnection({ type: params.type, params: params.params });
  }
  
  // 正确读取测试结果
  const testSuccess = result?.data?.connection_test?.success;
  const testMessage = result?.data?.connection_test?.message || result?.message;
  // ...
};
```

### 3. 异步任务预览跳转修复

**修改位置**: 
- `frontend/src/DuckQueryApp.jsx` - `onPreviewResult`
- `frontend/src/new/QueryWorkbenchPage.tsx`
- `frontend/src/new/Query/QueryWorkspace.tsx`
- `frontend/src/new/Query/QueryTabs/index.tsx`
- `frontend/src/new/Query/SQLQuery/SQLQueryPanel.tsx`

**修改内容**:
- 跳转目标从 `"sql"` 改为 `"queryworkbench"`
- 添加 `previewSQL` prop 传递链
- 在 SQLQueryPanel 中使用 useEffect 预填 SQL

### 4. Settings 页面创建

**新建文件**: `frontend/src/new/Settings/SettingsPage.tsx`

**功能**:
- 数据库设置卡片
- 界面设置卡片
- 语言设置卡片
- 安全设置卡片
- 使用 shadcn/ui 组件
- 支持 i18n

### 5. 新侧边栏数据映射修复 (useDataSources.ts)

**修改位置**: `frontend/src/new/hooks/useDataSources.ts`

**修改内容**:
- 正确解析 `query.data.data.items`
- 映射 `item.subtype` 为 `type`
- 处理加密密码显示

## Data Models

### 后端统一响应格式

```typescript
interface UnifiedResponse<T> {
  success: boolean;
  data: T;
  messageCode: string;
  message: string;
  timestamp: string;
}

interface ListResponse<T> {
  items: T[];
  total: number;
}

interface DataSourceItem {
  id: string;           // "db_xxx" 格式
  name: string;
  type: "database";
  subtype: "mysql" | "postgresql" | "sqlite";
  status: "active" | "inactive" | "error";
  connection_info: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;   // "***ENCRYPTED***" 表示已加密
  };
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}
```

### 前端连接对象格式

```typescript
interface DatabaseConnection {
  id: string;           // 不带 "db_" 前缀
  name: string;
  type: "mysql" | "postgresql" | "sqlite";
  status: string;
  params: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;   // 空字符串表示使用存储的密码
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Data Source Parsing Consistency
*For any* API response from `/api/datasources?type=database`, the frontend SHALL correctly extract all database connections from `response.data.items` and map them to the expected format.
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Encrypted Password Handling
*For any* saved connection with encrypted password (`***ENCRYPTED***`), the frontend SHALL use the refresh endpoint for testing and SHALL NOT display the encrypted placeholder in UI.
**Validates: Requirements 2.2, 7.1, 7.2**

### Property 3: Connection Test Result Parsing
*For any* connection test response, the frontend SHALL correctly read `result.data.connection_test.success` to determine test outcome.
**Validates: Requirements 2.3, 2.4, 2.5**

### Property 4: Async Task Preview Navigation
*For any* async task preview action, the system SHALL navigate to the query workbench tab and pre-fill the SQL editor without auto-executing.
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: Settings Page Accessibility
*For any* navigation to settings, the system SHALL display the settings page with organized categories.
**Validates: Requirements 5.1, 5.2, 5.3**

## Error Handling

### 数据解析错误
- 使用可选链和空值合并运算符防止 undefined 错误
- 提供默认空数组作为回退值

### 连接测试错误
- 捕获网络错误并显示友好提示
- 区分测试失败和网络错误

### 页面加载错误
- 使用 React.Suspense 和 ErrorBoundary
- 提供加载中状态和错误恢复选项

## Testing Strategy

### 单元测试
- 测试数据映射函数的正确性
- 测试加密密码检测逻辑
- 测试 previewSQL prop 传递

### 集成测试
- 测试完整的连接测试流程
- 测试异步任务预览跳转
- 测试 Settings 页面渲染

### 手动测试
1. 验证外部数据库连接能正常显示
2. 测试新建连接和已保存连接的测试功能
3. 创建异步任务并点击预览，验证跳转
4. 点击 Settings 导航，验证页面显示
5. 验证新侧边栏外部数据库节点能正常展开
