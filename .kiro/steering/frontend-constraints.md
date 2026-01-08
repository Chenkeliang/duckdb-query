---
inclusion: fileMatch
fileMatchPattern: ['frontend/src/**/*.tsx', 'frontend/src/**/*.ts', 'frontend/src/**/*.jsx', 'frontend/src/**/*.js']
---

# 前端开发约束（2026-01 更新）

> **最后更新**: 2026-01-08  
> **版本**: 2.0  
> **状态**: ✅ 已验证与代码一致

## 🎯 前端开发原则

### 1. 技术栈约束

#### 新布局（`frontend/src/new/`）- 强制规范

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
 * 
 * 功能描述
 * 
 * @example
 * ```tsx
 * <MyComponent prop1="value" />
 * ```
 */

import * as React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// 第三方库导入
import { useQuery } from '@tanstack/react-query';

// 内部组件导入
import { Button } from '@/new/components/ui/button';
import { Card } from '@/new/components/ui/card';

// 工具函数导入
import { cn } from '@/lib/utils';

// 类型导入
import type { TableInfo } from '@/api/types';

// Props 类型定义
interface MyComponentProps {
  /** 必需属性说明 */
  requiredProp: string;
  /** 可选属性说明 */
  optionalProp?: number;
  /** 回调函数说明 */
  onAction?: (data: unknown) => void;
}

/**
 * 组件实现
 */
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

  // 副作用
  useEffect(() => {
    // 清理函数
    return () => {
      // cleanup
    };
  }, []);

  return (
    <Card>
      <Button onClick={handleClick}>
        {t('common.action')}
      </Button>
    </Card>
  );
}
```

#### Props 设计规范

```typescript
// ✅ 正确：明确的 Props 类型定义
interface DatabaseFormProps {
  /** 初始数据（可选） */
  initialData?: DatabaseConfig;
  /** 是否加载中 */
  isLoading?: boolean;
  /** 提交回调 */
  onSubmit: (data: DatabaseConfig) => void;
  /** 取消回调（可选） */
  onCancel?: () => void;
}

// ✅ 正确：使用 Pick/Omit 复用类型
interface EditFormProps extends Pick<DatabaseFormProps, 'onSubmit' | 'onCancel'> {
  connectionId: string;
}

// ❌ 错误：没有类型定义
function MyComponent(props) {
  // ...
}

// ❌ 错误：使用 any
interface BadProps {
  data: any; // 应该明确类型
}
```

### 3. 状态管理约束

#### 服务端状态（必须使用 TanStack Query）

```typescript
// ✅ 正确：使用 TanStack Query Hook
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';

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

// ✅ 正确：使用 useReducer 管理复杂状态
type State = {
  step: number;
  data: Record<string, unknown>;
  errors: Record<string, string>;
};

type Action =
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'UPDATE_DATA'; payload: Record<string, unknown> }
  | { type: 'SET_ERROR'; payload: { field: string; error: string } };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'NEXT_STEP':
      return { ...state, step: state.step + 1 };
    case 'PREV_STEP':
      return { ...state, step: state.step - 1 };
    case 'UPDATE_DATA':
      return { ...state, data: { ...state.data, ...action.payload } };
    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.payload.field]: action.payload.error }
      };
    default:
      return state;
  }
}

function WizardForm() {
  const [state, dispatch] = useReducer(reducer, {
    step: 1,
    data: {},
    errors: {},
  });

  // ...
}
```

### 4. 用户体验约束

#### 加载状态

```typescript
// ✅ 正确：明确的加载状态
function MyComponent() {
  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['data'],
    queryFn: fetchData,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">加载中...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-destructive p-4">
        错误: {error.message}
      </div>
    );
  }

  return (
    <div>
      {isFetching && <div className="text-muted-foreground">刷新中...</div>}
      {/* 数据展示 */}
    </div>
  );
}
```

#### 错误提示

```typescript
// ✅ 正确：用户友好的错误提示
import { toast } from 'sonner';

