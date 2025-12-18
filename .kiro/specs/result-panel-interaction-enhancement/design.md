# AG Grid 结果面板交互增强 - 设计文档

## 概述

本设计文档描述如何在 AG Grid 结果面板中实现类似 Excel 的交互功能，包括单元格区域选择、复制、列筛选和命令面板等功能。

## 技术架构

### 核心技术栈

- **AG Grid v34 Community** - 表格组件
- **shadcn/ui** - UI 组件库（Popover, Command, Button 等）
- **cmdk** - 命令面板库
- **lucide-react** - 图标库
- **sonner** - Toast 通知
- **react-i18next** - 国际化

### 组件架构

```
ResultPanel (已有)
├── ResultToolbar (已有，需增强)
│   ├── 统计信息显示
│   ├── 复制选中按钮 (新增)
│   └── 其他操作按钮
├── AGGridWrapper (已有，需增强)
│   ├── Range Selection 配置
│   ├── 键盘事件处理
│   └── 复制功能
├── ColumnFilterMenu (新增)
│   ├── 搜索框
│   ├── 唯一值列表
│   ├── 快捷操作按钮
│   └── 应用/重置按钮
└── ColumnFilterCommand (新增)
    └── cmdk 命令面板
```

## 详细设计

### 1. 单元格区域选择 (Range Selection)

#### AG Grid 配置

```typescript
// frontend/src/new/Query/ResultPanel/hooks/useAGGridConfig.ts

const gridOptions = useMemo(() => ({
  theme: 'legacy',
  
  // 启用单元格区域选择
  enableRangeSelection: true,
  
  // 允许选中单元格文本
  enableCellTextSelection: true,
  
  // 行选择配置
  rowSelection: 'multiple',
  
  // 禁用默认的复制行为（我们自己实现）
  suppressCopyRowsToClipboard: false,
  
  // 其他配置...
}), []);
```

#### 选择状态管理

```typescript
// 使用 AG Grid 的 API 获取选择状态
const selectedRanges = gridApi.getCellRanges();
const selectedRows = gridApi.getSelectedRows();
```

### 2. 单元格区域复制 (Ctrl+C)

#### 实现方案

创建一个新的 Hook：`useGridCopy.ts`

```typescript
// frontend/src/new/Query/ResultPanel/hooks/useGridCopy.ts

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { GridApi } from 'ag-grid-community';

export function useGridCopy(gridApi: GridApi | null) {
  const { t } = useTranslation('common');

  // 提取区域数据
  const extractRangeData = useCallback((ranges: any[]) => {
    if (!ranges || ranges.length === 0) return [];
    
    const range = ranges[0]; // 只处理第一个选区
    const startRow = Math.min(range.startRow.rowIndex, range.endRow.rowIndex);
    const endRow = Math.max(range.startRow.rowIndex, range.endRow.rowIndex);
    
    const columns = range.columns;
    const data: string[][] = [];
    
    // 提取表头
    const headers = columns.map(col => col.getColDef().headerName || col.getColId());
    data.push(headers);
    
    // 提取数据行
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
      const rowNode = gridApi.getDisplayedRowAtIndex(rowIndex);
      if (!rowNode) continue;
      
      const rowData = columns.map(col => {
        const value = gridApi.getValue(col, rowNode);
        return value === null || value === undefined ? '' : String(value);
      });
      data.push(rowData);
    }
    
    return data;
  }, [gridApi]);

  // 转换为 TSV 格式
  const convertToTSV = useCallback((data: string[][]) => {
    return data.map(row => 
      row.map(cell => {
        // 处理包含制表符或换行符的单元格
        if (cell.includes('\t') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join('\t')
    ).join('\n');
  }, []);

  // 复制到剪贴板
  const copyToClipboard = useCallback(async () => {
    if (!gridApi) return;

    try {
      const ranges = gridApi.getCellRanges();
      
      if (!ranges || ranges.length === 0) {
        // 没有选中区域，尝试复制选中的行
        const selectedRows = gridApi.getSelectedRows();
        if (selectedRows.length === 0) {
          return; // 什么都没选中，不执行操作
        }
        
        // 复制选中的行（由 copySelectedRows 处理）
        return;
      }

      const data = extractRangeData(ranges);
      const tsv = convertToTSV(data);
      
      await navigator.clipboard.writeText(tsv);
      
      const rowCount = data.length - 1; // 减去表头
      const colCount = data[0].length;
      toast.success(t('result.rangeCopySuccess', { rows: rowCount, cols: colCount }));
    } catch (error) {
      console.error('复制失败:', error);
      toast.error(t('result.copyFailed'));
    }
  }, [gridApi, extractRangeData, convertToTSV, t]);

  // 复制选中的行
  const copySelectedRows = useCallback(async () => {
    if (!gridApi) return;

    try {
      const selectedRows = gridApi.getSelectedRows();
      if (selectedRows.length === 0) {
        toast.warning(t('result.noRowsSelected'));
        return;
      }

      // 获取所有可见列
      const columnDefs = gridApi.getColumnDefs();
      const visibleColumns = columnDefs?.filter(col => col.field) || [];

      // 构建数据
      const headers = visibleColumns.map(col => col.headerName || col.field);
      const rows = selectedRows.map(row =>
        visibleColumns.map(col => {
          const value = row[col.field!];
          return value === null || value === undefined ? '' : String(value);
        })
      );

      const data = [headers, ...rows];
      const tsv = convertToTSV(data);

      await navigator.clipboard.writeText(tsv);
      toast.success(t('result.copySuccess', { count: selectedRows.length }));
    } catch (error) {
      console.error('复制失败:', error);
      toast.error(t('result.copyFailed'));
    }
  }, [gridApi, convertToTSV, t]);

  return {
    copyToClipboard,
    copySelectedRows,
  };
}
```

