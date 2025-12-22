# 查询工作台功能增强 - 技术设计文档

> **版本**: 1.0  
> **创建时间**: 2024-12-19  
> **状态**: 📐 设计阶段

---

## 1️⃣ SQL 格式化增强设计

### 1.1 技术选型

**推荐方案**：使用 `sql-formatter` 库

**理由**：
- 成熟稳定，GitHub 5k+ stars
- 支持多种 SQL 方言（PostgreSQL 与 DuckDB 兼容）
- 高度可配置
- 正确处理注释和字符串
- 包体积小（~50KB gzipped）

**安装**：
```bash
npm install sql-formatter
```

### 1.2 配置方案

```typescript
// frontend/src/new/utils/sqlFormatter.ts

import { format, type FormatOptions } from 'sql-formatter';

/**
 * DataGrip 风格 SQL 格式化配置
 */
const DATAGRIP_FORMAT_OPTIONS: FormatOptions = {
  language: 'postgresql',  // DuckDB 兼容 PostgreSQL
  tabWidth: 4,
  useTabs: false,
  keywordCase: 'upper',
  identifierCase: 'preserve',
  dataTypeCase: 'upper',
  functionCase: 'upper',
  linesBetweenQueries: 2,
  denseOperators: false,
  newlineBeforeSemicolon: false,
  indentStyle: 'standard',
  logicalOperatorNewline: 'before',
  expressionWidth: 50,
  // 关键配置：SELECT 列表每列一行
  tabulateAlias: true,
};

/**
 * 格式化 SQL（DataGrip 风格）
 * 包含降级策略：格式化失败或结果异常时返回原始 SQL
 */
export function formatSQLDataGrip(sql: string): string {
  if (!sql.trim()) return sql;
  
  try {
    const formatted = format(sql, DATAGRIP_FORMAT_OPTIONS);
    
    // 降级检查：格式化结果异常时返回原始 SQL
    // 如果格式化后长度比原始短超过 50%，认为格式化异常
    if (formatted.length < sql.length * 0.5) {
      console.warn('SQL 格式化结果异常，返回原始 SQL');
      return sql;
    }
    
    return formatted;
  } catch (error) {
    console.error('SQL 格式化失败:', error);
    // 格式化失败时返回原始 SQL
    return sql;
  }
}

/**
 * 紧凑格式化（单行）
 */
export function formatSQLCompact(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}
```

### 1.3 集成到 SQL 编辑器（支持选区格式化）

```typescript
// 修改 frontend/src/new/Query/SQLQuery/hooks/useSQLEditor.ts

import { formatSQLDataGrip } from '@/new/utils/sqlFormatter';

// 替换现有的 formatSQL 函数，支持选区格式化
const formatSQL = useCallback(() => {
  // 获取编辑器选区
  const selection = editorRef.current?.getSelection();
  const selectedText = editorRef.current?.getSelectedText?.();
  
  if (selectedText && selectedText.trim()) {
    // 有选中文本：只格式化选中部分
    const formatted = formatSQLDataGrip(selectedText);
    editorRef.current?.replaceSelection?.(formatted);
  } else {
    // 无选中文本：格式化全文
    const formatted = formatSQLDataGrip(sql);
    setSQL(formatted);
  }
}, [sql]);
```

### 1.4 格式化效果对比

**输入**：
```sql
SELECT a.id, a.name, b.value FROM table_a a LEFT JOIN table_b b ON a.id = b.a_id WHERE a.status = 1 AND b.type IN ('x', 'y') ORDER BY a.created_at DESC LIMIT 100
```

**输出**：
```sql
SELECT
    a.id,
    a.name,
    b.value
FROM
    table_a a
    LEFT JOIN table_b b ON a.id = b.a_id
WHERE
    a.status = 1
    AND b.type IN ('x', 'y')
ORDER BY
    a.created_at DESC
LIMIT
    100
```

---

## 2️⃣ TanStack Table 功能增强设计

### 2.1 列可见性管理

