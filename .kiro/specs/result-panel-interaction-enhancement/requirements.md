# AG Grid 结果面板交互增强 - 需求文档

## 简介

为 AG Grid 结果面板添加类似 Excel 的交互功能，包括单元格级别的选择复制、列筛选、行选择复制等，提升用户的数据操作体验。

## 术语表

- **ResultPanel**: AG Grid 结果展示面板组件
- **Cell Range Selection**: 单元格区域选择，用户可以用鼠标选中任意单元格区域
- **Range Copy**: 区域复制，将选中的单元格区域复制到剪贴板
- **Row Selection**: 行选择，用户可以选中一行或多行
- **Column Filter**: 列筛选，类似 Excel 的列筛选功能
- **TSV Format**: Tab-Separated Values，制表符分隔的数据格式
- **cmdk**: Command Menu 组件库，用于实现命令面板

## 需求

### 需求 1: 单元格区域选择

**用户故事**: 作为用户，我希望能用鼠标选中表格中的任意单元格区域（类似 Excel），这样可以灵活地选择需要的数据。

#### 验收标准

1. WHEN 用户在 AG Grid 中按住鼠标左键拖动 THEN 系统应高亮显示选中的单元格区域
2. WHEN 用户选中单元格区域 THEN 系统应显示选中区域的边框和背景色
3. WHEN 用户按住 Shift 键点击单元格 THEN 系统应从上次选中的单元格扩展选区到当前单元格
4. WHEN 用户按住 Ctrl/Cmd 键点击单元格 THEN 系统应支持多区域选择
5. WHEN 用户点击空白区域 THEN 系统应清除所有选中的单元格区域

### 需求 2: 单元格区域复制（Ctrl+C）

**用户故事**: 作为用户，我希望能用 Ctrl+C 复制选中的单元格区域，这样可以快速将数据粘贴到 Excel 或其他应用。

#### 验收标准

1. WHEN 用户选中单元格区域后按 Ctrl+C (Windows) 或 Cmd+C (Mac) THEN 系统应将选中区域的数据复制到剪贴板
2. WHEN 复制单元格区域 THEN 系统应使用 TSV 格式（制表符分隔行内数据，换行符分隔行）
3. WHEN 复制的数据包含特殊字符（制表符、换行符） THEN 系统应用双引号包围并转义内部引号
4. WHEN 复制成功 THEN 系统应显示 Toast 提示"已复制 X 行 Y 列到剪贴板"
5. WHEN 没有选中任何单元格 THEN 按 Ctrl+C 应不执行任何操作

### 需求 3: 行选择复制按钮

**用户故事**: 作为用户，我希望在工具栏看到"复制选中行"按钮，这样可以快速复制整行数据。

#### 验收标准

1. WHEN 用户选中一行或多行 THEN 工具栏应显示"复制选中"按钮
2. WHEN 用户点击"复制选中"按钮 THEN 系统应将选中的完整行（包括所有列）复制到剪贴板
3. WHEN 复制选中行 THEN 系统应包含列标题作为第一行
4. WHEN 没有选中任何行 THEN "复制选中"按钮应不显示
5. WHEN 复制成功 THEN 系统应显示 Toast 提示"已复制 X 行到剪贴板"

### 需求 4: Excel 风格列筛选

**用户故事**: 作为用户，我希望能像 Excel 一样对列进行筛选，这样可以快速找到需要的数据。

#### 验收标准

1. WHEN 用户点击列标题的筛选图标 THEN 系统应显示筛选菜单
2. WHEN 筛选菜单打开 THEN 系统应显示该列的所有唯一值列表（最多 1000 个）
3. WHEN 筛选菜单打开 THEN 系统应显示每个值的出现次数
4. WHEN 用户在筛选菜单中输入搜索文本 THEN 系统应实时过滤唯一值列表
5. WHEN 用户点击"全选" THEN 系统应选中所有唯一值
6. WHEN 用户点击"反选" THEN 系统应反转当前选中状态
7. WHEN 用户点击"重复项" THEN 系统应只选中出现次数 > 1 的值
8. WHEN 用户点击"唯一项" THEN 系统应只选中出现次数 = 1 的值
9. WHEN 用户切换"包含/排除"模式 THEN 系统应更新筛选逻辑
10. WHEN 用户应用筛选 THEN 系统应只显示符合条件的行
11. WHEN 多个列都有筛选 THEN 系统应使用 AND 逻辑组合所有筛选条件
12. WHEN 列有活动筛选 THEN 列标题的筛选图标应高亮显示

### 需求 5: 列筛选命令面板（cmdk）

**用户故事**: 作为用户，我希望能通过快捷键快速打开列筛选面板，这样可以更高效地操作。

#### 验收标准

1. WHEN 用户按 Ctrl+K (Windows) 或 Cmd+K (Mac) THEN 系统应打开列筛选命令面板
2. WHEN 命令面板打开 THEN 系统应显示所有可筛选的列列表
3. WHEN 用户在命令面板中输入列名 THEN 系统应实时过滤列列表
4. WHEN 用户选择一个列 THEN 系统应打开该列的筛选菜单
5. WHEN 用户按 Esc THEN 系统应关闭命令面板

### 需求 6: 快捷键支持

**用户故事**: 作为用户，我希望能使用快捷键快速操作表格，这样可以提高工作效率。

#### 验收标准

