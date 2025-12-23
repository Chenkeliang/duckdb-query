# 双模筛选器任务清单 (Dual-Mode Filter)

> **关联文档**: requirements.md, design.md  
> **预计工时**: 6.5 人天  
> **优先级**: P0 边界处理 → P1 核心功能 → P2 高级交互 → P3 优化润色
> **版本**: 1.1 (已补充测试、无障碍性、迁移任务)

---

## 阶段 1: 核心类型与工具 (P0/P1) - 1 天

### 1.1 类型定义

- [ ] **新建 types.ts**
  - 路径: `frontend/src/new/Query/JoinQuery/FilterBar/types.ts`
  - 内容:
    - `FilterOperator` 类型
    - `LogicOperator` 类型
    - `FilterCondition` 接口
    - `FilterGroup` 接口
    - `FilterRaw` 接口
    - `FilterNode` 联合类型
    - `ColumnInfo` 接口（包含 table, column, type）

### 1.2 工具函数（含边界处理）

- [ ] **新建 filterUtils.ts**
  - 路径: `frontend/src/new/Query/JoinQuery/FilterBar/filterUtils.ts`
  - 核心函数:
    - `generateFilterSQL(node: FilterNode): string`
    - `parseFilterSQL(sql: string): FilterNode`
    - `parseFilterSQLWithTimeout(sql: string, timeout: number): Promise<FilterNode>`
    - `createEmptyGroup(): FilterGroup`
    - `createCondition(table, column, operator, value): FilterCondition`
  - 转义函数（P0 安全）:
    - `escapeSqlIdentifier(name: string): string` - 处理表名/列名特殊字符
    - `escapeSqlString(value: string): string` - 处理值中的单引号
  - 校验函数（P0 边界）:
    - `validateValueType(value: any, columnType: string): ValidationResult`
    - `validateNestingDepth(tree: FilterGroup, maxDepth: number): boolean`
    - `countConditions(tree: FilterGroup): number`

### 1.3 单元测试（P0）

- [ ] **新建 filterUtils.test.ts**
  - 文件: `frontend/src/new/Query/JoinQuery/FilterBar/__tests__/filterUtils.test.ts`
  - 测试用例:
    - **SQL 生成测试**:
      - 空条件生成空字符串
      - 单条件生成 `col = val`
      - IN 条件生成 `col IN (a, b, c)`
      - 嵌套条件生成 `(A OR B) AND C`
      - 特殊字符转义测试（表名含空格、引号）
      - 值转义测试（单引号、O'Brien）
    - **SQL 解析测试**:
      - 解析简单 SQL 返回正确结构
      - 解析复杂 SQL 降级为 Raw
      - 解析超时测试
    - **类型校验测试**:
      - 整数列拒绝非整数值
      - 日期列拒绝无效日期格式
      - 数值列拒绝非数字
    - **边界测试**:
      - 嵌套层级超过 5 层返回 false
      - 条件数量统计正确

---

## 阶段 2: 基础 UI 组件 (P1) - 1.5 天

### 2.1 FilterChip 组件

- [ ] **新建 FilterChip.tsx**
  - 路径: `frontend/src/new/Query/JoinQuery/FilterBar/FilterChip.tsx`
  - Props:
    - `node: FilterCondition`
    - `onEdit: () => void`
    - `onDelete: () => void`
  - 样式: Shadcn Badge (variant: outline)
  - 交互: 点击打开编辑 Popover, X 按钮删除

### 2.2 LogicConnector 组件

- [ ] **新建 LogicConnector.tsx**
  - 路径: `frontend/src/new/Query/JoinQuery/FilterBar/LogicConnector.tsx`
  - Props:
    - `logic: 'AND' | 'OR'`
    - `onClick: () => void`
  - 样式: 小文本按钮, hover 变色
  - 交互: 点击触发 onClick (用于切换逻辑)

### 2.3 FilterPopover 组件

- [ ] **新建 FilterPopover.tsx**
  - 路径: `frontend/src/new/Query/JoinQuery/FilterBar/FilterPopover.tsx`
  - Props:
    - `mode: 'add' | 'edit'`
    - `initialValue?: FilterCondition`
    - `availableColumns: ColumnInfo[]`
    - `onSubmit: (condition: FilterCondition) => void`
    - `onCancel: () => void`
  - 表单字段:
    - 表选择 (Select)
    - 列选择 (Select)
    - 操作符选择 (Select)
    - 值输入 (Input / TagsInput)
  - 表单校验:
    - 必填字段校验
    - 类型校验（调用 validateValueType）
    - 实时错误提示