#### 2.1.1 Hook 设计

```typescript
// frontend/src/new/Query/DataGrid/hooks/useColumnVisibility.ts

import { useState, useCallback, useMemo, useEffect } from 'react';

export interface ColumnVisibilityState {
  [field: string]: boolean;
}

export interface UseColumnVisibilityOptions {
  /** 所有列 */
  columns: string[];
  /** 初始可见性 */
  initialVisibility?: ColumnVisibilityState;
  /** 变化回调 */
  onChange?: (visibility: ColumnVisibilityState) => void;
  // 注意：不持久化到 localStorage，仅会话级
  // 原因：查询工作台的 SQL 是动态的，不同查询返回不同列结构
}

export interface UseColumnVisibilityReturn {
  /** 可见性状态 */
  visibility: ColumnVisibilityState;
  /** 可见列列表 */
  visibleColumns: string[];
  /** 隐藏列列表 */
  hiddenColumns: string[];
  /** 切换列可见性 */
  toggleColumn: (field: string) => void;
  /** 设置列可见性 */
  setColumnVisible: (field: string, visible: boolean) => void;
  /** 显示所有列 */
  showAllColumns: () => void;
  /** 隐藏所有列 */
  hideAllColumns: () => void;
  /** 重置为默认 */
  resetVisibility: () => void;
  /** 列可见性信息（用于 UI） */
  columnVisibilityInfo: Array<{
    field: string;
    visible: boolean;
  }>;
}

export function useColumnVisibility({
  columns,
  initialVisibility,
  onChange,
}: UseColumnVisibilityOptions): UseColumnVisibilityReturn {
  // 仅会话级状态，不持久化到 localStorage
  // 每次执行新查询后，列可见性重置为全部显示
  const [visibility, setVisibility] = useState<ColumnVisibilityState>(
    initialVisibility || {}
  );

  // 当列变化时（新查询），重置可见性
  useEffect(() => {
    setVisibility({});
  }, [columns.join(',')]);

  // 通知变化
  useEffect(() => {
    onChange?.(visibility);
  }, [visibility, onChange]);

  // 可见列
  const visibleColumns = useMemo(() => {
    return columns.filter((col) => visibility[col] !== false);
  }, [columns, visibility]);

  // 隐藏列
  const hiddenColumns = useMemo(() => {
    return columns.filter((col) => visibility[col] === false);
  }, [columns, visibility]);

  // 切换可见性
  const toggleColumn = useCallback((field: string) => {
    setVisibility((prev) => ({
      ...prev,
      [field]: prev[field] === false ? true : false,
    }));
  }, []);

  // 设置可见性
  const setColumnVisible = useCallback((field: string, visible: boolean) => {
    setVisibility((prev) => ({
      ...prev,
      [field]: visible,
    }));
  }, []);

  // 显示所有
  const showAllColumns = useCallback(() => {
    setVisibility({});
  }, []);

  // 隐藏所有
  const hideAllColumns = useCallback(() => {
    const newVisibility: ColumnVisibilityState = {};
    columns.forEach((col) => {
      newVisibility[col] = false;
    });
    setVisibility(newVisibility);
  }, [columns]);

  // 重置
  const resetVisibility = useCallback(() => {
    setVisibility(initialVisibility || {});
  }, [initialVisibility]);

  // 列信息
  const columnVisibilityInfo = useMemo(() => {
    return columns.map((field) => ({
      field,
      visible: visibility[field] !== false,
    }));
  }, [columns, visibility]);

  return {
    visibility,
    visibleColumns,
    hiddenColumns,
    toggleColumn,
    setColumnVisible,
    showAllColumns,
    hideAllColumns,
    resetVisibility,
    columnVisibilityInfo,
  };
}
```

#### 2.1.2 集成到 DataGrid

