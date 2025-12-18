# Requirements Document

## Introduction

本文档定义了基于 TanStack Table + @tanstack/react-virtual 的新数据网格组件需求。该组件将替换现有的 AG Grid 实现，提供飞书式的单元格选区、TSV/CSV 复制、Excel 风格筛选等功能，同时支持大数据量的虚拟滚动渲染。

所有代码将在 `frontend/src/new/` 目录下全新实现，遵循 shadcn/ui + Tailwind CSS 规范，不复用旧 UI 组件。

## 性能基线定义

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 最大行数 | 10 万行 | 全量前端渲染，不依赖后端分页 |
| 典型列数 | 20-50 列 | 常见查询结果 |
| 最大列数 | 200 列 | 需启用列虚拟化 |
| 滚动帧率 | 60fps | Chrome 120+, macOS/Windows |
| 首屏渲染 | < 500ms | 1 万行 × 20 列 |
| 筛选响应 | < 100ms | 低基数列（< 1000 唯一值） |

## Glossary

- **DataGrid**: 数据网格组件，用于展示表格数据
- **Cell Selection**: 单元格选区，支持鼠标拖拽和 Shift+Click 选择多个单元格
- **Range Selection**: 范围选择，类似 Excel/飞书的矩形选区
- **Virtual Scrolling**: 虚拟滚动，只渲染可视区域的行，支持大数据量
- **Column Filter**: 列筛选，Excel 风格的值筛选菜单
- **TSV**: Tab-Separated Values，制表符分隔的文本格式
- **CSV**: Comma-Separated Values，逗号分隔的文本格式
- **TanStack Table**: 无头表格库，提供表格逻辑但不包含 UI
- **TanStack Virtual**: 虚拟滚动库，高性能渲染大列表

## Requirements

### Requirement 1: 核心数据网格组件

**User Story:** As a 数据分析师, I want 一个高性能的数据网格组件, so that 我可以浏览和操作大量查询结果数据。

#### Acceptance Criteria

1. WHEN 用户加载数据 THEN DataGrid SHALL 使用 TanStack Table 管理表格状态和逻辑
2. WHEN 用户加载数据 THEN DataGrid SHALL 始终启用行虚拟滚动（实现统一走虚拟化，小数据也可直接渲染）
3. WHEN 用户调整列宽 THEN DataGrid SHALL 保存列宽状态并支持拖拽调整
4. WHEN 用户点击列头 THEN DataGrid SHALL 支持单列排序和多列排序（Ctrl+Click）
5. WHEN 数据为空 THEN DataGrid SHALL 显示空状态提示
6. WHEN 数据加载中 THEN DataGrid SHALL 显示加载状态

### Requirement 2: 飞书式单元格选区（单矩形模型）

**User Story:** As a 用户, I want 像飞书多维表格一样选择单元格区域, so that 我可以方便地复制部分数据。

**选区模型说明：** 采用单矩形选区模型（类似 DataGrip/Excel 默认行为），不支持任意离散单元格集合。Ctrl+Click 行为为"重新开始新选区"而非"添加到现有选区"。

**选区索引语义：** 
- 选区的 rowIndex/colIndex 基于**当前可见视图**（filtered + sorted 后的 rowIndexMap），而非原始数据索引
- 复制/统计等操作需通过 `table.getRowModel().rows[rowIndex].original` 映射回原始数据
- 数据更新（如筛选/排序变化）后，选区需重新验证有效性：若选区超出新数据范围则自动收缩或清除

**colIndex 语义（列隐藏/重排/虚拟化场景）：**
- colIndex 基于 `table.getVisibleLeafColumns()` 返回的**当前可见列顺序**，而非原始 columns 数组索引
- 列隐藏后：隐藏列不参与 colIndex 计数，选区自动跳过隐藏列
- 列重排后：colIndex 跟随新顺序，选区保持视觉一致性
- 列虚拟化时：colIndex 仍基于完整可见列数组，虚拟化只影响渲染范围
- 获取列字段名：通过 `table.getVisibleLeafColumns()[colIndex].id` 获取

#### Acceptance Criteria

1. WHEN 用户单击单元格 THEN DataGrid SHALL 选中该单元格并显示选中样式，同时清除之前的选区
2. WHEN 用户按住鼠标拖拽 THEN DataGrid SHALL 扩展选区为矩形区域
3. WHEN 用户 Shift+Click 另一个单元格 THEN DataGrid SHALL 扩展选区从锚点单元格到目标单元格形成矩形
4. WHEN 用户 Ctrl+Click 单元格 THEN DataGrid SHALL 清除当前选区并以该单元格为新锚点开始新选区
5. WHEN 用户按 Esc THEN DataGrid SHALL 清除当前选区
6. WHEN 用户使用方向键 THEN DataGrid SHALL 移动当前焦点单元格
7. WHEN 用户 Shift+方向键 THEN DataGrid SHALL 扩展选区
8. WHEN 用户拖拽到网格边缘 THEN DataGrid SHALL 自动滚动（阈值 50px，速度随距离递增）
9. WHEN 选区跨越虚拟化边界 THEN DataGrid SHALL 正确计算选区覆盖层位置（基于虚拟行列 offset）