- [ ] **实现 TagsInput 子组件**
  - 用于 IN/NOT IN 操作符的多值输入
  - 输入值 + 回车添加为 Tag
  - 每个 Tag 可点击删除
  - 支持粘贴多行文本自动分割

- [ ] **组件测试**
  - 文件: `FilterPopover.test.tsx`
  - 测试用例:
    - 表单渲染正确
    - 操作符切换时值输入框变化
    - 类型校验生效
    - 提交/取消回调正确触发
    - TagsInput 多值输入正确

### 2.4 GroupChip 组件

- [ ] **新建 GroupChip.tsx**
  - 路径: `frontend/src/new/Query/JoinQuery/FilterBar/GroupChip.tsx`
  - Props:
    - `node: FilterGroup`
    - `onUpdate: (node: FilterGroup) => void`
    - `onDelete: () => void`
  - 样式: 左边框高亮 + 浅色背景
  - 递归渲染子节点

---

## 阶段 3: FilterBar 容器 (P1) - 1 天

### 3.1 主容器组件

- [ ] **新建 FilterBar/index.tsx**
  - 路径: `frontend/src/new/Query/JoinQuery/FilterBar/index.tsx`
  - 状态管理:
    - `mode: 'visual' | 'sql'`
    - `filterTree: FilterGroup`
    - `sqlOverride: string | null`
  - 布局:
    - 顶部: 模式切换按钮组
    - 主体: VisualBuilder 或 SqlEditor

### 3.2 VisualBuilder 组件

- [ ] **新建 VisualBuilder.tsx**
  - 路径: `frontend/src/new/Query/JoinQuery/FilterBar/VisualBuilder.tsx`
  - 渲染 FilterTree 为 Chip 列表
  - 在每个 Chip 之间渲染 LogicConnector
  - 末尾渲染 "添加条件" 按钮

### 3.3 模式切换逻辑

- [ ] **实现 Visual → SQL 切换**
  - 调用 generateFilterSQL
  - 填充 SqlEditor

- [ ] **实现 SQL → Visual 切换**
  - 调用 parseFilterSQL
  - 成功则更新 filterTree
  - 失败则提示并保持 SQL 模式

---

## 阶段 4: 拖拽分组 (P2) - 1 天

### 4.1 拖拽库集成

- [ ] **安装 @dnd-kit/core**
  - 命令: `npm install @dnd-kit/core @dnd-kit/sortable`

- [ ] **配置 DndContext**
  - 在 VisualBuilder 中包裹 DndContext
  - 实现 onDragEnd 处理器

### 4.2 拖拽交互

- [ ] **FilterChip 可拖拽**
  - 使用 useDraggable hook
  - 拖拽时显示半透明副本

- [ ] **DropZone 区域**
  - Chip 之间显示 drop 区域
  - 拖拽到已有 Chip 上创建分组
  - 拖拽到分组外解除分组

### 4.3 分组操作

- [ ] **创建分组**
  - 拖拽 A 到 B 上
  - 创建新 Group 包含 A 和 B
  - 默认逻辑: AND

- [ ] **解除分组**
  - 当 Group 只剩一个子节点时自动解散
  - 或拖拽最后一个节点出去

---

## 阶段 5: 集成与入口 (P1) - 0.5 天

### 5.1 JoinQueryPanel 集成

- [ ] **添加 filterTree 状态**
  - 文件: `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx`
  - 新增 useState: `[filterTree, setFilterTree]`
  - 初始值: `{ id: 'root', type: 'group', logic: 'AND', children: [] }`

- [ ] **渲染 FilterBar**
  - 位置: TableCards 下方, SQL 预览上方
  - 传递 filterTree 和 onChange

- [ ] **SQL 生成集成**
  - 修改 generateSQL 函数
  - 将 FilterBar 的 WHERE 子句拼接到最终 SQL

### 5.2 TableCard 入口

- [ ] **添加列筛选图标**
  - 文件: `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx` (TableCard 部分)
  - 在列名右侧添加 Filter 图标（悬停显示）
  - 点击打开 FilterPopover

- [ ] **事件传递**
  - FilterPopover 提交时调用父组件的 addFilter 方法
  - addFilter: 将新条件添加到 filterTree.children