```typescript
// 修改 DataGrid.tsx

interface DataGridProps {
  // ... 现有 props
  /** 列可见性变化回调 */
  onColumnVisibilityChange?: (visibility: Record<string, boolean>) => void;
}

// 在组件内部
const {
  visibility,
  visibleColumns: visibleColumnFields,
  toggleColumn,
  showAllColumns,
  resetVisibility,
  columnVisibilityInfo,
} = useColumnVisibility({
  columns: allColumns,
  // 不传 storageKey，仅会话级
  onChange: onColumnVisibilityChange,
});
```

### 2.2 导出功能设计

#### 2.2.1 Hook 设计

```typescript
// frontend/src/new/Query/DataGrid/hooks/useGridExport.ts

import { useCallback } from 'react';
import { toast } from 'sonner';

export interface UseGridExportOptions {
  /** 数据 */
  data: Record<string, unknown>[];
  /** 列（按顺序） */
  columns: string[];
  /** 筛选后的数据 */
  filteredData?: Record<string, unknown>[];
  /** 选中的行索引 */
  selectedRows?: number[];
}

export interface ExportOptions {
  /** 文件名（不含扩展名） */
  filename?: string;
  /** 导出范围 */
  scope?: 'all' | 'filtered' | 'selected';
  /** 是否包含表头 */
  includeHeader?: boolean;
}

export interface UseGridExportReturn {
  /** 导出为 CSV */
  exportCSV: (options?: ExportOptions) => void;
  /** 导出为 JSON */
  exportJSON: (options?: ExportOptions) => void;
  /** 是否可以导出选中数据 */
  canExportSelected: boolean;
}

/**
 * 序列化单元格值（处理特殊类型）
 * 解决 BigInt、LIST、STRUCT 等 DuckDB 特殊类型的序列化问题
 */
function serializeCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  // 处理 BigInt（JSON.stringify 会崩溃）
  if (typeof value === 'bigint') {
    return value.toString();
  }
  
  // 处理 Date
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  // 处理数组和对象（LIST、STRUCT 类型）
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  
  return String(value);
}

/**
 * 转义 CSV 值
 */
function escapeCSVValue(value: unknown): string {
  const str = serializeCellValue(value);
  // 如果包含逗号、换行或引号，需要用引号包裹
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * JSON.stringify 的 replacer，处理 BigInt
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

/**
 * 下载文件
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  // 添加 UTF-8 BOM（Excel 兼容）
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useGridExport({
  data,
  columns,
  filteredData,
  selectedRows,
}: UseGridExportOptions): UseGridExportReturn {
  // 获取要导出的数据
  const getExportData = useCallback(
    (scope: 'all' | 'filtered' | 'selected' = 'all'): Record<string, unknown>[] => {
      switch (scope) {
        case 'filtered':
          return filteredData || data;
        case 'selected':
          if (selectedRows && selectedRows.length > 0) {
            const sourceData = filteredData || data;
            return selectedRows.map((idx) => sourceData[idx]).filter(Boolean);
          }
          return [];
        default:
          return data;
      }
    },
    [data, filteredData, selectedRows]
  );

  // 导出 CSV
  const exportCSV = useCallback(
    (options: ExportOptions = {}) => {
      const {
        filename = `export_${Date.now()}`,
        scope = 'all',
        includeHeader = true,
      } = options;

      const exportData = getExportData(scope);
      if (exportData.length === 0) {
        toast.error('没有数据可导出');
        return;
      }

      const lines: string[] = [];

      // 表头
      if (includeHeader) {
        lines.push(columns.map(escapeCSVValue).join(','));
      }

      // 数据行
      exportData.forEach((row) => {
        const values = columns.map((col) => escapeCSVValue(row[col]));
        lines.push(values.join(','));
      });

      const content = lines.join('\n');
      downloadFile(content, `${filename}.csv`, 'text/csv');
      toast.success(`已导出 ${exportData.length} 行数据`);
    },
    [columns, getExportData]
  );

  // 导出 JSON
  const exportJSON = useCallback(
    (options: ExportOptions = {}) => {
      const { filename = `export_${Date.now()}`, scope = 'all' } = options;

      const exportData = getExportData(scope);
      if (exportData.length === 0) {
        toast.error('没有数据可导出');
        return;
      }

      // 只导出可见列
      const filteredExportData = exportData.map((row) => {
        const newRow: Record<string, unknown> = {};
        columns.forEach((col) => {
          newRow[col] = row[col];
        });
        return newRow;
      });

      // 使用 jsonReplacer 处理 BigInt
      const content = JSON.stringify(filteredExportData, jsonReplacer, 2);
      downloadFile(content, `${filename}.json`, 'application/json');
      toast.success(`已导出 ${exportData.length} 行数据`);
    },
    [columns, getExportData]
  );

  return {
    exportCSV,
    exportJSON,
    canExportSelected: (selectedRows?.length || 0) > 0,
    // 用于 UI 显示当前预览数据行数
    previewRowCount: data.length,
  };
}
```

