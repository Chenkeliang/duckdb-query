# ResultPanel 交互优化建议

## 🎯 核心理念

**参考 Excel/Google Sheets 的交互模式**，让数据分析师和开发者能够像使用电子表格一样自然地操作数据。

## 📋 交互优化方向

### 1. 单元格和行选择 🖱️

#### 1.1 多种选择模式

**当前问题**：
- 只能查看数据，不能选择单元格或行
- 无法复制选中的数据

**优化方案**：

```typescript
// 支持三种选择模式
type SelectionMode = 'cell' | 'row' | 'column';

interface Selection {
  mode: SelectionMode;
  cells?: { row: number; col: number }[];
  rows?: number[];
  columns?: string[];
}

const [selection, setSelection] = useState<Selection>({
  mode: 'cell',
  cells: [],
});
```

**交互行为**：

| 操作 | 行为 | 快捷键 |
|-----|------|-------|
| 单击单元格 | 选中单个单元格 | - |
| Shift + 单击 | 选中范围（矩形区域） | Shift |
| Ctrl + 单击 | 多选单元格 | Ctrl/Cmd |
| 单击行号 | 选中整行 | - |
| Shift + 单击行号 | 选中多行 | Shift |
| 单击列头 | 选中整列 | - |
| Ctrl + A | 全选 | Ctrl/Cmd + A |

**视觉反馈**：
```jsx
<div
  className={cn(
    "px-3 py-2 border-r border-border",
    isSelected && "bg-primary/10 border-primary",
    isFocused && "ring-2 ring-primary ring-inset"
  )}
  onClick={handleCellClick}
  onMouseDown={handleMouseDown}
  onMouseEnter={handleMouseEnter}
>
  {cellValue}
</div>
```

#### 1.2 复制功能增强

**优化方案**：

```typescript
// 复制选中的数据
const copySelection = useCallback(() => {
  if (selection.cells && selection.cells.length > 0) {
    // 复制单元格
    const values = selection.cells.map(({ row, col }) => {
      return data[row][columns[col].field];
    });
    
    // 如果是矩形区域，保持表格格式
    if (isRectangularSelection(selection.cells)) {
      const text = formatAsTable(values, selection.cells);
      navigator.clipboard.writeText(text);
    } else {
      // 否则用逗号分隔
      navigator.clipboard.writeText(values.join(', '));
    }
  } else if (selection.rows && selection.rows.length > 0) {
    // 复制整行（TSV 格式，可粘贴到 Excel）
    const text = selection.rows
      .map(rowIndex => {
        return columns
          .map(col => data[rowIndex][col.field])
          .join('\t');
      })
      .join('\n');
    navigator.clipboard.writeText(text);
  } else if (selection.columns && selection.columns.length > 0) {
    // 复制整列
    const text = selection.columns
      .map(colField => {
        return data.map(row => row[colField]).join('\n');
      })
      .join('\t');
    navigator.clipboard.writeText(text);
  }
  
  toast.success('已复制到剪贴板');
}, [selection, data, columns]);

// 快捷键绑定
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      copySelection();
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [copySelection]);
```