---

## 阶段 6: 优化与润色 (P3) - 0.5 天

### 6.1 视觉优化

- [ ] **暗色模式适配**
  - 检查所有组件的暗色模式样式
  - 使用 Tailwind dark: 前缀
  - 测试暗色/亮色切换

- [ ] **动画效果**
  - Chip 添加/删除动画（fade in/out）
  - 分组创建动画（scale + fade）
  - 拖拽时的视觉反馈

### 6.2 用户体验

- [ ] **键盘快捷键**
  - Enter 确认添加
  - Escape 取消编辑
  - Delete 删除条件
  - Ctrl+Z 撤销操作（可选）

- [ ] **错误提示优化**
  - SQL 解析失败时的友好提示
  - 空条件时的占位提示
  - 类型不匹配的实时提示
  - Toast 提示统一使用 i18n

### 6.3 性能优化

- [ ] **虚拟滚动集成**
  - 安装 react-window
  - 50+ 条件时启用虚拟滚动
  - 测试滚动性能

- [ ] **防抖优化**
  - 模式切换防抖 300ms
  - SQL 预览更新防抖 300ms
  - 拖拽操作使用 requestAnimationFrame

### 6.4 国际化

- [ ] **添加翻译 Key 到 zh/common.json**
  - 所有 `filter.*` 相关 key
  - 参考 requirements.md 中的完整列表

- [ ] **添加翻译 Key 到 en/common.json**
  - 所有 `filter.*` 相关 key 的英文翻译

- [ ] **组件中使用 useTranslation**
  - 所有硬编码文本替换为 t() 调用
  - 错误提示使用 i18n key

---

## 阶段 7: 测试验证 (P2) - 1 天

### 7.1 单元测试补充

- [ ] **FilterChip 测试**
  - 文件: `FilterChip.test.tsx`
  - 测试用例:
    - 渲染测试（不同操作符）
    - 编辑/删除交互测试
    - 键盘操作测试（Enter, Delete）
    - ARIA 属性测试

- [ ] **LogicConnector 测试**
  - 文件: `LogicConnector.test.tsx`
  - 测试用例:
    - AND/OR 渲染测试
    - 点击切换测试
    - 键盘操作测试

- [ ] **GroupChip 测试**
  - 文件: `GroupChip.test.tsx`
  - 测试用例:
    - 嵌套渲染测试
    - 递归子节点测试
    - 分组逻辑切换测试

### 7.2 集成测试

- [ ] **FilterBar 集成测试**
  - 文件: `FilterBar.test.tsx`
  - 测试用例:
    - 添加条件流程测试
    - 编辑条件流程测试
    - 删除条件流程测试
    - 模式切换测试（Visual ↔ SQL）
    - 状态同步测试

- [ ] **模式切换往返测试**
  - 测试用例:
    - Visual → SQL → Visual 数据一致
    - 复杂条件降级测试
    - 解析失败降级测试
    - 超时降级测试

### 7.3 E2E 测试

- [ ] **完整流程测试**
  - 测试场景:
    - 从列添加条件 → 编辑 → 删除
    - 创建分组 → 切换逻辑 → 解散分组
    - 切换模式 → 手动编辑 SQL → 切换回来
    - 生成最终 SQL 并执行查询
    - 50+ 条件性能测试
    - 特殊字符处理测试

### 7.4 无障碍性测试

- [ ] **键盘导航测试**
  - Tab 键在所有元素间正确导航
  - Enter/Space 触发正确操作
  - Escape 关闭弹窗
  - Arrow keys 在条件间导航

- [ ] **屏幕阅读器测试**
  - 使用 NVDA/JAWS 测试
  - 所有元素可正确朗读
  - ARIA 属性完整

- [ ] **焦点管理测试**
  - 弹窗打开时焦点正确
  - 弹窗关闭时焦点返回
  - 删除元素后焦点正确

---

## 阶段 8: 迁移与兼容 (P3) - 0.5 天

### 8.1 数据迁移

- [ ] **检查现有 JoinQuery 数据结构**
  - 是否有旧的 WHERE 条件存储
  - 数据格式分析

- [ ] **实现迁移函数**
  - 函数: `migrateOldFilters(oldData): FilterTree`
  - 在 JoinQueryPanel 加载时自动调用
  - 测试迁移正确性

### 8.2 向后兼容