### 2.3 列冻结（Pinning）设计

```typescript
// frontend/src/new/Query/DataGrid/hooks/useColumnPinning.ts

import { useState, useCallback, useMemo } from 'react';

export interface UseColumnPinningOptions {
  /** 所有列 */
  columns: string[];
  /** 列宽映射 */
  columnWidths: Record<string, number>;
}

export interface UseColumnPinningReturn {
  /** 冻结的列 */
  pinnedColumns: string[];
  /** 冻结列到左侧 */
  pinColumn: (field: string) => void;
  /** 取消冻结 */
  unpinColumn: (field: string) => void;
  /** 判断列是否冻结 */
  isColumnPinned: (field: string) => boolean;
  /** 获取冻结列的 left 偏移量 */
  getPinnedColumnLeft: (field: string) => number;
}

export function useColumnPinning({
  columns,
  columnWidths,
}: UseColumnPinningOptions): UseColumnPinningReturn {
  const [pinnedColumns, setPinnedColumns] = useState<string[]>([]);

  const pinColumn = useCallback((field: string) => {
    setPinnedColumns((prev) => {
      if (prev.includes(field)) return prev;
      // 不能冻结所有列
      if (prev.length >= columns.length - 1) return prev;
      return [...prev, field];
    });
  }, [columns.length]);

  const unpinColumn = useCallback((field: string) => {
    setPinnedColumns((prev) => prev.filter((col) => col !== field));
  }, []);

  const isColumnPinned = useCallback(
    (field: string) => pinnedColumns.includes(field),
    [pinnedColumns]
  );

  // 计算冻结列的 left 偏移量
  const getPinnedColumnLeft = useCallback(
    (field: string): number => {
      const index = pinnedColumns.indexOf(field);
      if (index === -1) return 0;
      
      let left = 0;
      for (let i = 0; i < index; i++) {
        left += columnWidths[pinnedColumns[i]] || 120;
      }
      return left;
    },
    [pinnedColumns, columnWidths]
  );

  return {
    pinnedColumns,
    pinColumn,
    unpinColumn,
    isColumnPinned,
    getPinnedColumnLeft,
  };
}
```

**CSS 实现（Tailwind）**：
```tsx
// 冻结列的样式
<div
  className={cn(
    'absolute top-0 bg-background',
    isPinned && 'sticky z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'
  )}
  style={{
    left: isPinned ? getPinnedColumnLeft(field) : undefined,
  }}
>
  {/* 列内容 */}
</div>
```

### 2.4 工具栏集成

```typescript
// 修改 ResultToolbar.tsx，添加 DataGrid 模式的支持

// 当 useNewDataGrid = true 时：
// - 显示列可见性控制（使用 columnVisibilityInfo）
// - 显示导出按钮（调用 exportCSV/exportJSON）
// - 导出菜单显示"仅导出当前预览数据"提示
// - 导出菜单提供"全量导出 (异步任务)"入口
// - 显示选中单元格数而非选中行数
```

### 2.5 虚拟滚动与面板调整大小兼容性