async function handleSubmit(data: FormData) {
  try {
    await submitData(data);
    toast.success('保存成功');
  } catch (error) {
    if (error instanceof ApiError) {
      switch (error.code) {
        case 'VALIDATION_ERROR':
          toast.error('数据验证失败，请检查输入');
          break;
        case 'CONNECTION_TIMEOUT':
          toast.error('连接超时，请检查网络');
          break;
        default:
          toast.error(`操作失败: ${error.message}`);
      }
    } else {
      toast.error('未知错误，请稍后重试');
    }
  }
}
```

#### 响应式设计

```tsx
// ✅ 正确：使用 Tailwind 响应式类
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => (
    <Card key={item.id} className="p-4">
      {/* 内容 */}
    </Card>
  ))}
</div>

// ✅ 正确：使用媒体查询 Hook
import { useMediaQuery } from '@/new/hooks/useMediaQuery';

function MyComponent() {
  const isMobile = useMediaQuery('(max-width: 768px)');

  return (
    <div>
      {isMobile ? <MobileView /> : <DesktopView />}
    </div>
  );
}
```

#### 国际化支持

```typescript
// ✅ 正确：使用 i18n
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('common');

  return (
    <div>
      <h1>{t('welcome.title')}</h1>
      <p>{t('welcome.description')}</p>
      <Button>{t('actions.submit')}</Button>
    </div>
  );
}

// ❌ 错误：硬编码文本
function MyComponent() {
  return (
    <div>
      <h1>欢迎</h1>
      <Button>提交</Button>
    </div>
  );
}
```

### 5. 性能优化约束

#### 组件优化

```typescript
// ✅ 正确：使用 React.memo 优化
import { memo } from 'react';

interface TableRowProps {
  data: Record<string, unknown>;
  onSelect: (id: string) => void;
}

export const TableRow = memo(function TableRow({ data, onSelect }: TableRowProps) {
  return (
    <tr onClick={() => onSelect(data.id as string)}>
      {/* ... */}
    </tr>
  );
});

// ✅ 正确：使用 useMemo 缓存计算结果
function MyComponent({ data }: { data: number[] }) {
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a - b);
  }, [data]);

  return <div>{sortedData.join(', ')}</div>;
}

// ✅ 正确：使用 useCallback 稳定回调
function MyComponent() {
  const [count, setCount] = useState(0);

  const handleClick = useCallback(() => {
    setCount(c => c + 1);
  }, []); // 依赖为空，回调稳定

  return <ChildComponent onClick={handleClick} />;
}
```

#### 懒加载

```typescript
// ✅ 正确：使用 React.lazy 懒加载大组件
import { lazy, Suspense } from 'react';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

function MyComponent() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <HeavyComponent />
    </Suspense>
  );
}

// ✅ 正确：使用动态导入
async function loadModule() {
  const module = await import('./heavy-module');
  return module.default();
}
```

#### 避免不必要的重渲染

```typescript
// ✅ 正确：使用 key 优化列表渲染
function MyList({ items }: { items: Item[] }) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}

// ❌ 错误：使用 index 作为 key
function MyList({ items }: { items: Item[] }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>{item.name}</li>
      ))}
    </ul>
  );
}

// ✅ 正确：避免在 render 中创建新对象
function MyComponent() {
  const config = useMemo(() => ({
    option1: true,
    option2: false,
  }), []);

  return <ChildComponent config={config} />;
}