#### 键盘事件处理

在 `AGGridWrapper.tsx` 中添加键盘事件监听：

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+C / Cmd+C
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      copyToClipboard();
    }
    
    // Ctrl+A / Cmd+A
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      gridApi?.selectAll();
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [gridApi, copyToClipboard]);
```

### 3. 行选择复制按钮

#### ResultToolbar 增强

```typescript
// frontend/src/new/Query/ResultPanel/ResultPanel.tsx

interface ResultToolbarProps {
  stats: ReturnType<typeof useGridStats>;
  gridApi?: GridApi;
  onRefresh?: () => void;
  onExport?: () => void;
  onSettings?: () => void;
  onCopySelected?: () => void; // 新增
}

const ResultToolbar: React.FC<ResultToolbarProps> = ({
  stats,
  gridApi,
  onRefresh,
  onExport,
  onSettings,
  onCopySelected,
}) => {
  const { t } = useTranslation('common');

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border">
      {/* 统计信息 */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{stats.totalRows} 行</span>
        <span>{stats.visibleColumnCount}/{stats.columnCount} 列</span>
        {stats.selectedRows > 0 && (
          <span className="text-primary font-medium">
            {stats.selectedRows} 已选
          </span>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        {/* 选中行操作 - 只在有选中行时显示 */}
        {stats.selectedRows > 0 && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onCopySelected}
              className="gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              {t('result.copySelected')}
            </Button>
            <Separator orientation="vertical" className="h-4" />
          </>
        )}

        <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          {t('common.refresh')}
        </Button>
        
        <Button variant="outline" size="sm" onClick={onExport} className="gap-1.5">
          <Download className="w-3.5 h-3.5" />
          {t('common.export')}
        </Button>
        
        <Button variant="outline" size="sm" onClick={onSettings} className="gap-1.5">
          <Settings className="w-3.5 h-3.5" />
          {t('common.settings')}
        </Button>
      </div>
    </div>
  );
};
```

### 4. Excel 风格列筛选

#### 组件结构

创建新组件：`ColumnFilterMenu.tsx`

```typescript
// frontend/src/new/Query/ResultPanel/ColumnFilterMenu.tsx

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Check } from 'lucide-react';
import { Button } from '@/new/components/ui/button';
import { Input } from '@/new/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/new/components/ui/popover';
import { Checkbox } from '@/new/components/ui/checkbox';
import { Separator } from '@/new/components/ui/separator';