**右键菜单**：
```jsx
<ContextMenu>
  <ContextMenuTrigger>
    {/* 表格内容 */}
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onClick={copySelection}>
      <Copy className="mr-2 h-4 w-4" />
      复制 (Ctrl+C)
    </ContextMenuItem>
    <ContextMenuItem onClick={copyAsCSV}>
      <FileText className="mr-2 h-4 w-4" />
      复制为 CSV
    </ContextMenuItem>
    <ContextMenuItem onClick={copyAsJSON}>
      <Braces className="mr-2 h-4 w-4" />
      复制为 JSON
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem onClick={exportSelection}>
      <Download className="mr-2 h-4 w-4" />
      导出选中数据
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

### 2. 键盘导航 ⌨️

#### 2.1 Excel 风格的键盘导航

**优化方案**：

```typescript
const handleKeyDown = useCallback((e: KeyboardEvent) => {
  if (!focusedCell) return;
  
  const { row, col } = focusedCell;
  
  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault();
      setFocusedCell({ row: Math.max(0, row - 1), col });
      break;
    case 'ArrowDown':
      e.preventDefault();
      setFocusedCell({ row: Math.min(data.length - 1, row + 1), col });
      break;
    case 'ArrowLeft':
      e.preventDefault();
      setFocusedCell({ row, col: Math.max(0, col - 1) });
      break;
    case 'ArrowRight':
      e.preventDefault();
      setFocusedCell({ row, col: Math.min(columns.length - 1, col + 1) });
      break;
    case 'Home':
      e.preventDefault();
      if (e.ctrlKey) {
        // Ctrl+Home: 跳到第一个单元格
        setFocusedCell({ row: 0, col: 0 });
      } else {
        // Home: 跳到当前行第一列
        setFocusedCell({ row, col: 0 });
      }
      break;
    case 'End':
      e.preventDefault();
      if (e.ctrlKey) {
        // Ctrl+End: 跳到最后一个单元格
        setFocusedCell({ row: data.length - 1, col: columns.length - 1 });
      } else {
        // End: 跳到当前行最后一列
        setFocusedCell({ row, col: columns.length - 1 });
      }
      break;
    case 'PageUp':
      e.preventDefault();
      setFocusedCell({ row: Math.max(0, row - 20), col });
      break;
    case 'PageDown':
      e.preventDefault();
      setFocusedCell({ row: Math.min(data.length - 1, row + 20), col });
      break;
    case 'Enter':
      e.preventDefault();
      // Enter: 下移一行
      setFocusedCell({ row: Math.min(data.length - 1, row + 1), col });
      break;
    case 'Tab':
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab: 左移一列
        setFocusedCell({ row, col: Math.max(0, col - 1) });
      } else {
        // Tab: 右移一列
        setFocusedCell({ row, col: Math.min(columns.length - 1, col + 1) });
      }
      break;
  }
}, [focusedCell, data, columns]);
```

**快捷键列表**：

| 快捷键 | 功能 |
|-------|------|
| ↑ ↓ ← → | 移动焦点 |
| Ctrl + Home | 跳到第一个单元格 |
| Ctrl + End | 跳到最后一个单元格 |
| Home | 跳到当前行第一列 |
| End | 跳到当前行最后一列 |
| Page Up/Down | 上下翻页（20 行） |
| Enter | 下移一行 |
| Tab | 右移一列 |
| Shift + Tab | 左移一列 |
| Ctrl + A | 全选 |
| Ctrl + C | 复制 |
| Ctrl + F | 搜索 |

### 3. 快速操作工具栏 🛠️

#### 3.1 浮动工具栏

**优化方案**：

```jsx
// 当有选中内容时，显示浮动工具栏
{selection.cells.length > 0 && (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
    <Card className="shadow-2xl border-border">
      <CardContent className="p-2 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          已选中 {selection.cells.length} 个单元格
        </span>
        <Separator orientation="vertical" className="h-6" />
        <Button
          size="sm"
          variant="ghost"
          onClick={copySelection}
        >
          <Copy className="h-4 w-4 mr-2" />
          复制
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={exportSelection}
        >
          <Download className="h-4 w-4 mr-2" />
          导出
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={createChartFromSelection}
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          创建图表
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={calculateStats}
        >
          <Calculator className="h-4 w-4 mr-2" />
          统计
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <Button
          size="sm"
          variant="ghost"
          onClick={clearSelection}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  </div>
)}
```

#### 3.2 选中数据统计

**优化方案**：

```typescript
// 自动计算选中数据的统计信息
const selectionStats = useMemo(() => {
  if (selection.cells.length === 0) return null;
  
  const values = selection.cells
    .map(({ row, col }) => data[row][columns[col].field])
    .filter(v => v !== null && v !== undefined);
  
  const numericValues = values
    .map(v => normalizeNumberLike(v))
    .filter(v => v !== null);
  
  if (numericValues.length === 0) {
    return {
      count: values.length,
      type: 'text',
    };
  }
  
  return {
    count: values.length,
    type: 'numeric',
    sum: numericValues.reduce((a, b) => a + b, 0),
    avg: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
  };
}, [selection, data, columns]);
```

**显示统计信息**：
```jsx
{selectionStats && (
  <div className="flex items-center gap-4 text-sm text-muted-foreground">
    <span>计数: {selectionStats.count}</span>
    {selectionStats.type === 'numeric' && (
      <>
        <span>求和: {selectionStats.sum.toFixed(2)}</span>
        <span>平均: {selectionStats.avg.toFixed(2)}</span>
        <span>最小: {selectionStats.min}</span>
        <span>最大: {selectionStats.max}</span>
      </>
    )}
  </div>
)}
```

### 4. 列操作增强 📊

#### 4.1 列宽调整

**优化方案**：

```jsx
// 双击列边界自动调整列宽
const autoFitColumn = useCallback((columnField: string) => {
  const column = columns.find(c => c.field === columnField);
  if (!column) return;
  
  // 计算最大内容宽度
  const maxWidth = Math.max(
    // 列头宽度
    measureText(column.headerName, '600 14px Inter'),
    // 内容宽度（采样前 100 行）
    ...data.slice(0, 100).map(row => 
      measureText(String(row[columnField]), '400 13px JetBrains Mono')
    )
  );
  
  // 设置列宽（加上 padding）
  setColumnWidths(prev => ({
    ...prev,
    [columnField]: Math.min(maxWidth + 32, 400), // 最大 400px
  }));
}, [columns, data]);

