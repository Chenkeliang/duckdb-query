---
inclusion: fileMatch
fileMatchPattern: ['frontend/src/**/*.tsx', 'frontend/src/**/*.ts', 'frontend/src/**/*.jsx', 'frontend/src/**/*.js']
---

# 前端开发约束（2026-01 更新）

> **最后更新**: 2026-01-19  
> **版本**: 2.1  
> **状态**: ✅ 已验证与代码一致

## 🎯 前端开发原则

### 1. 技术栈约束

| 技术 | 版本 | 用途 | 状态 |
|------|------|------|------|
| React | 18 | UI 框架 | ✅ 必须 |
| TypeScript | 5.x | 类型系统 | ✅ 必须 |
| TanStack Query | 5.x | 数据获取与缓存 | ✅ 必须 |
| Shadcn/UI | Latest | UI 组件库 | ✅ 必须 |
| Tailwind CSS | 3.x | 样式框架 | ✅ 必须 |
| Lucide React | Latest | 图标库 | ✅ 必须 |
| React Hook Form | 7.x | 表单管理 | ✅ 推荐 |
| Zod | 3.x | 模式验证 | ✅ 推荐 |
| MUI | - | - | ❌ 禁止 |

### 2. 组件开发约束

#### 文件命名规范

| 类型 | 命名规则 | 示例 |
|------|----------|------|
| 组件 | PascalCase.tsx | `DataPasteCard.tsx` |
| Hook | camelCase.ts (use 前缀) | `useDuckDBTables.ts` |
| 工具函数 | camelCase.ts | `cacheInvalidation.ts` |
| 类型定义 | PascalCase.ts 或 types.ts | `QueryTypes.ts`, `types.ts` |
| 测试文件 | *.test.tsx / *.test.ts | `useDuckDBTables.test.ts` |
| 常量 | UPPER_SNAKE_CASE | `DUCKDB_TABLES_QUERY_KEY` |

#### 组件结构规范

```tsx
/**
 * 组件文档注释
 */

import * as React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// 第三方库导入
import { useQuery } from '@tanstack/react-query';

// 内部组件导入
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Hooks 导入
import { useDuckDBTables } from '@/hooks/useDuckDBTables';

// 工具函数导入
import { cn } from '@/lib/utils';

// API 导入
import { executeDuckDBSQL } from '@/api';

// 类型导入
import type { TableInfo } from '@/api/types';

// Props 类型定义
interface MyComponentProps {
  requiredProp: string;
  optionalProp?: number;
  onAction?: (data: unknown) => void;
}

export function MyComponent({
  requiredProp,
  optionalProp = 0,
  onAction,
}: MyComponentProps) {
  const { t } = useTranslation('common');

  // 状态定义
  const [state, setState] = useState<string>('');

  // 计算值
  const computedValue = useMemo(() => {
    return requiredProp + optionalProp;
  }, [requiredProp, optionalProp]);

  // 回调函数
  const handleClick = useCallback(() => {
    onAction?.(computedValue);
  }, [onAction, computedValue]);

  return (
    <Card>
      <Button onClick={handleClick}>
        {t('common.action')}
      </Button>
    </Card>
  );
}
```

### 3. 状态管理约束

#### 服务端状态（必须使用 TanStack Query）

```typescript
// ✅ 正确：使用 TanStack Query Hook
import { useDuckDBTables } from '@/hooks/useDuckDBTables';

function MyComponent() {
  const { tables, isLoading, isFetching, refresh } = useDuckDBTables();

  if (isLoading) return <div>加载中...</div>;

  return (
    <div>
      <button onClick={refresh} disabled={isFetching}>
        {isFetching ? '刷新中...' : '刷新'}
      </button>
      <ul>
        {tables.map(table => (
          <li key={table.name}>{table.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

```typescript
// ❌ 错误：使用 useState + useEffect 管理服务端数据
function MyComponent() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('/api/duckdb/tables')
      .then(res => res.json())
      .then(data => setTables(data.tables))
      .finally(() => setLoading(false));
  }, []);
  // ...
}
```

#### 客户端状态（使用 useState/useReducer）

```typescript
// ✅ 正确：使用 useState 管理 UI 状态
function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {/* ... */}
    </Dialog>
  );
}
```

### 4. API 调用约束

#### 必须使用 API 模块

```typescript
// ✅ 正确：使用 API 模块
import { executeDuckDBSQL, getDuckDBTables } from '@/api';

const result = await executeDuckDBSQL({ sql, isPreview: true });
const tables = await getDuckDBTables();

// ❌ 错误：直接使用 fetch
const response = await fetch('/api/duckdb/tables');
```

#### 缓存刷新

```typescript
// ✅ 正确：使用缓存失效工具
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAfterTableCreate } from '@/utils/cacheInvalidation';

const queryClient = useQueryClient();
await invalidateAfterTableCreate(queryClient);

// ❌ 错误：直接调用 invalidateQueries
queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] });
```

### 5. 国际化约束

```typescript
// ✅ 正确：使用 i18n
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('common');
  return <Button>{t('actions.submit')}</Button>;
}