// ❌ 错误：每次 render 创建新对象
function MyComponent() {
  return <ChildComponent config={{ option1: true, option2: false }} />;
}
```

#### 内存管理

```typescript
// ✅ 正确：清理副作用
function MyComponent() {
  useEffect(() => {
    const timer = setInterval(() => {
      console.log('tick');
    }, 1000);

    // 清理函数
    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      console.log('resize');
    };

    window.addEventListener('resize', handleResize);

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <div>...</div>;
}
```

### 6. 代码规范约束

#### 导入顺序

```typescript
// ✅ 正确：按类别组织导入
// 1. React 相关
import * as React from 'react';
import { useState, useEffect } from 'react';

// 2. 第三方库
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

// 3. 内部组件
import { Button } from '@/new/components/ui/button';
import { Card } from '@/new/components/ui/card';

// 4. Hooks
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';

// 5. 工具函数
import { cn } from '@/lib/utils';
import { formatDate } from '@/new/utils/dateUtils';

// 6. 类型
import type { TableInfo } from '@/api/types';

// 7. 样式（如果有）
import './styles.css';
```

#### 注释规范

```typescript
/**
 * 函数文档注释
 * 
 * 详细描述函数的功能、参数、返回值
 * 
 * @param param1 - 参数1说明
 * @param param2 - 参数2说明
 * @returns 返回值说明
 * 
 * @example
 * ```typescript
 * const result = myFunction('value1', 123);
 * ```
 */
export function myFunction(param1: string, param2: number): string {
  // 单行注释：解释复杂逻辑
  const result = param1.repeat(param2);

  /* 
   * 多行注释：
   * 解释更复杂的逻辑块
   */
  if (result.length > 100) {
    return result.slice(0, 100);
  }

  return result;
}

// ✅ 正确：为复杂逻辑添加注释
function complexCalculation(data: number[]): number {
  // 步骤 1: 过滤负数
  const positive = data.filter(n => n > 0);

  // 步骤 2: 计算平均值
  const avg = positive.reduce((sum, n) => sum + n, 0) / positive.length;

  // 步骤 3: 计算标准差
  const variance = positive.reduce((sum, n) => sum + Math.pow(n - avg, 2), 0) / positive.length;
  const stdDev = Math.sqrt(variance);

  return stdDev;
}

// ❌ 错误：无意义的注释
function add(a: number, b: number): number {
  // 返回 a + b
  return a + b; // 这种注释没有价值
}
```

## 🚫 严格禁止的做法

### 1. 禁止混用技术栈

```typescript
// ❌ 错误：在新布局中使用 MUI
import { Button } from '@mui/material';
import { TextField } from '@mui/material';

// ✅ 正确：使用 Shadcn/UI
import { Button } from '@/new/components/ui/button';
import { Input } from '@/new/components/ui/input';
```

### 2. 禁止传统数据获取模式

```typescript
// ❌ 错误：使用 useState + useEffect
const [data, setData] = useState([]);
useEffect(() => {
  fetch('/api/data').then(r => r.json()).then(setData);
}, []);

// ✅ 正确：使用 TanStack Query
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
interface DataItem {
  value: number;
}

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

// ❌ 错误：硬编码 API 端点
fetch('http://localhost:8000/api/data');

// ✅ 正确：使用 API 模块
import { fetchData } from '@/api';
const data = await fetchData();
```

## 📁 关键组件参考

### 新布局核心组件

| 组件 | 路径 | 用途 |
|------|------|------|
| **布局** | `frontend/src/new/Layout/` | Sidebar, Header, PageShell |
| **查询工作台** | `frontend/src/new/Query/QueryWorkspace.tsx` | 查询主界面 |
| **SQL 查询** | `frontend/src/new/Query/SQLQuery/SQLQueryPanel.tsx` | SQL 编辑器 |
| **可视化查询** | `frontend/src/new/Query/VisualQuery/QueryBuilder.tsx` | 可视化查询构建器 |
| **结果面板** | `frontend/src/new/Query/ResultPanel/ResultPanel.tsx` | 查询结果展示 |
| **数据源面板** | `frontend/src/new/Query/DataSourcePanel/` | 数据源树形面板 |
| **数据源管理** | `frontend/src/new/DataSource/DataSourcePage.tsx` | 数据源管理页面 |

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
| **useDuckDBTables** | `frontend/src/new/hooks/useDuckDBTables.ts` | DuckDB 表列表 |
| **useDataSources** | `frontend/src/new/hooks/useDataSources.ts` | 数据源列表 |
| **useDatabaseConnections** | `frontend/src/new/hooks/useDatabaseConnections.ts` | 数据库连接列表 |
| **useTableColumns** | `frontend/src/new/hooks/useTableColumns.ts` | 表列信息 |

## 🔗 相关文档

- [当前项目状态](./current-project-status.md)
- [TanStack Query 使用标准](./tanstack-query-standards.md)
- [Shadcn/UI 使用标准](./shadcn-ui-standards.md)
- [API 统一化规则](./api-unification-rules.md)
- [Hooks 使用指南](../../frontend/src/new/hooks/README.md)

---

**维护者**: 项目团队  
**审核周期**: 每月更新  
**反馈渠道**: 项目 Issue 或 PR