// 列头右键菜单
<ContextMenu>
  <ContextMenuTrigger>
    {/* 列头 */}
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onClick={() => autoFitColumn(column.field)}>
      <Maximize2 className="mr-2 h-4 w-4" />
      自动调整列宽
    </ContextMenuItem>
    <ContextMenuItem onClick={() => autoFitAllColumns()}>
      <Maximize className="mr-2 h-4 w-4" />
      自动调整所有列宽
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem onClick={() => hideColumn(column.field)}>
      <EyeOff className="mr-2 h-4 w-4" />
      隐藏此列
    </ContextMenuItem>
    <ContextMenuItem onClick={() => freezeColumn(column.field)}>
      <Pin className="mr-2 h-4 w-4" />
      冻结此列
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

#### 4.2 列重排序（拖拽）

**优化方案**：

```typescript
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';

const [columnOrder, setColumnOrder] = useState<string[]>(
  columns.map(c => c.field)
);

const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  
  if (over && active.id !== over.id) {
    setColumnOrder((items) => {
      const oldIndex = items.indexOf(active.id as string);
      const newIndex = items.indexOf(over.id as string);
      return arrayMove(items, oldIndex, newIndex);
    });
  }
};

// 使用
<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
    {columnOrder.map(field => (
      <SortableColumnHeader key={field} field={field} />
    ))}
  </SortableContext>
</DndContext>
```

#### 4.3 列固定（冻结）

**优化方案**：

```typescript
const [frozenColumns, setFrozenColumns] = useState<string[]>([]);

// 固定列样式
<div
  className={cn(
    "table-cell",
    frozenColumns.includes(column.field) && "sticky left-0 z-10 bg-surface shadow-[2px_0_4px_rgba(0,0,0,0.1)]"
  )}
  style={{
    left: frozenColumns.includes(column.field)
      ? calculateFrozenOffset(column.field)
      : undefined,
  }}
>
  {/* 列内容 */}
</div>
```

### 5. 搜索和定位 🔍

#### 5.1 全局搜索

**优化方案**：

