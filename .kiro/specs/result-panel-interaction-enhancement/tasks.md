# AG Grid 结果面板交互增强 - 任务列表

## 阶段 1：基础功能 - 单元格选择和复制（P0）

### 1. 启用 AG Grid Range Selection

- [ ] 1.1 更新 useAGGridConfig Hook
  - 在 `frontend/src/new/Query/ResultPanel/hooks/useAGGridConfig.ts` 中添加 Range Selection 配置
  - 设置 `enableRangeSelection: true`
  - 设置 `enableCellTextSelection: true`
  - 设置 `suppressCopyRowsToClipboard: false`
  - 确保 `theme: 'legacy'` 保持不变
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 1.2 验证 Range Selection 功能
  - 手动测试：用鼠标拖动选择单元格区域
  - 验证选中区域有高亮显示
  - 验证可以按住 Shift 扩展选区
  - _Requirements: 1.1, 1.2, 1.3_

### 2. 实现复制功能 Hook

- [ ] 2.1 创建 useGridCopy Hook
  - 创建文件 `frontend/src/new/Query/ResultPanel/hooks/useGridCopy.ts`
  - 实现 `extractRangeData` 函数：从 AG Grid 提取选中区域的数据
  - 实现 `convertToTSV` 函数：将数据转换为 TSV 格式
  - 处理特殊字符（制表符、换行符、引号）
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 2.2 实现 copyToClipboard 函数
  - 获取选中的单元格区域 (`gridApi.getCellRanges()`)
  - 如果没有选中区域，尝试获取选中的行
  - 调用 `navigator.clipboard.writeText()` 复制到剪贴板
  - 显示成功 Toast 提示（包含行数和列数）
  - 捕获错误并显示失败提示
  - _Requirements: 2.1, 2.2, 2.4, 2.5_

- [ ] 2.3 实现 copySelectedRows 函数
  - 获取选中的行 (`gridApi.getSelectedRows()`)
  - 如果没有选中行，显示警告提示
  - 获取所有可见列
  - 构建包含表头的数据
  - 转换为 TSV 格式并复制
  - 显示成功 Toast 提示
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [ ] 2.4 导出 useGridCopy Hook
  - 在 `frontend/src/new/Query/ResultPanel/hooks/index.ts` 中导出
  - _Requirements: 2.1_

### 3. 添加键盘事件处理

- [ ] 3.1 在 AGGridWrapper 中添加键盘监听
  - 在 `frontend/src/new/Query/ResultPanel/AGGridWrapper.tsx` 中添加 useEffect
  - 监听 `keydown` 事件
  - 处理 Ctrl+C / Cmd+C：调用 `copyToClipboard()`
  - 处理 Ctrl+A / Cmd+A：调用 `gridApi.selectAll()`
  - 处理 Esc：清除选中状态
  - 清理事件监听器
  - _Requirements: 2.1, 6.1, 6.2, 6.5_

- [ ] 3.2 测试键盘快捷键
  - 验证 Ctrl+C 复制单元格区域
  - 验证 Ctrl+C 复制选中的行（当没有选中区域时）
  - 验证 Ctrl+A 选中所有行
  - 验证 Esc 清除选中状态
  - _Requirements: 6.1, 6.2, 6.5_

### 4. 增强 ResultToolbar - 复制选中按钮

- [ ] 4.1 更新 ResultToolbar Props
  - 在 `frontend/src/new/Query/ResultPanel/ResultPanel.tsx` 中更新 `ResultToolbarProps` 接口
  - 添加 `gridApi?: GridApi` prop
  - 添加 `onCopySelected?: () => void` prop
  - _Requirements: 3.1_

- [ ] 4.2 实现复制选中按钮
  - 导入 `Copy` 图标从 `lucide-react`
  - 在工具栏右侧添加"复制选中"按钮
  - 只在 `stats.selectedRows > 0` 时显示按钮
  - 添加 Separator 分隔符
  - 绑定 `onCopySelected` 回调
  - _Requirements: 3.1, 3.2, 3.4_

- [ ] 4.3 连接 ResultToolbar 和 useGridCopy
  - 在 ResultPanel 中使用 `useGridCopy` Hook
  - 将 `gridApi` 传递给 ResultToolbar
  - 将 `copySelectedRows` 函数传递给 `onCopySelected`
  - _Requirements: 3.1, 3.2_

- [ ] 4.4 测试复制选中按钮
  - 验证按钮只在选中行时显示
  - 验证点击按钮复制选中的行
  - 验证 Toast 提示显示正确的行数
  - _Requirements: 3.1, 3.2, 3.4, 3.5_