- [ ] **保留旧 API（如需要）**
  - 如果有外部依赖旧的 WHERE 格式
  - 提供适配器函数

- [ ] **渐进式启用**
  - 添加 feature flag 控制新功能
  - 允许用户选择使用旧版或新版
  - 提供平滑过渡方案

---

## 验收检查清单

### 功能验收 ✓
- [ ] 可从列添加筛选条件
- [ ] 支持所有操作符 (=, !=, >, <, LIKE, IN, IS NULL...)
- [ ] 支持 AND/OR 逻辑切换
- [ ] 支持拖拽创建分组
- [ ] 支持模式切换双向同步
- [ ] 复杂 SQL 降级为 Raw 块
- [ ] 特殊字符正确转义
- [ ] 数据类型校验生效

### 代码质量 ✓
- [ ] TypeScript 类型完整
- [ ] 组件有 JSDoc 注释
- [ ] 核心函数有单元测试（覆盖率 > 80%）
- [ ] 无 ESLint 错误
- [ ] 无 TypeScript 错误

### 兼容性 ✓
- [ ] 暗色模式正常
- [ ] 移动端基本可用
- [ ] 与现有 JoinQuery 功能兼容
- [ ] 旧数据迁移正确

### 性能 ✓
- [ ] 50 个条件渲染无卡顿
- [ ] 100+ 条件使用虚拟滚动
- [ ] 模式切换响应 < 100ms
- [ ] SQL 解析超时正确降级

### 无障碍性 ✓
- [ ] 键盘可完整操作
- [ ] 屏幕阅读器可正确朗读
- [ ] ARIA 属性完整
- [ ] 焦点管理正确

### 错误处理 ✓
- [ ] 所有错误场景有友好提示
- [ ] SQL 注入尝试被正确阻止
- [ ] 类型不匹配有明确提示
- [ ] 解析失败不影响现有条件

### 国际化 ✓
- [ ] 所有文本使用 i18n
- [ ] 中英文翻译完整
- [ ] 语言切换正常

---

## 任务统计

### 按阶段统计

| 阶段 | 任务数 | 预计工时 | 优先级 |
|------|--------|---------|--------|
| 阶段 1: 核心类型与工具 | 3 | 1 天 | P0/P1 |
| 阶段 2: 基础 UI 组件 | 5 | 1.5 天 | P1 |
| 阶段 3: FilterBar 容器 | 3 | 1 天 | P1 |
| 阶段 4: 拖拽分组 | 3 | 1 天 | P2 |
| 阶段 5: 集成与入口 | 3 | 0.5 天 | P1 |
| 阶段 6: 优化与润色 | 4 | 0.5 天 | P3 |
| 阶段 7: 测试验证 | 4 | 1 天 | P2 |
| 阶段 8: 迁移与兼容 | 2 | 0.5 天 | P3 |
| **总计** | **27** | **6.5 天** | - |

### 按优先级统计

| 优先级 | 任务数 | 说明 |
|--------|--------|------|
| P0 | 3 | 边界处理与安全（必须优先） |
| P1 | 14 | 核心功能（主要开发） |
| P2 | 5 | 高级交互与测试 |
| P3 | 5 | 优化润色与迁移 |

### 关键里程碑

1. **Day 1**: 完成核心类型与工具（含边界处理）
2. **Day 2-3**: 完成基础 UI 组件 + FilterBar 容器
3. **Day 4**: 完成拖拽分组 + 集成
4. **Day 5**: 完成测试验证
5. **Day 6**: 完成优化润色 + 迁移兼容
6. **Day 6.5**: 缓冲时间 + 最终验收

---

## 新增功能总结

### 核心功能
- ✅ 双模筛选器（Visual + SQL）
- ✅ 拖拽分组
- ✅ 多操作符支持
- ✅ 实时 SQL 预览

### 安全增强
- ✅ SQL 注入防护（标识符/字符串转义）
- ✅ 特殊字符处理（空格、引号、中文）
- ✅ 数据类型校验

### 用户体验
- ✅ 键盘快捷键
- ✅ 无障碍性支持
- ✅ 友好错误提示
- ✅ 国际化支持

### 性能优化
- ✅ 虚拟滚动（50+ 条件）
- ✅ 防抖优化
- ✅ SQL 解析超时处理

### 兼容性
- ✅ 暗色模式
- ✅ 移动端支持
- ✅ 旧数据迁移