```jsx
// Ctrl+F 打开搜索对话框
const [searchDialogOpen, setSearchDialogOpen] = useState(false);
const [searchQuery, setSearchQuery] = useState('');
const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
const [currentResultIndex, setCurrentResultIndex] = useState(0);

interface SearchResult {
  row: number;
  col: number;
  value: any;
  match: string;
}

const performSearch = useCallback(() => {
  const results: SearchResult[] = [];
  
  data.forEach((row, rowIndex) => {
    columns.forEach((col, colIndex) => {
      const value = row[col.field];
      const valueStr = String(value).toLowerCase();
      const queryLower = searchQuery.toLowerCase();
      
      if (valueStr.includes(queryLower)) {
        results.push({
          row: rowIndex,
          col: colIndex,
          value,
          match: valueStr,
        });
      }
    });
  });
  
  setSearchResults(results);
  setCurrentResultIndex(0);
  
  // 跳到第一个结果
  if (results.length > 0) {
    setFocusedCell({ row: results[0].row, col: results[0].col });
    scrollToCell(results[0].row, results[0].col);
  }
}, [searchQuery, data, columns]);

// 搜索对话框
<Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>搜索</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="输入搜索内容..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && performSearch()}
          autoFocus
        />
        <Button onClick={performSearch}>
          <Search className="h-4 w-4" />
        </Button>
      </div>
      
      {searchResults.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            找到 {searchResults.length} 个结果
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const prevIndex = (currentResultIndex - 1 + searchResults.length) % searchResults.length;
                setCurrentResultIndex(prevIndex);
                const result = searchResults[prevIndex];
                setFocusedCell({ row: result.row, col: result.col });
                scrollToCell(result.row, result.col);
              }}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const nextIndex = (currentResultIndex + 1) % searchResults.length;
                setCurrentResultIndex(nextIndex);
                const result = searchResults[nextIndex];
                setFocusedCell({ row: result.row, col: result.col });
                scrollToCell(result.row, result.col);
              }}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  </DialogContent>
</Dialog>
```

#### 5.2 快速跳转

**优化方案**：

```jsx
// Ctrl+G 打开跳转对话框
const [jumpDialogOpen, setJumpDialogOpen] = useState(false);
const [jumpRow, setJumpRow] = useState('');
const [jumpCol, setJumpCol] = useState('');

const handleJump = () => {
  const row = parseInt(jumpRow) - 1; // 用户输入从 1 开始
  const col = parseInt(jumpCol) - 1;
  
  if (row >= 0 && row < data.length && col >= 0 && col < columns.length) {
    setFocusedCell({ row, col });
    scrollToCell(row, col);
    setJumpDialogOpen(false);
  } else {
    toast.error('无效的行列号');
  }
};

<Dialog open={jumpDialogOpen} onOpenChange={setJumpDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>跳转到单元格</DialogTitle>
    </DialogHeader>
    <div className="flex gap-2">
      <Input
        placeholder="行号"
        type="number"
        value={jumpRow}
        onChange={(e) => setJumpRow(e.target.value)}
      />
      <Input
        placeholder="列号"
        type="number"
        value={jumpCol}
        onChange={(e) => setJumpCol(e.target.value)}
      />
      <Button onClick={handleJump}>跳转</Button>
    </div>
  </DialogContent>
</Dialog>
```

### 6. 数据预览增强 👁️

#### 6.1 单元格悬停预览

**优化方案**：

```jsx
// 长文本悬停显示完整内容
<Tooltip>
  <TooltipTrigger asChild>
    <div className="truncate max-w-[200px]">
      {cellValue}
    </div>
  </TooltipTrigger>
  <TooltipContent side="top" className="max-w-md">
    <div className="space-y-2">
      <div className="font-mono text-xs whitespace-pre-wrap break-all">
        {cellValue}
      </div>
      <Separator />
      <div className="text-xs text-muted-foreground">
        类型: {typeof cellValue} | 长度: {String(cellValue).length}
      </div>
    </div>
  </TooltipContent>
</Tooltip>
```

#### 6.2 JSON/对象展开查看

**优化方案**：