interface ColumnFilterMenuProps {
  column: any; // AG Grid Column
  gridApi: any; // AG Grid API
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ColumnFilterMenu({
  column,
  gridApi,
  open,
  onOpenChange,
}: ColumnFilterMenuProps) {
  const { t } = useTranslation('common');
  const [searchText, setSearchText] = React.useState('');
  const [selectedValues, setSelectedValues] = React.useState<Set<string>>(new Set());
  const [mode, setMode] = React.useState<'include' | 'exclude'>('include');
  const [distinctValues, setDistinctValues] = React.useState<Array<{ value: string; count: number }>>([]);

  // 计算唯一值
  React.useEffect(() => {
    if (!open || !gridApi) return;

    const values = new Map<string, number>();
    const maxRows = 10000; // 采样最多 10000 行
    
    gridApi.forEachNodeAfterFilterAndSort((node: any, index: number) => {
      if (index >= maxRows) return;
      
      const value = gridApi.getValue(column, node);
      const strValue = value === null || value === undefined ? '(空)' : String(value);
      
      values.set(strValue, (values.get(strValue) || 0) + 1);
    });

    const sorted = Array.from(values.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 1000); // 最多显示 1000 个

    setDistinctValues(sorted);
    setSelectedValues(new Set(sorted.map(v => v.value)));
  }, [open, gridApi, column]);

  // 过滤显示的值
  const filteredValues = React.useMemo(() => {
    if (!searchText) return distinctValues;
    const lower = searchText.toLowerCase();
    return distinctValues.filter(v => v.value.toLowerCase().includes(lower));
  }, [distinctValues, searchText]);

  // 快捷操作
  const handleSelectAll = () => {
    setSelectedValues(new Set(filteredValues.map(v => v.value)));
  };

  const handleSelectNone = () => {
    setSelectedValues(new Set());
  };

  const handleInvert = () => {
    const newSet = new Set<string>();
    filteredValues.forEach(v => {
      if (!selectedValues.has(v.value)) {
        newSet.add(v.value);
      }
    });
    setSelectedValues(newSet);
  };

  const handleSelectDuplicates = () => {
    const newSet = new Set<string>();
    filteredValues.forEach(v => {
      if (v.count > 1) {
        newSet.add(v.value);
      }
    });
    setSelectedValues(newSet);
  };

  const handleSelectUnique = () => {
    const newSet = new Set<string>();
    filteredValues.forEach(v => {
      if (v.count === 1) {
        newSet.add(v.value);
      }
    });
    setSelectedValues(newSet);
  };

  // 应用筛选
  const handleApply = () => {
    const filterInstance = gridApi.getFilterInstance(column.getColId());
    if (!filterInstance) return;

    if (selectedValues.size === 0) {
      filterInstance.setModel(null);
    } else {
      const values = Array.from(selectedValues);
      filterInstance.setModel({
        filterType: 'set',
        values: mode === 'include' ? values : undefined,
        excludeValues: mode === 'exclude' ? values : undefined,
      });
    }

    gridApi.onFilterChanged();
    onOpenChange(false);
  };

  // 重置筛选
  const handleReset = () => {
    const filterInstance = gridApi.getFilterInstance(column.getColId());
    if (filterInstance) {
      filterInstance.setModel(null);
      gridApi.onFilterChanged();
    }
    onOpenChange(false);
  };

  return (
    <PopoverContent className="w-80 p-0" align="start">
      <div className="flex flex-col h-96">
        {/* 搜索框 */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('result.filter.search')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* 快捷操作 */}
        <div className="flex items-center gap-2 p-2 border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleSelectAll}>
            {t('result.filter.selectAll')}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleInvert}>
            {t('result.filter.invert')}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSelectDuplicates}>
            {t('result.filter.duplicates')}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSelectUnique}>
            {t('result.filter.unique')}
          </Button>
        </div>

        {/* 模式切换 */}
        <div className="flex items-center gap-2 p-2 border-b border-border">
          <Button
            variant={mode === 'include' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('include')}
          >
            {t('result.filter.include')}
          </Button>
          <Button
            variant={mode === 'exclude' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('exclude')}
          >
            {t('result.filter.exclude')}
          </Button>
        </div>

        {/* 值列表 */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredValues.map(({ value, count }) => (
            <div
              key={value}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded-sm cursor-pointer"
              onClick={() => {
                const newSet = new Set(selectedValues);
                if (newSet.has(value)) {
                  newSet.delete(value);
                } else {
                  newSet.add(value);
                }
                setSelectedValues(newSet);
              }}
            >
              <Checkbox checked={selectedValues.has(value)} />
              <span className="flex-1 text-sm truncate">{value}</span>
              <span className="text-xs text-muted-foreground">({count})</span>
            </div>
          ))}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center gap-2 p-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={handleReset} className="flex-1">
            {t('common.reset')}
          </Button>
          <Button size="sm" onClick={handleApply} className="flex-1">
            {t('common.apply')}
          </Button>
        </div>
      </div>
    </PopoverContent>
  );
}
```

#### 集成到 AG Grid

在列定义中添加自定义 Header Component：

```typescript
const columnDefs = useMemo(() => {
  return columns.map(col => ({
    ...col,
    headerComponent: CustomHeaderComponent, // 自定义表头组件
    headerComponentParams: {
      enableFilter: true,
    },
  }));
}, [columns]);
```

### 5. 列筛选命令面板 (cmdk)

#### 组件实现

创建新组件：`ColumnFilterCommand.tsx`

```typescript
// frontend/src/new/Query/ResultPanel/ColumnFilterCommand.tsx

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/new/components/ui/command';