### Requirement 3: 复制功能（TSV/CSV/JSON）

**User Story:** As a 用户, I want 复制选中的单元格数据, so that 我可以粘贴到 Excel 或其他应用。

**复制格式规则：**
- 复制使用原始值，不使用显示格式（避免千分位逗号问题）
- TSV/CSV: NULL → 空字符串
- JSON: NULL → `null`（保留语义）
- 数字/ID: 不做千分位格式化，保持原始数值

**大数据复制安全阈值：**
- 当选区单元格数 > 200,000 时，显示警告对话框"选区过大（约 XX 万单元格），可能导致浏览器卡顿。建议缩小范围或使用导出功能"
- 用户可选择"继续复制"或"取消"
- 若用户选择继续，复制过程中显示 loading 指示器

#### Acceptance Criteria

1. WHEN 用户按 Ctrl+C/Cmd+C THEN DataGrid SHALL 将选区数据复制为 TSV 格式到剪贴板（使用原始值）
2. WHEN 用户右键选择"复制为 CSV" THEN DataGrid SHALL 将选区数据复制为 CSV 格式（使用原始值）
3. WHEN 用户右键选择"复制为 JSON" THEN DataGrid SHALL 将选区数据复制为 JSON 格式（NULL → null）
4. WHEN 复制包含特殊字符（换行、制表符、引号） THEN DataGrid SHALL 正确转义这些字符
5. WHEN 复制成功 THEN DataGrid SHALL 显示 Toast 提示
6. WHEN 选区包含 NULL 值 THEN DataGrid SHALL 按格式规则处理（TSV/CSV 为空，JSON 为 null）
7. WHEN 复制数字类型数据 THEN DataGrid SHALL 使用原始数值而非显示格式
8. WHEN 选区单元格数超过 200,000 THEN DataGrid SHALL 显示警告提示并让用户确认是否继续

### Requirement 4: Excel 风格列筛选（支持高基数列）

**User Story:** As a 用户, I want 通过列头筛选数据, so that 我可以快速找到需要的数据。

**筛选策略（按列基数区分）：**
- **低基数列**（唯一值 < 1000）：值列表 include/exclude 模式，实时筛选
- **高基数列**（唯一值 ≥ 1000）：
  - 值列表只显示 Top 100（按出现次数 desc 排序，次数相同则按字典序 asc）+ 提示"仅展示部分值，可使用条件过滤"
  - 提供条件过滤（contains/equals/startsWith/endsWith），**条件过滤作用于全量数据**（非仅 Top 100），确保筛选结果准确
  - 筛选需点击"应用"按钮生效（非实时）
- **大数据筛选**：筛选计算使用 debounce（300ms）+ loading 指示器

#### Acceptance Criteria

1. WHEN 用户点击列头筛选按钮 THEN DataGrid SHALL 显示筛选菜单
2. WHEN 筛选菜单打开且列为低基数 THEN DataGrid SHALL 显示该列所有唯一值列表
3. WHEN 筛选菜单打开且列为高基数 THEN DataGrid SHALL 显示 Top 100 值（按出现次数 desc，次数相同按字典序 asc）+ 条件过滤输入框 + 提示"仅展示部分值"
4. WHEN 用户在低基数列勾选/取消勾选值 THEN DataGrid SHALL 实时筛选数据（debounce 300ms）
5. WHEN 用户在高基数列设置条件 THEN DataGrid SHALL 等待用户点击"应用"按钮后执行筛选
6. WHEN 用户在筛选菜单搜索 THEN DataGrid SHALL 过滤值列表
7. WHEN 用户点击"全选"/"清空" THEN DataGrid SHALL 选中/清空所有值
8. WHEN 用户点击"反选" THEN DataGrid SHALL 反转当前选择
9. WHEN 列有活跃筛选 THEN DataGrid SHALL 在列头显示筛选图标高亮
10. WHEN 用户点击"清除筛选" THEN DataGrid SHALL 移除该列筛选
11. WHEN 筛选计算耗时超过 100ms THEN DataGrid SHALL 显示 loading 指示器

### Requirement 5: 列头交互

**User Story:** As a 用户, I want 通过列头进行各种操作, so that 我可以方便地管理数据展示。

#### Acceptance Criteria

1. WHEN 用户点击列头排序按钮 THEN DataGrid SHALL 切换排序状态（无→升序→降序→无）
2. WHEN 用户点击列头复制按钮 THEN DataGrid SHALL 复制列名到剪贴板
3. WHEN 用户拖拽列头边缘 THEN DataGrid SHALL 调整列宽
4. WHEN 用户双击列头边缘 THEN DataGrid SHALL 自动调整列宽以适应内容
5. WHEN 列正在排序 THEN DataGrid SHALL 显示排序方向图标