```jsx
// 对于 JSON 对象，提供展开查看
const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

const renderCellValue = (value: any, row: number, col: number) => {
  const cellKey = `${row}-${col}`;
  const isExpanded = expandedCells.has(cellKey);
  
  if (typeof value === 'object' && value !== null) {
    return (
      <div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setExpandedCells(prev => {
              const next = new Set(prev);
              if (isExpanded) {
                next.delete(cellKey);
              } else {
                next.add(cellKey);
              }
              return next;
            });
          }}
        >
          {isExpanded ? <ChevronDown /> : <ChevronRight />}
          {isExpanded ? 'Object' : `{${Object.keys(value).length}}`}
        </Button>
        {isExpanded && (
          <pre className="text-xs mt-2 p-2 bg-muted rounded">
            {JSON.stringify(value, null, 2)}
          </pre>
        )}
      </div>
    );
  }
  
  return String(value);
};
```

### 7. 批量操作 ⚡

#### 7.1 批量导出

**优化方案**：

```typescript
// 导出选中的行/列
const exportSelection = useCallback(async (format: 'csv' | 'json' | 'excel') => {
  let exportData: any[];
  
  if (selection.rows && selection.rows.length > 0) {
    // 导出选中的行
    exportData = selection.rows.map(rowIndex => data[rowIndex]);
  } else if (selection.columns && selection.columns.length > 0) {
    // 导出选中的列
    exportData = data.map(row => {
      const filtered: any = {};
      selection.columns!.forEach(col => {
        filtered[col] = row[col];
      });
      return filtered;
    });
  } else {
    // 导出所有数据
    exportData = data;
  }
  
  // 调用导出 API
  await exportData(exportData, format);
  toast.success(`已导出 ${exportData.length} 行数据`);
}, [selection, data]);
```

#### 7.2 批量应用过滤器

**优化方案**：

```jsx
// 右键选中的列，快速应用过滤器
<ContextMenuItem onClick={() => {
  const values = selection.cells.map(({ row, col }) => 
    data[row][columns[col].field]
  );
  const uniqueValues = [...new Set(values)];
  
  // 应用过滤器：只显示选中的值
  applyColumnFilter(column.field, {
    includeMode: 'include',
    selectedKeys: uniqueValues.map(makeValueKey),
  });
}}>
  <Filter className="mr-2 h-4 w-4" />
  仅显示选中的值
</ContextMenuItem>
```

## 📊 交互优化优先级

### 🔴 高优先级（立即实施）

1. **单元格和行选择** - 基础交互能力
2. **复制功能** - 最常用的操作
3. **键盘导航** - 提升操作效率
4. **右键菜单** - 快捷操作入口

### 🟡 中优先级（后续迭代）

5. **浮动工具栏** - 提升操作便捷性
6. **列宽调整和重排序** - 个性化布局
7. **全局搜索** - 快速定位数据
8. **选中数据统计** - 即时数据分析

### 🟢 低优先级（可选）

9. **列固定（冻结）** - 大表格场景
10. **JSON 展开查看** - 复杂数据类型
11. **批量操作** - 高级用户需求

## 🎯 实施建议

### Phase 1: 基础交互（Week 1）
- 单元格和行选择
- 复制功能（Ctrl+C）
- 键盘导航（方向键、Home/End）
- 右键菜单

### Phase 2: 增强交互（Week 2）
- 浮动工具栏
- 列宽调整（双击自动调整）
- 全局搜索（Ctrl+F）
- 选中数据统计

### Phase 3: 高级功能（Week 3）
- 列重排序（拖拽）
- 列固定（冻结）
- JSON 展开查看
- 批量操作

## ✅ 预期效果

实施这些交互优化后：

1. **操作效率提升 5-10 倍**
   - 键盘导航减少鼠标操作
   - 快捷键提升常用操作速度
   - 批量操作减少重复劳动

2. **用户体验显著改善**
   - 像使用 Excel 一样自然
   - 右键菜单提供快捷入口
   - 浮动工具栏减少点击距离

3. **功能更强大**
   - 支持复杂的数据选择和复制
   - 支持列的个性化布局
   - 支持快速搜索和定位

---

**文档创建时间**: 2024-12-04  
**参考标准**: Excel, Google Sheets  
**状态**: 📝 待评审