interface ColumnFilterCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: any[];
  onSelectColumn: (column: any) => void;
}

export function ColumnFilterCommand({
  open,
  onOpenChange,
  columns,
  onSelectColumn,
}: ColumnFilterCommandProps) {
  const { t } = useTranslation('common');

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t('result.filter.searchColumn')} />
      <CommandList>
        <CommandEmpty>{t('result.filter.noColumns')}</CommandEmpty>
        <CommandGroup heading={t('result.filter.availableColumns')}>
          {columns.map((col) => (
            <CommandItem
              key={col.field}
              value={col.headerName || col.field}
              onSelect={() => {
                onSelectColumn(col);
                onOpenChange(false);
              }}
            >
              {col.headerName || col.field}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

#### 键盘快捷键

在 `ResultPanel.tsx` 中添加：

```typescript
// Ctrl+K / Cmd+K 打开列筛选命令面板
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      setColumnFilterCommandOpen(true);
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, []);
```

### 6. 快捷键支持

#### 完整的快捷键列表

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+C` / `Cmd+C` | 复制选中的单元格区域或行 |
| `Ctrl+A` / `Cmd+A` | 选中所有行 |
| `Ctrl+K` / `Cmd+K` | 打开列筛选命令面板 |
| `Esc` | 清除选中状态或关闭面板 |
| `↑↓←→` | 在单元格间导航 |
| `Home` | 跳转到当前行的第一列 |
| `End` | 跳转到当前行的最后一列 |
| `Ctrl+Home` / `Cmd+Home` | 跳转到第一行第一列 |
| `Ctrl+End` / `Cmd+End` | 跳转到最后一行最后一列 |

### 7. 性能优化

#### 优化策略

1. **useMemo 和 useCallback**
```typescript
const gridOptions = useMemo(() => ({
  // 配置对象
}), [dependencies]);

const handleCopy = useCallback(() => {
  // 复制逻辑
}, [dependencies]);
```

2. **唯一值计算采样**
```typescript
// 最多采样 10,000 行
const maxSampleRows = 10000;

// 最多显示 1,000 个唯一值
const maxDisplayValues = 1000;
```

3. **防抖搜索**
```typescript
const debouncedSearch = useMemo(
  () => debounce((value: string) => {
    setSearchText(value);
  }, 300),
  []
);
```

4. **虚拟滚动**
- AG Grid 自带虚拟滚动
- 列筛选菜单的值列表也使用虚拟滚动（如果值很多）

## 国际化 (i18n)

### 需要添加的翻译键

```json
// zh/common.json
{
  "result": {
    "copySelected": "复制选中",
    "noRowsSelected": "请先选择要复制的行",
    "copySuccess": "已成功复制 {{count}} 行到剪贴板",
    "rangeCopySuccess": "已成功复制 {{rows}} 行 {{cols}} 列到剪贴板",
    "copyFailed": "复制到剪贴板失败",
    "filter": {
      "search": "搜索...",
      "searchColumn": "搜索列...",
      "selectAll": "全选",
      "invert": "反选",
      "duplicates": "重复项",
      "unique": "唯一项",
      "include": "包含",
      "exclude": "排除",
      "availableColumns": "可筛选的列",
      "noColumns": "未找到列"
    }
  },
  "common": {
    "apply": "应用",
    "reset": "重置"
  }
}
```

## 测试策略

### 单元测试

1. **useGridCopy Hook 测试**
   - 测试 TSV 格式转换
   - 测试特殊字符处理
   - 测试空值处理

2. **ColumnFilterMenu 组件测试**
   - 测试唯一值计算
   - 测试搜索过滤
   - 测试快捷操作

### 集成测试

1. **复制功能测试**
   - 选中单元格区域 → 按 Ctrl+C → 验证剪贴板内容
   - 选中行 → 点击"复制选中"按钮 → 验证剪贴板内容

2. **列筛选测试**
   - 打开筛选菜单 → 选择值 → 应用 → 验证表格数据

3. **命令面板测试**
   - 按 Ctrl+K → 搜索列 → 选择 → 验证筛选菜单打开

## 文件结构

```
frontend/src/new/Query/ResultPanel/
├── ResultPanel.tsx                    # 主组件（已有，需增强）
├── AGGridWrapper.tsx                  # AG Grid 封装（已有，需增强）
├── ColumnFilterMenu.tsx               # 列筛选菜单（新增）
├── ColumnFilterCommand.tsx            # 列筛选命令面板（新增）
├── CustomHeaderComponent.tsx          # 自定义表头组件（新增）
├── hooks/
│   ├── index.ts
│   ├── useGridStats.ts                # 统计信息（已有）
│   ├── useAGGridConfig.ts             # Grid 配置（已有，需增强）
│   ├── useColumnTypeDetection.ts      # 列类型检测（已有）
│   ├── useGridCopy.ts                 # 复制功能（新增）
│   ├── useColumnFilter.ts             # 列筛选（新增）
│   └── useGridKeyboard.ts             # 键盘快捷键（新增）
└── __tests__/
    ├── ResultPanel.test.tsx           # 主组件测试（已有）
    ├── useGridCopy.test.ts            # 复制功能测试（新增）
    └── ColumnFilterMenu.test.tsx      # 列筛选测试（新增）
```

## 实现顺序

### 阶段 1：基础功能（P0）
1. 启用 AG Grid Range Selection
2. 实现 useGridCopy Hook
3. 添加键盘事件处理（Ctrl+C）
4. 增强 ResultToolbar（复制选中按钮）

### 阶段 2：列筛选（P0）
5. 创建 ColumnFilterMenu 组件
6. 实现唯一值计算和显示
7. 实现快捷操作（全选、反选等）
8. 集成到 AG Grid 列标题

### 阶段 3：命令面板（P1）
9. 创建 ColumnFilterCommand 组件
10. 添加 Ctrl+K 快捷键
11. 集成列筛选功能

### 阶段 4：优化和测试（P1）
12. 性能优化（useMemo、采样）
13. 添加单元测试
14. 添加集成测试
15. 完善 i18n 翻译

## 兼容性考虑

### AG Grid 版本
- 使用 AG Grid v34 Community
- 必须设置 `theme: 'legacy'` 禁用 Theming API
- 只使用 Alpine CSS 主题

### 浏览器兼容性
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- 使用 `navigator.clipboard` API（需要 HTTPS）

### 降级方案
- 如果 `navigator.clipboard` 不可用，显示错误提示
- 如果 AG Grid Range Selection 不支持，只支持行选择

## 安全考虑

1. **剪贴板权限**
   - 使用 `navigator.clipboard.writeText()` 需要用户授权
   - 捕获权限错误并显示友好提示

2. **数据量限制**
   - 限制复制的最大行数（如 100,000 行）
   - 超过限制时显示警告

3. **XSS 防护**
   - 所有用户输入都经过转义
   - 使用 React 的自动转义机制

## 总结

本设计文档详细描述了如何在 AG Grid 结果面板中实现类似 Excel 的交互功能。核心要点：

1. **使用 AG Grid 原生功能** - Range Selection、Row Selection
2. **shadcn/ui 组件** - 保持 UI 一致性
3. **性能优化** - 采样、useMemo、虚拟滚动
4. **用户体验** - 快捷键、Toast 提示、国际化
5. **渐进增强** - 分阶段实现，P0 → P1