// ❌ 错误：硬编码文本
function MyComponent() {
  return <Button>提交</Button>;
}
```

### 6. 性能优化约束

```typescript
// ✅ 正确：使用 useMemo 缓存计算结果
const sortedData = useMemo(() => {
  return [...data].sort((a, b) => a - b);
}, [data]);

// ✅ 正确：使用 useCallback 稳定回调
const handleClick = useCallback(() => {
  setCount(c => c + 1);
}, []);

// ✅ 正确：使用 React.memo 优化
export const TableRow = memo(function TableRow({ data, onSelect }: TableRowProps) {
  return <tr onClick={() => onSelect(data.id)}>{/* ... */}</tr>;
});
```

### 7. 导入顺序规范

```typescript
// 1. React 相关
import * as React from 'react';
import { useState, useEffect } from 'react';

// 2. 第三方库
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

// 3. 内部组件
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// 4. Hooks
import { useDuckDBTables } from '@/hooks/useDuckDBTables';

// 5. 工具函数
import { cn } from '@/lib/utils';
import { invalidateAfterTableCreate } from '@/utils/cacheInvalidation';

// 6. API
import { executeDuckDBSQL } from '@/api';

// 7. 类型
import type { TableInfo } from '@/api/types';
```

## 🚫 严格禁止的做法

### 1. 禁止混用技术栈

```typescript
// ❌ 错误：使用 MUI
import { Button } from '@mui/material';

// ✅ 正确：使用 Shadcn/UI
import { Button } from '@/components/ui/button';
```

### 2. 禁止传统数据获取模式

```typescript
// ❌ 错误：useState + useEffect
const [data, setData] = useState([]);
useEffect(() => {
  fetch('/api/data').then(r => r.json()).then(setData);
}, []);

// ✅ 正确：TanStack Query
const { data } = useQuery({
  queryKey: ['data'],
  queryFn: fetchData,
});
```

### 3. 禁止忽略类型

```typescript
// ❌ 错误：使用 any
function processData(data: any) {
  return data.map((item: any) => item.value);
}

// ✅ 正确：明确类型
interface DataItem { value: number; }
function processData(data: DataItem[]): number[] {
  return data.map(item => item.value);
}
```

### 4. 禁止硬编码

```typescript
// ❌ 错误：硬编码文本
<Button>提交</Button>

// ✅ 正确：使用 i18n
<Button>{t('actions.submit')}</Button>

// ❌ 错误：硬编码颜色
<div style={{ color: '#3b82f6' }}>文本</div>

// ✅ 正确：使用 Tailwind 类
<div className="text-primary">文本</div>
```

### 5. 禁止直接使用 fetch

```typescript
// ❌ 错误
fetch('/api/duckdb/tables');

// ✅ 正确
import { getDuckDBTables } from '@/api';
const tables = await getDuckDBTables();
```

## 📁 关键组件参考

### 核心组件

| 组件 | 路径 | 用途 |
|------|------|------|
| **布局** | `frontend/src/Layout/` | Sidebar, Header, PageShell |
| **查询工作台** | `frontend/src/Query/` | SQL/可视化/连接查询 |
| **结果面板** | `frontend/src/Query/ResultPanel/` | 查询结果展示 |
| **数据源面板** | `frontend/src/Query/DataSourcePanel/` | 数据源树形面板 |
| **数据源管理** | `frontend/src/DataSource/` | 数据源管理页面 |

### API 模块

| 模块 | 路径 | 用途 |
|------|------|------|
| **API 客户端** | `frontend/src/api/client.ts` | Axios 配置 |
| **查询 API** | `frontend/src/api/queryApi.ts` | 查询相关 API |
| **表 API** | `frontend/src/api/tableApi.ts` | 表相关 API |
| **数据源 API** | `frontend/src/api/dataSourceApi.ts` | 数据源相关 API |
| **类型定义** | `frontend/src/api/types.ts` | 共享类型 |

### Hooks

| Hook | 路径 | 用途 |
|------|------|------|
| **useDuckDBTables** | `frontend/src/hooks/useDuckDBTables.ts` | DuckDB 表列表 |
| **useDataSources** | `frontend/src/hooks/useDataSources.ts` | 数据源列表 |
| **useDatabaseConnections** | `frontend/src/hooks/useDatabaseConnections.ts` | 数据库连接列表 |
| **useTableColumns** | `frontend/src/hooks/useTableColumns.ts` | 表列信息 |

### 工具函数

| 工具 | 路径 | 用途 |
|------|------|------|
| **缓存失效** | `frontend/src/utils/cacheInvalidation.ts` | 缓存刷新工具 |
| **SQL 工具** | `frontend/src/utils/sqlUtils.ts` | SQL 处理工具 |

## 🔗 相关文档

- [当前项目状态](./current-project-status.md)
- [TanStack Query 使用标准](./tanstack-query-standards.md)
- [API 统一化规则](./api-unification-rules.md)
- [TypeScript API 模块标准](./typescript-api-module-standards.md)

---

**维护者**: 项目团队  
**审核周期**: 每月更新