1. WHEN 用户按 Ctrl+C / Cmd+C THEN 系统应复制选中的单元格区域或行
2. WHEN 用户按 Ctrl+A / Cmd+A THEN 系统应选中所有行
3. WHEN 用户按 Ctrl+F / Cmd+F THEN 系统应打开搜索框
4. WHEN 用户按 Ctrl+K / Cmd+K THEN 系统应打开列筛选命令面板
5. WHEN 用户按 Esc THEN 系统应清除所有选中状态或关闭打开的面板
6. WHEN 用户按 ↑↓←→ 方向键 THEN 系统应在单元格间导航
7. WHEN 用户按 Home THEN 系统应跳转到当前行的第一列
8. WHEN 用户按 End THEN 系统应跳转到当前行的最后一列
9. WHEN 用户按 Ctrl+Home / Cmd+Home THEN 系统应跳转到第一行第一列
10. WHEN 用户按 Ctrl+End / Cmd+End THEN 系统应跳转到最后一行最后一列

### 需求 7: 性能优化

**用户故事**: 作为用户，我希望在处理大量数据时表格仍然流畅，这样可以高效地工作。

#### 验收标准

1. WHEN 数据量小于 10,000 行 THEN 所有操作应在 100ms 内响应
2. WHEN 数据量在 10,000-100,000 行 THEN 所有操作应在 500ms 内响应
3. WHEN 复制大量数据 THEN 系统应显示加载指示器
4. WHEN 应用筛选 THEN 系统应使用虚拟滚动优化渲染性能
5. WHEN 计算唯一值 THEN 系统应采样最多 10,000 行以优化性能

## 技术约束

### AG Grid 配置

- 必须启用 `enableRangeSelection: true` 支持单元格区域选择
- 必须启用 `rowSelection: 'multiple'` 支持多行选择
- 必须使用 AG Grid v34 Community 版本
- 必须使用 `theme: 'legacy'` 禁用 Theming API
- 必须只使用官方 Alpine CSS 主题

### 组件库

- 列筛选菜单必须使用 shadcn/ui 的 Popover 组件
- 命令面板必须使用 cmdk (shadcn/ui Command 组件)
- Toast 提示必须使用 sonner
- 所有图标必须使用 lucide-react

### 样式约束

- 禁止自定义 CSS 文件
- 禁止使用 Tailwind arbitrary values
- 禁止硬编码颜色
- 只使用 shadcn/ui 组件和 Tailwind 标准类

### 性能约束

- 复制操作必须在 200ms 内完成（小于 1000 行）
- 筛选操作必须在 500ms 内完成（小于 10,000 行）
- 唯一值计算必须采样最多 10,000 行
- 必须使用 useMemo 和 useCallback 优化性能

## 参考实现

### CommandPalette 使用 cmdk

参考 `frontend/src/new/components/CommandPalette.tsx` 的实现：

```tsx
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/new/components/ui/command"

<CommandDialog open={open} onOpenChange={onOpenChange}>
  <CommandInput placeholder="搜索列..." />
  <CommandList>
    <CommandEmpty>未找到列</CommandEmpty>
    <CommandGroup heading="可筛选的列">
      {columns.map(col => (
        <CommandItem key={col.field} onSelect={() => handleSelectColumn(col)}>
          {col.headerName}
        </CommandItem>
      ))}
    </CommandGroup>
  </CommandList>
</CommandDialog>
```

### AG Grid Range Selection

```tsx
const gridOptions = useMemo(() => ({
  theme: 'legacy',
  enableRangeSelection: true,
  rowSelection: 'multiple',
  suppressCopyRowsToClipboard: false, // 允许复制
  enableCellTextSelection: true, // 允许选中单元格文本
}), []);
```

### 复制到剪贴板

```tsx
const handleCopy = useCallback(async () => {
  const ranges = gridApi.getCellRanges();
  if (!ranges || ranges.length === 0) return;
  
  const data = extractRangeData(ranges);
  const tsv = convertToTSV(data);
  
  await navigator.clipboard.writeText(tsv);
  toast.success(`已复制 ${data.length} 行 ${data[0].length} 列`);
}, [gridApi]);
```

## 功能范围

本 spec 只实现核心交互功能（P0 和 P1），不包含导出、列宽调整、单元格编辑等扩展功能。

### 包含的功能
- ✅ 需求 1: 单元格区域选择
- ✅ 需求 2: 单元格区域复制（Ctrl+C）
- ✅ 需求 3: 行选择复制按钮
- ✅ 需求 4: Excel 风格列筛选
- ✅ 需求 5: 列筛选命令面板（cmdk）
- ✅ 需求 6: 快捷键支持
- ✅ 需求 7: 性能优化

### 不包含的功能
- ❌ 导出选中行到文件（未来可扩展）
- ❌ 单元格编辑（未来可扩展）
- ❌ 可访问性增强（基础键盘导航已包含在需求 6 中）

### 已有的功能（无需实现）
- ✅ 列宽自动调整 - AG Grid 已支持（双击列分隔线自动调整）
- ✅ 列排序 - AG Grid 已支持
- ✅ 列拖动调整宽度 - AG Grid 已支持

## 非功能需求

### 用户体验

- 所有操作必须有即时的视觉反馈
- 所有异步操作必须显示加载状态
- 所有操作成功/失败必须有 Toast 提示
- 快捷键必须在界面上有提示

### 国际化

- 所有文本必须支持中英文
- 所有提示信息必须使用 i18n
- 快捷键提示必须根据操作系统显示（Ctrl/Cmd）

### 兼容性

- 必须支持 Chrome、Firefox、Safari、Edge 最新版本
- 必须支持 Windows、macOS、Linux
- 必须支持触摸屏设备（移动端）