```typescript
// 在 DataGrid 组件中添加 ResizeObserver 监听

import { useEffect, useRef } from 'react';

// 在组件内部
const containerRef = useRef<HTMLDivElement>(null);

// 监听容器大小变化，触发虚拟滚动重新计算
useEffect(() => {
  if (!containerRef.current) return;
  
  const resizeObserver = new ResizeObserver(() => {
    // 触发虚拟滚动重新计算
    // TanStack Virtual 的 virtualizer.measure() 或类似方法
    virtualizer?.measure?.();
  });
  
  resizeObserver.observe(containerRef.current);
  return () => resizeObserver.disconnect();
}, [virtualizer]);

// JSX
<div ref={containerRef} className="h-full overflow-auto">
  {/* 虚拟滚动内容 */}
</div>
```

**注意事项**：
- 当用户拖拽 ResizablePanel 调整大小时，必须触发虚拟滚动重新计算
- 否则会出现列表底部空白或滚动条错乱的问题

---

## 3️⃣ 异步任务功能增强设计

### 3.1 架构说明

异步任务是一个**三合一**的流程：
1. 后端执行 SQL 查询
2. 查询结果自动保存到 DuckDB 临时表（可自定义表名）
3. 任务完成后可在异步任务面板下载 CSV/Parquet 文件

因此，发起对话框不需要选择"任务类型"，只需要提供可选的自定义表名和显示名。

### 3.2 异步任务发起对话框（简化版）

