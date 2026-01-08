---
inclusion: always
---
# 数据源刷新模式约束规则

## 🎯 新布局刷新机制（TanStack Query）

新布局（`frontend/src/new/`）使用 TanStack Query 管理数据缓存，刷新操作通过统一的工具函数完成。

### 1. 统一刷新函数

所有刷新操作必须使用 `frontend/src/new/utils/cacheInvalidation.ts` 中的函数：

```typescript
import { 
  invalidateAfterTableCreate,
  invalidateAfterFileUpload,
  invalidateAfterTableDelete,
  invalidateAllDataCaches,
} from '@/new/utils/cacheInvalidation';
```

| 函数 | 使用场景 |
|------|----------|
| `invalidateAfterTableCreate()` | 表创建后（saveAsTable、粘贴数据） |
| `invalidateAfterFileUpload()` | 文件上传后（CSV/Excel/Parquet/URL） |
| `invalidateAfterTableDelete()` | 表删除后 |
| `invalidateAllDataCaches()` | 全局刷新（含外部数据库 schemas） |

### 2. 必须刷新的场景

**前端调用点**：

| 场景 | 文件 | 刷新函数 |
|------|------|----------|
| SQL saveAsTable | `useSQLEditor.ts` | `invalidateAllDataCaches()` |
| 可视化查询 saveAsTable | `useQueryBuilder.ts` | `invalidateAfterTableCreate()` |
| 粘贴数据创建表 | `DataPasteCard.tsx` | `invalidateAfterTableCreate()` |
| 文件上传 | `UploadPanel.tsx` | `invalidateAfterFileUpload()` |
| 表删除 | `ContextMenu.tsx` | `invalidateAfterTableDelete()` |

**后端元数据记录**：

表创建后必须调用 `file_datasource_manager.save_file_datasource()` 记录元数据（含 `created_at`），确保表列表时间排序正确。

### 3. 刷新工作流

```
表创建/删除操作
    ↓
后端：save_file_datasource() 记录元数据
    ↓
前端：invalidateAfter*() 清除缓存
    ↓
TanStack Query 自动 refetch
    ↓
UI 更新
```

## 🚫 严格禁止

- **禁止在创建表后遗漏前端缓存刷新调用**
- **禁止在创建表后遗漏后端元数据记录**
- **禁止绕过 `cacheInvalidation.ts` 自行实现刷新逻辑**
- **禁止使用旧布局的 `requestManager.clearAllCache()`**

## 📁 相关文件参考

- 缓存失效工具: [frontend/src/new/utils/cacheInvalidation.ts](mdc:frontend/src/new/utils/cacheInvalidation.ts)
- DuckDB 表 Hook: [frontend/src/new/hooks/useDuckDBTables.ts](mdc:frontend/src/new/hooks/useDuckDBTables.ts)
- 数据源 Hook: [frontend/src/new/hooks/useDataSources.ts](mdc:frontend/src/new/hooks/useDataSources.ts)
- 文件数据源管理器: [api/core/file_datasource_manager.py](mdc:api/core/file_datasource_manager.py)