### 5. 添加 i18n 翻译

- [ ] 5.1 添加中文翻译
  - 在 `frontend/src/i18n/locales/zh/common.json` 中添加 `result` 部分
  - 添加 `copySelected`, `noRowsSelected`, `copySuccess`, `rangeCopySuccess`, `copyFailed`
  - _Requirements: 2.4, 2.5, 3.5_

- [ ] 5.2 添加英文翻译
  - 在 `frontend/src/i18n/locales/en/common.json` 中添加对应翻译
  - _Requirements: 2.4, 2.5, 3.5_

## 阶段 2：Excel 风格列筛选（P0）

### 6. 创建 ColumnFilterMenu 组件

- [ ] 6.1 创建组件文件和基础结构
  - 创建文件 `frontend/src/new/Query/ResultPanel/ColumnFilterMenu.tsx`
  - 定义 `ColumnFilterMenuProps` 接口
  - 导入必要的 shadcn/ui 组件（Popover, Button, Input, Checkbox, Separator）
  - 创建基础组件结构
  - _Requirements: 4.1, 4.2_

- [ ] 6.2 实现唯一值计算
  - 使用 `useEffect` 在菜单打开时计算唯一值
  - 使用 `gridApi.forEachNodeAfterFilterAndSort()` 遍历数据
  - 采样最多 10,000 行优化性能
  - 统计每个值的出现次数
  - 按出现次数降序排序
  - 限制显示最多 1,000 个唯一值
  - _Requirements: 4.2, 4.3, 7.1, 7.4_

- [ ] 6.3 实现搜索过滤
  - 添加搜索输入框
  - 使用 `useMemo` 过滤唯一值列表
  - 实时更新显示的值
  - _Requirements: 4.4_

- [ ] 6.4 实现快捷操作按钮
  - 实现"全选"：选中所有过滤后的值
  - 实现"反选"：反转当前选中状态
  - 实现"重复项"：只选中出现次数 > 1 的值
  - 实现"唯一项"：只选中出现次数 = 1 的值
  - _Requirements: 4.5, 4.6, 4.7, 4.8_

- [ ] 6.5 实现包含/排除模式切换
  - 添加模式切换按钮
  - 维护 `mode` 状态（'include' | 'exclude'）
  - 更新 UI 显示当前模式
  - _Requirements: 4.9_

- [ ] 6.6 实现值列表渲染
  - 使用 Checkbox 显示每个唯一值
  - 显示值的出现次数
  - 支持点击切换选中状态
  - 添加 hover 效果
  - _Requirements: 4.2, 4.3_

- [ ] 6.7 实现应用和重置功能
  - 实现"应用"按钮：使用 AG Grid Filter API 应用筛选
  - 实现"重置"按钮：清除筛选并关闭菜单
  - 调用 `gridApi.onFilterChanged()` 触发筛选
  - _Requirements: 4.10, 4.11_

### 7. 创建自定义表头组件

- [ ] 7.1 创建 CustomHeaderComponent
  - 创建文件 `frontend/src/new/Query/ResultPanel/CustomHeaderComponent.tsx`
  - 实现 AG Grid 的 IHeaderComp 接口
  - 显示列标题
  - 添加筛选图标按钮
  - _Requirements: 4.1, 4.12_

- [ ] 7.2 集成 ColumnFilterMenu
  - 在 CustomHeaderComponent 中使用 ColumnFilterMenu
  - 管理 Popover 的 open 状态
  - 将列和 gridApi 传递给 ColumnFilterMenu
  - _Requirements: 4.1_

- [ ] 7.3 显示筛选状态
  - 检查列是否有活动筛选
  - 高亮显示筛选图标（当有活动筛选时）
  - _Requirements: 4.12_

### 8. 集成到 AG Grid

- [ ] 8.1 更新列定义
  - 在 `useAGGridConfig` 或 ResultPanel 中更新 `columnDefs`
  - 为每列添加 `headerComponent: CustomHeaderComponent`
  - 添加 `headerComponentParams` 配置
  - _Requirements: 4.1_

- [ ] 8.2 测试列筛选功能
  - 验证点击列标题的筛选图标打开菜单
  - 验证唯一值正确显示
  - 验证搜索功能正常工作
  - 验证快捷操作按钮正常工作
  - 验证应用筛选后表格数据正确过滤
  - 验证多列筛选使用 AND 逻辑
  - _Requirements: 4.1-4.12, 4.16_

### 9. 添加列筛选 i18n 翻译