```typescript
// frontend/src/new/Query/AsyncTasks/AsyncTaskDialog.tsx

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/new/components/ui/dialog';
import { Button } from '@/new/components/ui/button';
import { Input } from '@/new/components/ui/input';
import { Label } from '@/new/components/ui/label';
import { Textarea } from '@/new/components/ui/textarea';
import { Alert, AlertDescription } from '@/new/components/ui/alert';
import { submitAsyncQuery } from '@/services/apiClient';

export interface AsyncTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sql: string;
  onSuccess?: (taskId: string) => void;
}

// 表名校验正则：字母/下划线开头，只包含字母/数字/下划线
const TABLE_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_TABLE_NAME_LENGTH = 64;

export const AsyncTaskDialog: React.FC<AsyncTaskDialogProps> = ({
  open,
  onOpenChange,
  sql,
  onSuccess,
}) => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();

  const [customTableName, setCustomTableName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [overwriteIfExists, setOverwriteIfExists] = useState(false);
  const [tableNameError, setTableNameError] = useState<string | null>(null);

  // 校验表名
  const validateTableName = useCallback((name: string): string | null => {
    if (!name) return null; // 空值允许，会自动生成
    if (name.length > MAX_TABLE_NAME_LENGTH) {
      return t('async.error.tableNameTooLong', '表名不能超过 {{max}} 个字符', { max: MAX_TABLE_NAME_LENGTH });
    }
    if (!TABLE_NAME_REGEX.test(name)) {
      return t('async.error.tableNameInvalid', '表名只能包含字母、数字、下划线，且不能以数字开头');
    }
    return null;
  }, [t]);

  // 处理表名变化
  const handleTableNameChange = useCallback((value: string) => {
    setCustomTableName(value);
    setTableNameError(validateTableName(value));
  }, [validateTableName]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      return submitAsyncQuery({
        sql,
        custom_table_name: customTableName || undefined,
        display_name: displayName || undefined,
        overwrite_if_exists: overwriteIfExists,
      });
    },
    onSuccess: (data) => {
      toast.success(t('async.submitSuccess', '异步任务已提交'));
      // 刷新任务列表
      queryClient.invalidateQueries({ queryKey: ['async-tasks'] });
      // 重要：刷新 DuckDB 表列表，确保新表立即出现在侧边栏
      queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] });
      onSuccess?.(data.task_id);
      onOpenChange(false);
      // 重置表单
      setCustomTableName('');
      setDisplayName('');
      setOverwriteIfExists(false);
      setTableNameError(null);
    },
    onError: (error: Error) => {
      toast.error(t('async.submitFailed', '提交失败: {{message}}', { message: error.message }));
    },
  });

  const handleSubmit = useCallback(() => {
    const error = validateTableName(customTableName);
    if (error) {
      setTableNameError(error);
      return;
    }
    submitMutation.mutate();
  }, [customTableName, validateTableName, submitMutation]);

  const canSubmit = !tableNameError && !submitMutation.isPending && sql.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('async.dialog.title', '提交异步任务')}
          </DialogTitle>
          <DialogDescription>
            {t('async.dialog.description', '异步执行 SQL 查询，结果将保存到 DuckDB 表中，完成后可下载')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* SQL 预览 */}
          <div className="grid gap-2">
            <Label>{t('async.dialog.sql', 'SQL 语句')}</Label>
            <Textarea
              value={sql}
              readOnly
              className="h-24 font-mono text-xs bg-muted"
            />
          </div>

          {/* 自定义表名 */}
          <div className="grid gap-2">
            <Label htmlFor="tableName">
              {t('async.dialog.tableName', '结果表名')}
              <span className="text-muted-foreground ml-1">
                ({t('common.optional', '可选')})
              </span>
            </Label>
            <Input
              id="tableName"
              value={customTableName}
              onChange={(e) => handleTableNameChange(e.target.value)}
              placeholder={t('async.dialog.tableNamePlaceholder', '留空则自动生成 async_result_xxx')}
              className={tableNameError ? 'border-destructive' : ''}
            />
            {tableNameError && (
              <p className="text-sm text-destructive">{tableNameError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('async.dialog.tableNameHint', '只能包含字母、数字、下划线，不能以数字开头')}
            </p>
          </div>

          {/* 显示名 */}
          <div className="grid gap-2">
            <Label htmlFor="displayName">
              {t('async.dialog.displayName', '显示名')}
              <span className="text-muted-foreground ml-1">
                ({t('common.optional', '可选')})
              </span>
            </Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('async.dialog.displayNamePlaceholder', '在任务列表中显示的友好名称')}
            />
          </div>

          {/* 提示信息 */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('async.dialog.hint', '任务完成后，可在异步任务面板预览结果或下载 CSV/Parquet 文件')}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel', '取消')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitMutation.isPending
              ? t('async.dialog.submitting', '提交中...')
              : t('async.dialog.submit', '提交任务')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

### 3.2 下载结果对话框

```typescript
// frontend/src/new/Query/AsyncTasks/DownloadResultDialog.tsx

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileSpreadsheet, FileJson } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/new/components/ui/dialog';
import { Button } from '@/new/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/new/components/ui/radio-group';
import { Label } from '@/new/components/ui/label';
import { Alert, AlertDescription } from '@/new/components/ui/alert';

export interface DownloadResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  onDownload: (taskId: string, format: 'csv' | 'parquet') => void;
  isDownloading?: boolean;
}

