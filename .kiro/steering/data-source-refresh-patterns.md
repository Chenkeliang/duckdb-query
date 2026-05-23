---
inclusion: always
---
# 数据源刷新模式约束规则（2026-01 更新）

> **最后更新**: 2026-01-19  
> **版本**: 2.0  
> **状态**: ✅ 已验证与代码一致

## 🎯 刷新机制（TanStack Query）

项目使用 TanStack Query 管理数据缓存，刷新操作通过统一的工具函数完成。

### 1. 统一刷新函数

所有刷新操作必须使用 `frontend/src/utils/cacheInvalidation.ts` 中的函数：

```typescript
import { 
  invalidateAfterTableCreate,
  invalidateAfterFileUpload,
  invalidateAfterTableDelete,
  invalidateAfterDatabaseChange,
  invalidateAllDataCaches,
} from '@/utils/cacheInvalidation';
```

| 函数 | 使用场景 |
|------|----------|
| `invalidateAfterTableCreate()` | 表创建后（saveAsTable、粘贴数据） |
| `invalidateAfterFileUpload()` | 文件上传后（CSV/Excel/Parquet/URL） |
| `invalidateAfterTableDelete()` | 表删除后 |
| `invalidateAfterDatabaseChange()` | 数据库连接变更后（创建/更新/删除） |
| `invalidateAllDataCaches()` | 全局刷新（含外部数据库 schemas） |

### 2. 必须刷新的场景

**前端调用点**：

| 场景 | 文件 | 刷新函数 |
|------|------|----------|
| SQL saveAsTable | `useSQLEditor.ts` | `invalidateAllDataCaches()` |
| 透视 saveAsTable | `PivotPanel` 等 | `invalidateAfterTableCreate()` |
| 粘贴数据创建表 | `DataPasteCard.tsx` | `invalidateAfterTableCreate()` |
| 文件上传 | `UploadPanel.tsx` | `invalidateAfterFileUpload()` |
| 表删除 | `ContextMenu.tsx` | `invalidateAfterTableDelete()` |
| 数据库连接创建/更新/删除 | `DatabaseForm.tsx` | `invalidateAfterDatabaseChange()` |

**后端元数据记录**：

表创建后必须调用 `file_datasource_manager.save_file_datasource()` 记录元数据（含 `created_at`），确保表列表时间排序正确。

**时区处理**：
- 保存元数据 `created_at` 使用 `get_current_time_iso()` 返回带时区的 ISO 格式字符串
- 数据库连接时间使用 `get_current_time()` 返回 datetime 对象

### 3. 刷新工作流

```
表创建/删除操作
    ↓
后端：save_file_datasource() 记录元数据（使用 get_current_time_iso()）
    ↓
前端：invalidateAfter*() 清除缓存
    ↓
TanStack Query 自动 refetch
    ↓
UI 更新
```

### 4. 缓存失效函数实现

```typescript
// frontend/src/utils/cacheInvalidation.ts

import { QueryClient } from '@tanstack/react-query';
import { invalidateDuckDBTables } from '../hooks/useDuckDBTables';
import { invalidateDataSources, invalidateDatabaseConnections } from '../hooks/useDataSources';

/**
 * 异步任务完成后刷新所有相关缓存
 */
export const invalidateAllDataCaches = async (queryClient: QueryClient) => {
  await Promise.all([
    invalidateDuckDBTables(queryClient),
    invalidateDataSources(queryClient),
    invalidateDatabaseConnections(queryClient),
    queryClient.invalidateQueries({ queryKey: ['schemas'] }),
    queryClient.invalidateQueries({ queryKey: ['schema-tables'] }),
  ]);
};

/**
 * 文件上传后刷新缓存
 */
export const invalidateAfterFileUpload = async (queryClient: QueryClient) => {
  await Promise.all([
    invalidateDuckDBTables(queryClient),
    invalidateDataSources(queryClient),
  ]);
};

/**
 * 数据库连接变更后刷新缓存
 */
export const invalidateAfterDatabaseChange = async (queryClient: QueryClient) => {
  await Promise.all([
    invalidateDatabaseConnections(queryClient),
    invalidateDataSources(queryClient),
  ]);
};

/**
 * 表删除后刷新缓存
 */
export const invalidateAfterTableDelete = async (queryClient: QueryClient) => {
  await Promise.all([
    invalidateDuckDBTables(queryClient),
    invalidateDataSources(queryClient),
  ]);
};

/**
 * 查询结果保存为表后刷新缓存
 */
export const invalidateAfterTableCreate = async (queryClient: QueryClient) => {
  await Promise.all([
    invalidateDuckDBTables(queryClient),
    invalidateDataSources(queryClient),
  ]);
};
```

### 5. 使用示例

```typescript
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAfterTableCreate } from '@/utils/cacheInvalidation';

function MyComponent() {
  const queryClient = useQueryClient();

  const handleCreateTable = async () => {
    try {
      await createTable(data);
      // 创建成功后刷新缓存
      await invalidateAfterTableCreate(queryClient);
      toast.success('表创建成功');
    } catch (error) {
      toast.error('创建失败');
    }
  };

  return <button onClick={handleCreateTable}>创建表</button>;
}
```

## 🚫 严格禁止

- **禁止在创建表后遗漏前端缓存刷新调用**
- **禁止在创建表后遗漏后端元数据记录**
- **禁止绕过 `cacheInvalidation.ts` 自行实现刷新逻辑**
- **禁止直接调用 `queryClient.invalidateQueries()`**（应使用封装函数）
- **禁止混用时区函数**（元数据用 `get_current_time_iso()`，连接用 `get_current_time()`）

## 📁 相关文件参考

| 文件 | 用途 |
|------|------|
| `frontend/src/utils/cacheInvalidation.ts` | 缓存失效工具函数 |
| `frontend/src/hooks/useDuckDBTables.ts` | DuckDB 表列表 Hook |
| `frontend/src/hooks/useDataSources.ts` | 数据源列表 Hook |
| `api/core/data/file_datasource_manager.py` | 文件数据源管理器 |
| `api/core/common/timezone_utils.py` | 时区工具函数 |

---

**维护者**: 项目团队  
**审核周期**: 每月更新