### Requirement 6: 大数据支持（行列双向虚拟化）

**User Story:** As a 用户, I want 流畅地浏览大量数据, so that 我不会因为数据量大而卡顿。

**虚拟化策略：**
- **行虚拟化**：始终启用（实现统一走虚拟化，小数据也可直接渲染），overscan = 5 行
- **列虚拟化**：列数 > 50 时启用，overscan = 3 列
- **滚动同步**：列头与主体水平滚动同步（使用 scrollLeft 同步）

#### Acceptance Criteria

1. WHEN 数据量达到 10 万行 THEN DataGrid SHALL 保持流畅滚动（60fps）
2. WHEN 用户快速滚动 THEN DataGrid SHALL 使用行虚拟滚动只渲染可视区域（overscan = 5）
3. WHEN 列数超过 50 THEN DataGrid SHALL 启用列虚拟化（overscan = 3）
4. WHEN 用户水平滚动 THEN DataGrid SHALL 同步列头和主体的滚动位置
5. WHEN 用户筛选大数据 THEN DataGrid SHALL 在 React 外层进行筛选计算
6. WHEN 筛选计算耗时超过 100ms THEN DataGrid SHALL 显示加载指示器
7. WHEN 数据更新 THEN DataGrid SHALL 保持当前滚动位置
8. WHEN 选区跨越虚拟化边界 THEN DataGrid SHALL 正确计算选区覆盖层位置

### Requirement 7: 主题和样式

**User Story:** As a 用户, I want 数据网格适配深色/浅色主题, so that 我可以在不同环境下舒适使用。

#### Acceptance Criteria

1. WHEN 系统切换主题 THEN DataGrid SHALL 自动适配深色/浅色模式
2. WHEN 单元格被选中 THEN DataGrid SHALL 显示选中背景色
3. WHEN 单元格被悬停 THEN DataGrid SHALL 显示悬停效果
4. WHEN 数据为 NULL THEN DataGrid SHALL 显示特殊样式（灰色斜体）
5. WHEN 数据为数字 THEN DataGrid SHALL 右对齐显示

### Requirement 8: 键盘可访问性（ARIA Grid 语义）

**User Story:** As a 用户, I want 完全通过键盘操作数据网格, so that 我可以高效地浏览和操作数据。

**可访问性规范：**
- 使用 `role="grid"` / `role="row"` / `role="gridcell"` 语义
- 使用 roving tabIndex 策略（只有焦点单元格 tabIndex=0）
- 焦点单元格显示 focus ring（使用 Tailwind `ring-2 ring-primary`）

#### Acceptance Criteria

1. WHEN 用户按 Tab THEN DataGrid SHALL 将焦点移入/移出网格（roving tabIndex）
2. WHEN 用户按方向键 THEN DataGrid SHALL 移动焦点单元格
3. WHEN 用户按 Home/End THEN DataGrid SHALL 跳转到行首/行尾
4. WHEN 用户按 Ctrl+Home/End THEN DataGrid SHALL 跳转到表格首/尾
5. WHEN 用户按 Page Up/Down THEN DataGrid SHALL 翻页滚动
6. WHEN 用户按 Ctrl+A THEN DataGrid SHALL 逻辑全选（设置 selection.all = true，不枚举每个单元格）
7. WHEN 单元格获得焦点 THEN DataGrid SHALL 显示 focus ring
8. WHEN DataGrid 渲染 THEN DataGrid SHALL 使用正确的 ARIA role 属性（grid/row/gridcell）

### Requirement 9: 右键菜单

**User Story:** As a 用户, I want 通过右键菜单快速操作, so that 我可以方便地执行常用操作。

#### Acceptance Criteria

1. WHEN 用户右键单元格 THEN DataGrid SHALL 显示上下文菜单
2. WHEN 右键菜单显示 THEN DataGrid SHALL 包含复制选项（TSV/CSV/JSON）
3. WHEN 右键菜单显示 THEN DataGrid SHALL 包含筛选选项（筛选此值/排除此值）
4. WHEN 用户点击菜单外部 THEN DataGrid SHALL 关闭菜单
5. WHEN 用户按 Esc THEN DataGrid SHALL 关闭菜单

### Requirement 10: 统计信息

**User Story:** As a 用户, I want 查看数据统计信息, so that 我可以了解当前数据概况。

#### Acceptance Criteria

1. WHEN 数据加载完成 THEN DataGrid SHALL 显示总行数
2. WHEN 数据被筛选 THEN DataGrid SHALL 显示筛选后行数
3. WHEN 单元格被选中 THEN DataGrid SHALL 显示选中单元格数量
4. WHEN 选中数字列 THEN DataGrid SHALL 显示求和/平均值（可选）