export const DownloadResultDialog: React.FC<DownloadResultDialogProps> = ({
  open,
  onOpenChange,
  taskId,
  onDownload,
  isDownloading = false,
}) => {
  const { t } = useTranslation('common');
  const [format, setFormat] = useState<'csv' | 'parquet'>('parquet');

  const handleDownload = () => {
    onDownload(taskId, format);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t('async.download.title', '下载结果')}</DialogTitle>
          <DialogDescription>
            {t('async.download.description', '选择下载格式')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <RadioGroup value={format} onValueChange={(v) => setFormat(v as 'csv' | 'parquet')}>
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
              <RadioGroupItem value="parquet" id="parquet" />
              <div className="flex-1">
                <Label htmlFor="parquet" className="flex items-center gap-2 cursor-pointer">
                  <FileJson className="h-4 w-4" />
                  Parquet 格式
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  高效的列式存储格式，适合大数据分析，文件体积小
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer mt-2">
              <RadioGroupItem value="csv" id="csv" />
              <div className="flex-1">
                <Label htmlFor="csv" className="flex items-center gap-2 cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4" />
                  CSV 格式
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  通用的表格格式，兼容 Excel 等工具
                </p>
              </div>
            </div>
          </RadioGroup>

          <Alert className="mt-4">
            <AlertDescription>
              {t('async.download.hint', '文件生成完成后将自动开始下载')}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel', '取消')}
          </Button>
          <Button onClick={handleDownload} disabled={isDownloading}>
            <Download className="h-4 w-4 mr-2" />
            {isDownloading
              ? t('async.download.generating', '生成中...')
              : t('async.download.download', '下载')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

---

## 4️⃣ 文件变更清单

### 新增文件

| 文件路径 | 说明 |
|----------|------|
| `frontend/src/new/utils/sqlFormatter.ts` | SQL 格式化工具（封装 sql-formatter，含降级策略） |
| `frontend/src/new/Query/DataGrid/hooks/useColumnVisibility.ts` | 列可见性 Hook（仅会话级） |
| `frontend/src/new/Query/DataGrid/hooks/useColumnPinning.ts` | 列冻结 Hook |
| `frontend/src/new/Query/DataGrid/hooks/useGridExport.ts` | 导出功能 Hook（含类型序列化） |
| `frontend/src/new/Query/DataGrid/utils/serializeCellValue.ts` | 单元格值序列化工具 |
| `frontend/src/new/Query/AsyncTasks/AsyncTaskDialog.tsx` | 异步任务发起对话框（含覆盖选项） |
| `frontend/src/new/Query/AsyncTasks/DownloadResultDialog.tsx` | 下载结果对话框 |

### 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `frontend/src/new/Query/SQLQuery/hooks/useSQLEditor.ts` | 替换格式化函数 |
| `frontend/src/new/Query/SQLQuery/SQLQueryPanel.tsx` | 添加异步执行按钮 |
| `frontend/src/new/Query/DataGrid/DataGrid.tsx` | 集成列可见性和导出 |
| `frontend/src/new/Query/DataGrid/hooks/index.ts` | 导出新 Hooks |
| `frontend/src/new/Query/ResultPanel/ResultPanel.tsx` | 默认使用 DataGrid |
| `frontend/src/new/Query/ResultPanel/ResultToolbar.tsx` | 支持 DataGrid 功能 |
| `frontend/src/new/Query/AsyncTasks/AsyncTaskPanel.tsx` | 完善功能 |
| `frontend/package.json` | 添加 sql-formatter 依赖 |
| `frontend/src/i18n/locales/zh/common.json` | 添加新增翻译 |
| `frontend/src/i18n/locales/en/common.json` | 添加新增翻译 |

---

## 5️⃣ 实施计划

### Phase 1: SQL 格式化（0.5 天）
1. 安装 sql-formatter 依赖
2. 创建 sqlFormatter.ts 工具
3. 集成到 useSQLEditor
4. 测试各种 SQL 场景

### Phase 2: TanStack Table 增强（2 天）
1. 实现 useColumnVisibility Hook
2. 实现 useGridExport Hook
3. 集成到 DataGrid 组件
4. 更新 ResultToolbar 支持
5. 设置 DataGrid 为默认
6. UI 风格调整

### Phase 3: 异步任务完善（2 天）
1. 创建 AsyncTaskDialog 组件
2. 创建 DownloadResultDialog 组件
3. 完善 AsyncTaskPanel 功能
4. 集成到 SQL 面板
5. 添加快捷键支持

### Phase 4: 测试与优化（0.5 天）
1. 功能测试
2. 性能测试
3. 深色模式测试
4. 国际化测试

---

## 6️⃣ 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| sql-formatter 不支持 DuckDB 特有语法 | 中 | 中 | 使用 PostgreSQL 方言，格式化失败/异常返回原始 SQL |
| DataGrid 性能问题 | 中 | 低 | 已有虚拟滚动，大数据量已验证 |
| 虚拟滚动与面板调整冲突 | 中 | 中 | 使用 ResizeObserver 监听容器变化 |
| 异步任务 API 变更 | 低 | 低 | 后端 API 已稳定 |
| 用户习惯 AG Grid | 中 | 中 | 保留切换选项，渐进式迁移 |
| 导出大文件内存溢出 | 高 | 中 | 限制前端导出 5 万行，大文件使用异步任务 |
| BigInt/复杂类型导出崩溃 | 高 | 中 | 实现 serializeCellValue 统一处理 |
| 表名冲突 | 中 | 中 | 添加"覆盖"选项，后端校验 |
| 前端/后端导出概念混淆 | 中 | 高 | 导出菜单明确提示，提供异步任务入口 |
| 侧边栏不刷新 | 中 | 中 | 任务成功后同时刷新 duckdb-tables |

---

## 7️⃣ 测试用例

### SQL 格式化测试

| 测试场景 | 输入 | 预期输出 |
|----------|------|----------|
| 简单 SELECT | `select a,b from t` | 格式化后关键字大写，列分行 |
| 带 JOIN | `select * from a join b on a.id=b.id` | JOIN 正确缩进 |
| 带注释 | `select a -- comment` | 注释保留 |
| 带字符串 | `select 'hello world'` | 字符串内容不变 |
| 语法错误 | `select from` | 返回原始 SQL |
| 空输入 | `` | 返回空字符串 |
| 中文标识符 | `select "订单号" from t` | 正确处理 |
| DuckDB EXCLUDE | `select * exclude (col) from t` | 返回原始 SQL（不支持） |
| DuckDB PIVOT | `pivot ... on ...` | 返回原始 SQL（不支持） |
| 选区格式化 | 选中部分 SQL | 只格式化选中部分 |

### DataGrid 导出测试

| 测试场景 | 预期结果 |
|----------|----------|
| 导出空数据 | 禁用按钮，显示提示 |
| 导出 100 行 | < 100ms 完成 |
| 导出 10000 行 | < 1s 完成 |
| 导出 50000 行 | < 3s 完成 |
| 导出 > 50000 行 | 显示警告，建议使用异步任务 |
| 包含逗号的值 | CSV 正确转义 |
| 包含换行的值 | CSV 正确转义 |
| 包含引号的值 | CSV 正确转义 |
| NULL 值 | CSV 为空，JSON 为 null |
| BigInt 值 | 正确转为字符串，不崩溃 |
| LIST 类型 | 序列化为 JSON 字符串 |
| STRUCT 类型 | 序列化为 JSON 字符串 |
| 导出菜单 | 显示"仅导出当前预览数据"提示 |

### 异步任务测试

| 测试场景 | 预期结果 |
|----------|----------|
| 提交空 SQL | 禁用提交按钮 |
| 表名包含特殊字符 | 显示校验错误 |
| 表名过长 | 显示校验错误 |
| 表名已存在（不覆盖） | 后端返回错误，前端显示提示 |
| 表名已存在（覆盖） | 成功覆盖，显示成功提示 |
| 网络错误 | 显示错误提示 |
| 提交成功 | 显示成功提示，刷新任务列表和侧边栏 |
| 任务成功后 | 新表立即出现在左侧数据源面板 |
| 下载 CSV | 正确下载文件 |
| 下载 Parquet | 正确下载文件 |

### 列冻结测试

| 测试场景 | 预期结果 |
|----------|----------|
| 冻结单列 | 列固定在左侧，水平滚动时不移动 |
| 冻结多列 | 按冻结顺序从左到右排列 |
| 取消冻结 | 列恢复正常滚动 |
| 冻结所有列 | 禁止，至少保留一列非冻结 |
| 调整冻结列宽度 | 其他冻结列位置自动调整 |

### 虚拟滚动测试

| 测试场景 | 预期结果 |
|----------|----------|
| 拖拽调整面板大小 | 列表正确重新渲染，无空白 |
| 快速滚动 | 60fps，无卡顿 |
| 10 万行数据 | 流畅滚动，内存 < 200MB |
