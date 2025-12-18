# AG-Grid 集成指南

## 1. 技术选型理由

根据 `component-selection-principle.md` 规范，选择 AG-Grid 替代 TanStack Table：

| 特性 | AG-Grid | TanStack Table |
|------|---------|----------------|
| 虚拟滚动 | ✅ 内置 | 需要 @tanstack/react-virtual |
| 列过滤 | ✅ 内置 Excel 风格 | 需要自己实现 |
| 列排序 | ✅ 内置 | 需要自己实现 |
| 列固定 | ✅ 内置 | 需要自己实现 |
| 导出 | ✅ 内置 CSV/Excel | 需要自己实现 |
| 列宽调整 | ✅ 内置 | 需要自己实现 |
| 分组 | ✅ 内置 | 需要自己实现 |
| 包大小 | ~300KB | ~50KB |
| 学习曲线 | 中等 | 较高（需要组合多个库）|

**结论**：AG-Grid 内置了所有 Week 4 任务需要的功能，减少开发时间和维护成本。

## 2. 安装和依赖

```bash
npm install ag-grid-react ag-grid-community
```

## 3. 主题配置

### 3.1 基础主题导入

```typescript
// 在 main.tsx 或 App.tsx 中导入
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
```

### 3.2 自定义主题变量

```css
/* ResultPanel/themes/ag-grid-theme.css */
.ag-theme-alpine,
.ag-theme-alpine-dark {
  /* 适配项目颜色系统 */
  --ag-background-color: hsl(var(--background));
  --ag-foreground-color: hsl(var(--foreground));
  --ag-border-color: hsl(var(--border));
  --ag-header-background-color: hsl(var(--muted));
  --ag-odd-row-background-color: hsl(var(--muted) / 0.3);
  --ag-row-hover-color: hsl(var(--surface-hover));
  --ag-selected-row-background-color: hsl(var(--primary) / 0.1);
  
  /* 字体配置 */
  --ag-font-family: var(--font-sans);
  --ag-font-size: 13px;
  
  /* 间距配置 */
  --ag-grid-size: 4px;
  --ag-row-height: 32px;
  --ag-header-height: 40px;
}

/* 深色主题适配 */
.dark .ag-theme-alpine {
  --ag-background-color: hsl(var(--background));
  --ag-foreground-color: hsl(var(--foreground));
  --ag-header-background-color: hsl(var(--muted));
  --ag-odd-row-background-color: hsl(var(--muted) / 0.2);
}
```

## 4. 核心组件结构

### 4.1 文件组织

```
frontend/src/new/Query/ResultPanel/
├── ResultPanel.tsx              # 主容器组件
├── AGGridWrapper.tsx            # AG-Grid 封装组件
├── ResultToolbar.tsx            # 工具栏组件
├── ExportDialog.tsx             # 导出对话框
├── themes/
│   └── ag-grid-theme.css        # AG-Grid 主题定制
├── hooks/
│   ├── useAGGridConfig.ts       # AG-Grid 配置 Hook
│   ├── useColumnTypeDetection.ts # 列类型检测 Hook
│   └── useGridStats.ts          # 表格统计信息 Hook
└── index.tsx                    # 导出文件
```

### 4.2 AGGridWrapper 组件

```typescript
// ResultPanel/AGGridWrapper.tsx
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridOptions, GridApi, ColumnApi, GridReadyEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import './themes/ag-grid-theme.css';

export interface AGGridWrapperProps {
  rowData: any[];
  columnDefs: ColDef[];
  onGridReady?: (params: { api: GridApi; columnApi: ColumnApi }) => void;
  loading?: boolean;
  className?: string;
}

export const AGGridWrapper: React.FC<AGGridWrapperProps> = ({
  rowData,
  columnDefs,
  onGridReady,
  loading,
  className
}) => {
  const defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    flex: 1,
    minWidth: 100,
  };

  const gridOptions: GridOptions = {
    defaultColDef,
    rowSelection: 'multiple',
    enableRangeSelection: true,
    suppressRowClickSelection: true,
    animateRows: true,
    // 虚拟滚动自动启用
  };

  const handleGridReady = (params: GridReadyEvent) => {
    onGridReady?.({ api: params.api, columnApi: params.columnApi });
    // 自动调整列宽
    params.api.sizeColumnsToFit();
  };

  return (
    <div className={cn('ag-theme-alpine h-full w-full', className)}>
      <AgGridReact
        rowData={rowData}
        columnDefs={columnDefs}
        gridOptions={gridOptions}
        onGridReady={handleGridReady}
        loading={loading}
      />
    </div>
  );
};
```