- [ ] 9.1 添加中文翻译
  - 在 `frontend/src/i18n/locales/zh/common.json` 中添加 `result.filter` 部分
  - 添加所有筛选相关的翻译键
  - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

- [ ] 9.2 添加英文翻译
  - 在 `frontend/src/i18n/locales/en/common.json` 中添加对应翻译
  - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

## 阶段 3：列筛选命令面板（P1）

### 10. 创建 ColumnFilterCommand 组件

- [ ] 10.1 创建组件文件
  - 创建文件 `frontend/src/new/Query/ResultPanel/ColumnFilterCommand.tsx`
  - 定义 `ColumnFilterCommandProps` 接口
  - 导入 shadcn/ui Command 组件
  - _Requirements: 5.1, 5.2_

- [ ] 10.2 实现列列表显示
  - 使用 CommandDialog 作为容器
  - 使用 CommandInput 实现搜索
  - 使用 CommandList 和 CommandGroup 显示列列表
  - 使用 CommandItem 显示每一列
  - _Requirements: 5.2, 5.3_

- [ ] 10.3 实现列选择功能
  - 绑定 `onSelect` 回调
  - 选择列后调用 `onSelectColumn`
  - 关闭命令面板
  - _Requirements: 5.4_

### 11. 集成到 ResultPanel

- [ ] 11.1 添加命令面板状态管理
  - 在 ResultPanel 中添加 `columnFilterCommandOpen` 状态
  - 添加 `selectedColumn` 状态
  - _Requirements: 5.1_

- [ ] 11.2 添加 Ctrl+K 快捷键
  - 在 ResultPanel 中添加 `useEffect` 监听键盘事件
  - 处理 Ctrl+K / Cmd+K：打开命令面板
  - 处理 Esc：关闭命令面板
  - 清理事件监听器
  - _Requirements: 5.1, 5.5, 6.4_

- [ ] 11.3 连接命令面板和列筛选
  - 实现 `handleSelectColumn` 函数
  - 选择列后打开该列的 ColumnFilterMenu
  - 或者直接触发该列的筛选功能
  - _Requirements: 5.4_

- [ ] 11.4 渲染 ColumnFilterCommand 组件
  - 在 ResultPanel 的 return 中添加 ColumnFilterCommand
  - 传递必要的 props
  - _Requirements: 5.1_

### 12. 测试命令面板功能

- [ ] 12.1 测试快捷键
  - 验证 Ctrl+K 打开命令面板
  - 验证 Esc 关闭命令面板
  - _Requirements: 5.1, 5.5_

- [ ] 12.2 测试搜索功能
  - 验证输入列名可以过滤列表
  - 验证模糊搜索正常工作
  - _Requirements: 5.3_

- [ ] 12.3 测试列选择
  - 验证选择列后打开筛选菜单
  - 验证命令面板关闭
  - _Requirements: 5.4_

### 13. 添加命令面板 i18n 翻译

- [ ] 13.1 添加中文翻译
  - 在 `frontend/src/i18n/locales/zh/common.json` 中添加命令面板相关翻译
  - 添加 `searchColumn`, `availableColumns`, `noColumns`
  - _Requirements: 5.2, 5.3_

- [ ] 13.2 添加英文翻译
  - 在 `frontend/src/i18n/locales/en/common.json` 中添加对应翻译
  - _Requirements: 5.2, 5.3_

## 阶段 4：优化和测试（P1）

### 14. 性能优化

- [ ] 14.1 优化 useGridCopy Hook
  - 使用 `useCallback` 包装所有函数
  - 使用 `useMemo` 缓存计算结果
  - 添加依赖数组
  - _Requirements: 7.1, 7.2_

- [ ] 14.2 优化 ColumnFilterMenu
  - 使用 `useMemo` 缓存过滤后的值列表
  - 使用 `useCallback` 包装事件处理函数
  - 实现防抖搜索（300ms）
  - _Requirements: 7.1, 7.2, 7.4_

- [ ] 14.3 优化唯一值计算
  - 确认采样限制（10,000 行）
  - 确认显示限制（1,000 个值）
  - 添加性能监控（console.time）
  - _Requirements: 7.1, 7.4, 7.5_

- [ ] 14.4 优化 AG Grid 配置
  - 确保 `gridOptions` 使用 `useMemo`
  - 确保 `defaultColDef` 使用 `useMemo`
  - 确保事件回调使用 `useCallback`
  - _Requirements: 7.1, 7.2_

### 15. 单元测试