### 4.3 useAGGridConfig Hook

```typescript
// hooks/useAGGridConfig.ts
import { useMemo } from 'react';
import { ColDef } from 'ag-grid-community';
import { useColumnTypeDetection } from './useColumnTypeDetection';

export const useAGGridConfig = (data: any[]) => {
  const { detectColumnTypes } = useColumnTypeDetection();
  
  const columnDefs = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const columns = Object.keys(data[0]);
    const typeInfo = detectColumnTypes(data.slice(0, 100)); // 采样前100行
    
    return columns.map((field): ColDef => {
      const type = typeInfo[field];
      
      const colDef: ColDef = {
        field,
        headerName: field,
        sortable: true,
        filter: getFilterType(type),
        resizable: true,
      };
      
      // 根据类型配置格式化器
      if (type === 'number') {
        colDef.valueFormatter = (params) => {
          if (params.value == null) return 'NULL';
          return new Intl.NumberFormat().format(params.value);
        };
        colDef.cellClass = 'text-right';
      } else if (type === 'date') {
        colDef.valueFormatter = (params) => {
          if (params.value == null) return 'NULL';
          return new Date(params.value).toLocaleDateString();
        };
      } else if (type === 'boolean') {
        colDef.cellRenderer = (params) => {
          if (params.value == null) return 'NULL';
          return params.value ? '✓' : '✗';
        };
        colDef.cellClass = 'text-center';
      }
      
      // NULL 值样式
      colDef.cellClassRules = {
        'text-muted-foreground italic': (params) => params.value == null,
      };
      
      return colDef;
    });
  }, [data, detectColumnTypes]);
  
  return { columnDefs };
};

function getFilterType(type: string): string {
  switch (type) {
    case 'number': return 'agNumberColumnFilter';
    case 'date': return 'agDateColumnFilter';
    case 'boolean': return 'agSetColumnFilter';
    default: return 'agTextColumnFilter';
  }
}
```

## 5. 过滤器集成

### 5.1 Set Filter 配置（Excel 风格）

```typescript
// 为分类列配置 Set Filter
const categoryColumnDef: ColDef = {
  field: 'category',
  filter: 'agSetColumnFilter',
  filterParams: {
    values: async (params) => {
      // 从 API 获取 distinct values
      const stats = await getColumnStatistics(tableName, 'category');
      params.success(stats.distinct_values);
    },
    suppressSelectAll: false,
    textFormatter: (value) => value?.toString() || 'NULL',
  },
};
```

### 5.2 集成 getColumnStatistics API

```typescript
// hooks/useColumnStats.ts
import { useQuery } from '@tanstack/react-query';
import { getColumnStatistics } from '@/services/apiClient';

export const useColumnStats = (tableName: string, columnName: string) => {
  return useQuery({
    queryKey: ['column-stats', tableName, columnName],
    queryFn: () => getColumnStatistics(tableName, columnName),
    staleTime: 5 * 60 * 1000, // 5分钟缓存
    enabled: !!tableName && !!columnName,
  });
};
```

## 6. 导出功能

### 6.1 内置 CSV 导出

```typescript
const handleExportCSV = useCallback(() => {
  if (gridApi) {
    gridApi.exportDataAsCsv({
      fileName: `query_result_${Date.now()}.csv`,
      columnKeys: visibleColumns, // 仅导出可见列
    });
  }
}, [gridApi, visibleColumns]);
```

### 6.2 自定义 JSON 导出

```typescript
const handleExportJSON = useCallback(() => {
  if (gridApi) {
    const data: any[] = [];
    gridApi.forEachNodeAfterFilterAndSort((node) => {
      data.push(node.data);
    });
    
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_result_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}, [gridApi]);
```

### 6.3 大数据集异步导出

```typescript
const handleLargeExport = useCallback(async (format: 'csv' | 'parquet') => {
  // 使用异步任务导出
  const result = await submitAsyncQuery({
    sql: currentSQL,
    task_type: 'export',
    export_format: format,
  });
  
  toast.success(t('export.taskSubmitted'), {
    description: t('export.taskId', { id: result.task_id }),
  });
}, [currentSQL, submitAsyncQuery]);
```

## 7. 工具栏集成

### 7.1 统计信息获取