- [ ]* 15.1 测试 useGridCopy Hook
  - 创建文件 `frontend/src/new/Query/ResultPanel/hooks/__tests__/useGridCopy.test.ts`
  - 测试 TSV 格式转换
  - 测试特殊字符处理（制表符、换行符、引号）
  - 测试空值处理
  - 测试复制成功和失败场景
  - _Requirements: 2.2, 2.3_

- [ ]* 15.2 测试 ColumnFilterMenu 组件
  - 创建文件 `frontend/src/new/Query/ResultPanel/__tests__/ColumnFilterMenu.test.tsx`
  - 测试唯一值计算
  - 测试搜索过滤
  - 测试快捷操作（全选、反选、重复项、唯一项）
  - 测试应用和重置功能
  - _Requirements: 4.2, 4.4, 4.5, 4.6, 4.7, 4.8_

- [ ]* 15.3 测试 ColumnFilterCommand 组件
  - 创建文件 `frontend/src/new/Query/ResultPanel/__tests__/ColumnFilterCommand.test.tsx`
  - 测试列列表显示
  - 测试搜索功能
  - 测试列选择
  - _Requirements: 5.2, 5.3, 5.4_

### 16. 集成测试

- [ ]* 16.1 测试复制功能端到端
  - 测试选中单元格区域 → Ctrl+C → 验证剪贴板
  - 测试选中行 → 点击"复制选中" → 验证剪贴板
  - 测试没有选中 → Ctrl+C → 验证无操作
  - _Requirements: 2.1, 2.4, 3.2, 3.5_

- [ ]* 16.2 测试列筛选端到端
  - 测试打开筛选菜单 → 选择值 → 应用 → 验证表格数据
  - 测试多列筛选 → 验证 AND 逻辑
  - 测试重置筛选 → 验证表格恢复
  - _Requirements: 4.10, 4.11, 4.16_

- [ ]* 16.3 测试命令面板端到端
  - 测试 Ctrl+K → 搜索列 → 选择 → 验证筛选菜单打开
  - 测试 Esc → 验证命令面板关闭
  - _Requirements: 5.1, 5.3, 5.4, 5.5_

### 17. 文档和清理

- [ ]* 17.1 更新组件文档
  - 为 useGridCopy Hook 添加 JSDoc 注释
  - 为 ColumnFilterMenu 添加 Props 文档
  - 为 ColumnFilterCommand 添加 Props 文档
  - _Requirements: All_

- [ ]* 17.2 更新 README
  - 在 `frontend/src/new/Query/ResultPanel/README.md` 中记录新功能
  - 添加使用示例
  - 添加快捷键列表
  - _Requirements: 6.1-6.10_

- [ ]* 17.3 代码审查和清理
  - 移除 console.log 调试语句
  - 检查所有 TODO 注释
  - 确保代码符合项目规范
  - 运行 `npm run lint` 检查
  - 运行 `npx tsc --noEmit` 检查类型
  - _Requirements: All_

## 检查点

### Checkpoint 1: 基础功能完成
- [ ] 18. 验证阶段 1 所有任务完成
  - 确保所有测试通过
  - 确保 Ctrl+C 复制功能正常工作
  - 确保"复制选中"按钮正常工作
  - 询问用户是否有问题

### Checkpoint 2: 列筛选完成
- [ ] 19. 验证阶段 2 所有任务完成
  - 确保列筛选菜单正常工作
  - 确保所有快捷操作正常工作
  - 确保多列筛选正常工作
  - 询问用户是否有问题

### Checkpoint 3: 命令面板完成
- [ ] 20. 验证阶段 3 所有任务完成
  - 确保 Ctrl+K 打开命令面板
  - 确保搜索和选择功能正常工作
  - 询问用户是否有问题

### Checkpoint 4: 最终验收
- [ ] 21. 验证所有功能
  - 运行所有测试
  - 手动测试所有功能
  - 检查性能（大数据量）
  - 检查国际化（中英文切换）
  - 询问用户是否满意

## 总结

**预计时间**：3-4 天

**任务统计**：
- 核心任务：21 个主任务，60+ 个子任务
- 可选任务：9 个测试和文档任务（标记为 *）

**关键里程碑**：
- Day 1: 阶段 1 完成（基础复制功能）
- Day 2: 阶段 2 完成（列筛选）
- Day 3: 阶段 3 完成（命令面板）
- Day 4: 阶段 4 完成（优化和测试）

**成功标准**：
- ✅ 所有 P0 功能正常工作
- ✅ 所有 P1 功能正常工作
- ✅ 性能满足要求（< 500ms）
- ✅ 国际化完整（中英文）
- ✅ 代码通过 lint 和类型检查
- ✅ 用户验收通过