```typescript
// hooks/useGridStats.ts
const useGridStats = (gridApi: GridApi | null) => {
  const [stats, setStats] = useState({
    totalRows: 0,
    filteredRows: 0,
    selectedRows: 0,
  });
  
  useEffect(() => {
    if (!gridApi) return;
    
    const updateStats = () => {
      setStats({
        totalRows: gridApi.getModel().getRowCount(),
        filteredRows: gridApi.getDisplayedRowCount(),
        selectedRows: gridApi.getSelectedRows().length,
      });
    };
    
    // 监听相关事件
    gridApi.addEventListener('filterChanged', updateStats);
    gridApi.addEventListener('selectionChanged', updateStats);
    gridApi.addEventListener('modelUpdated', updateStats);
    
    updateStats();
    
    return () => {
      gridApi.removeEventListener('filterChanged', updateStats);
      gridApi.removeEventListener('selectionChanged', updateStats);
      gridApi.removeEventListener('modelUpdated', updateStats);
    };
  }, [gridApi]);
  
  return stats;
};
```

### 7.2 列可见性控制

```typescript
const useColumnVisibility = (columnApi: ColumnApi | null) => {
  const [columns, setColumns] = useState<{ field: string; visible: boolean }[]>([]);
  
  useEffect(() => {
    if (!columnApi) return;
    
    const allColumns = columnApi.getAllColumns() || [];
    setColumns(allColumns.map(col => ({
      field: col.getColId(),
      visible: col.isVisible(),
    })));
  }, [columnApi]);
  
  const toggleColumn = useCallback((field: string, visible: boolean) => {
    if (columnApi) {
      columnApi.setColumnVisible(field, visible);
      setColumns(prev => prev.map(col => 
        col.field === field ? { ...col, visible } : col
      ));
    }
  }, [columnApi]);
  
  return { columns, toggleColumn };
};
```

## 8. 性能优化

### 8.1 虚拟滚动配置

AG-Grid 默认启用虚拟滚动，无需额外配置。对于超大数据集：

```typescript
const gridOptions: GridOptions = {
  // 缓存配置
  cacheBlockSize: 100,
  maxBlocksInCache: 10,
  
  // 行高优化
  getRowHeight: (params) => {
    // 根据内容动态计算行高
    return params.data?.longText ? 60 : 32;
  },
  
  // 禁用不必要的功能以提升性能
  suppressRowHoverHighlight: false,
  suppressColumnVirtualisation: false,
};
```

### 8.2 内存管理

```typescript
// 在组件卸载时清理
useEffect(() => {
  return () => {
    if (gridApi) {
      gridApi.destroy();
    }
  };
}, [gridApi]);
```

## 9. 响应式设计

### 9.1 自适应列宽

```typescript
const handleGridReady = useCallback((params: GridReadyEvent) => {
  setGridApi(params.api);
  setColumnApi(params.columnApi);
  
  // 自动调整列宽
  params.api.sizeColumnsToFit();
}, []);

// 窗口大小变化时重新调整
useEffect(() => {
  const handleResize = () => {
    if (gridApi) {
      gridApi.sizeColumnsToFit();
    }
  };
  
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, [gridApi]);
```

### 9.2 移动端适配

```css
/* 移动端样式调整 */
@media (max-width: 768px) {
  .ag-theme-alpine {
    --ag-row-height: 40px;
    --ag-header-height: 48px;
    --ag-font-size: 14px;
  }
}
```

## 10. 与现有功能的集成

### 10.1 保留 ModernDataDisplay 的高级功能

AG-Grid 内置了 ModernDataDisplay 的大部分功能：

| ModernDataDisplay 功能 | AG-Grid 实现 |
|----------------------|-------------|
| Excel 风格列过滤 | ✅ agSetColumnFilter |
| 列类型自动检测 | ✅ useColumnTypeDetection Hook |
| 智能排序 | ✅ 内置排序 + 自定义比较器 |
| 虚拟滚动 | ✅ 内置 |
| 导出功能 | ✅ exportDataAsCsv + 自定义 |
| 列宽调整 | ✅ 内置 |
| 列固定 | ✅ pinned: 'left' / 'right' |

### 10.2 迁移策略

1. **保留 ModernDataDisplay** 作为备选方案
2. **新建 ResultPanel** 使用 AG-Grid
3. **通过 props 切换** 使用哪个实现
4. **逐步迁移** 验证功能完整性后再移除旧实现
