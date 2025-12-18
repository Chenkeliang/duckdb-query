# Implementation Plan

## Phase 1: 基础设施和核心 Hooks

- [x] 1. 项目设置
  - [x] 1.1 验证依赖已安装
    - 确认 @tanstack/react-table 和 @tanstack/react-virtual 已在 package.json 中
    - 如未安装则运行 `npm install @tanstack/react-table @tanstack/react-virtual`
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 创建 DataGrid 目录结构
    - 创建 `frontend/src/new/Query/DataGrid/` 目录及子目录
    - _Requirements: 1.1_
  - [x] 1.3 添加 i18n key
    - 在 `frontend/src/i18n/locales/zh/common.json` 添加 dataGrid 命名空间
    - 在 `frontend/src/i18n/locales/en/common.json` 添加对应英文翻译
    - _Requirements: 7.1_

- [x] 2. 核心数据管理 Hook
  - [x] 2.1 实现 useDataGrid hook
    - 封装 TanStack Table 的 useReactTable
    - 支持排序、筛选、列宽状态管理
    - _Requirements: 1.1, 1.4_
  - [ ]* 2.2 编写 useDataGrid 单元测试
    - 测试排序状态切换
    - 测试筛选状态管理
    - _Requirements: 1.4_

- [x] 3. 虚拟滚动 Hook（行列双向）
  - [x] 3.1 实现 useVirtualScroll hook
    - 封装 @tanstack/react-virtual
    - 支持行虚拟化（始终启用，overscan = 5）
    - 支持列虚拟化（列数 > 50 时启用，overscan = 3）
    - 实现列头与主体滚动同步
    - _Requirements: 1.2, 6.2, 6.3, 6.4_
  - [ ]* 3.2 编写 useVirtualScroll 单元测试
    - **Property 4: 虚拟滚动渲染正确性**
    - **Validates: Requirements 6.2**

## Phase 2: 单元格选区功能（单矩形模型）

- [x] 4. 选区管理 Hook
  - [x] 4.1 实现 useCellSelection hook
    - 实现 startSelection（设置 anchor 和 end）
    - 实现 extendSelection（更新 end，保持 anchor）
    - 实现 endSelection
    - 实现 isCellSelected 判断函数
    - 支持 Shift+Click 扩展选区
    - 支持 Ctrl+Click 重置选区（新 anchor）
    - 支持 all 标志（Ctrl+A 全选）
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ]* 4.2 编写 useCellSelection 属性测试
    - **Property 1: 选区矩形一致性**
    - **Validates: Requirements 2.2, 2.3, 2.4**
  - [x] 4.3 实现键盘导航 hook
    - 实现方向键移动焦点
    - 实现 Shift+方向键扩展选区
    - 实现 Home/End/PageUp/PageDown
    - 实现 Ctrl+A 逻辑全选（设置 all = true）
    - _Requirements: 2.6, 2.7, 8.2, 8.3, 8.4, 8.5, 8.6_
  - [ ]* 4.4 编写键盘导航属性测试
    - **Property 5: 键盘导航边界**
    - **Validates: Requirements 8.2, 8.3**
  - [x] 4.5 实现自动滚动功能
    - 拖拽到边缘时自动滚动（阈值 50px）
    - 滚动速度随距离递增
    - _Requirements: 2.8_

- [x] 5. Checkpoint - 确保选区功能测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: 复制功能

- [x] 6. 复制功能 Hook
  - [x] 6.1 实现 useGridCopy hook
    - 实现 copySelection 方法（TSV/CSV/JSON）
    - 实现特殊字符转义
    - 实现 copyColumnName 方法
    - 实现大数据复制安全阈值检查（> 200,000 单元格时警告）
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_
  - [ ]* 6.2 编写复制功能属性测试
    - **Property 2: 复制数据完整性**
    - **Validates: Requirements 3.1, 3.2**
  - [ ]* 6.3 编写 TSV/CSV 转义属性测试
    - **Property 6: TSV/CSV 转义正确性**
    - **Validates: Requirements 3.4**

- [x] 7. 剪贴板工具函数
  - [x] 7.1 实现 clipboard.ts 工具函数
    - 实现 formatAsTSV、formatAsCSV、formatAsJSON
    - 实现 escapeForTSV、escapeForCSV
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [ ]* 7.2 编写剪贴板工具函数测试
    - 测试各种特殊字符转义
    - _Requirements: 3.4_

## Phase 4: 列筛选功能（支持高基数列）

- [x] 8. 列筛选 Hook
  - [x] 8.1 实现 useColumnFilter hook
    - 实现唯一值提取和计数
    - 实现低基数列（< 1000）：值列表 include/exclude 模式
    - 实现高基数列（≥ 1000）：Top 100 + 条件过滤
    - 实现全选/清空/反选
    - 实现 debounce（300ms）
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 4.11_
  - [ ]* 8.2 编写列筛选属性测试
    - **Property 3: 筛选结果一致性**
    - **Validates: Requirements 4.4, 4.5** (低基数列实时筛选 + 高基数列条件过滤)

- [x] 9. 筛选菜单组件
  - [x] 9.1 实现 FilterMenu 组件
    - 使用 shadcn/ui Popover + Command 组件
    - 低基数列：显示完整值列表
    - 高基数列：显示 Top 100 + 条件过滤输入框 + 提示"仅展示部分值"
    - 实现值列表虚拟滚动
    - 实现搜索过滤
    - _Requirements: 4.1, 4.2, 4.3, 4.6_
  - [x] 9.2 实现筛选状态指示
    - 列头筛选图标高亮
    - 清除筛选按钮
    - _Requirements: 4.9, 4.10_
  - [x] 9.3 实现高基数列"应用"按钮
    - 高基数列筛选需点击"应用"按钮生效
    - _Requirements: 4.5_

- [x] 10. Checkpoint - 确保筛选功能测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 5: UI 组件实现

- [x] 11. 基础组件
  - [x] 11.1 实现 GridCell 组件
    - 支持选中/悬停样式
    - 支持 NULL 值特殊显示
    - 支持数字右对齐
    - _Requirements: 7.2, 7.3, 7.4, 7.5_
  - [x] 11.2 实现 GridRow 组件
    - 支持虚拟滚动定位
    - 支持行悬停效果
    - _Requirements: 6.2_
  - [x] 11.3 实现 SelectionOverlay 组件
    - 渲染选区边框
    - 支持拖拽手柄（可选）
    - _Requirements: 2.1, 2.2_

- [x] 12. 列头组件
  - [x] 12.1 实现 ColumnHeader 组件
    - 排序按钮和图标
    - 复制列名按钮
    - 筛选按钮
    - _Requirements: 5.1, 5.2, 5.5_
  - [x] 12.2 实现列宽调整功能
    - 拖拽调整列宽
    - 双击自适应列宽
    - _Requirements: 5.3, 5.4_

- [x] 13. 布局组件
  - [x] 13.1 实现 GridHeader 组件
    - 固定列头
    - 水平滚动同步
    - _Requirements: 1.1_
  - [x] 13.2 实现 GridBody 组件
    - 虚拟滚动容器
    - 选区事件处理
    - _Requirements: 1.2, 2.2_
  - [x] 13.3 实现 GridFooter 组件
    - 显示统计信息
    - _Requirements: 10.1, 10.2, 10.3_

## Phase 6: 交互功能

- [x] 14. 右键菜单
  - [x] 14.1 实现 ContextMenu 组件
    - 使用 shadcn/ui ContextMenu
    - 复制选项（TSV/CSV/JSON）
    - 筛选选项（筛选此值/排除此值）
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 14.2 实现菜单关闭逻辑
    - 点击外部关闭
    - Esc 关闭
    - _Requirements: 9.4, 9.5_

- [x] 15. 统计信息 Hook
  - [x] 15.1 实现 useGridStats hook
    - 计算总行数、筛选后行数
    - 计算选中单元格数量
    - 计算数字列求和/平均值（可选）
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 16. Checkpoint - 确保 UI 组件测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 7: 主组件集成

- [x] 17. DataGrid 主组件
  - [x] 17.1 实现 DataGrid 组件
    - 集成所有子组件和 hooks
    - 实现 props 接口
    - 实现主题适配
    - _Requirements: 1.1, 7.1_
  - [x] 17.2 实现加载和空状态
    - 加载中显示骨架屏或 spinner
    - 空数据显示提示
    - _Requirements: 1.5, 1.6_
  - [x] 17.3 实现列定义自动推断
    - 从数据自动推断列类型
    - 自动生成列定义
    - _Requirements: 1.1_

- [x] 18. 键盘快捷键集成
  - [x] 18.1 集成 Ctrl+C 复制
    - 监听键盘事件
    - 调用 copySelection
    - _Requirements: 3.1_
  - [x] 18.2 集成 Ctrl+A 全选
    - 选中所有单元格
    - _Requirements: 8.6_
  - [x] 18.3 集成 Esc 清除选区
    - 清除当前选区
    - _Requirements: 2.5_

## Phase 8: 性能优化

- [x] 19. 大数据优化
  - [x] 19.1 优化筛选计算
    - 使用 useMemo 缓存唯一值
    - 大数据量时使用 Web Worker（可选）
    - _Requirements: 6.3, 6.4_
  - [x] 19.2 优化渲染性能
    - 使用 React.memo 优化单元格
    - 使用 useCallback 稳定回调
    - _Requirements: 6.1_

- [x] 20. 滚动位置保持
  - [x] 20.1 实现数据更新时保持滚动位置
    - 记录滚动位置
    - 数据更新后恢复
    - _Requirements: 6.5_

## Phase 9: 集成测试和文档

- [ ]* 21. 集成测试
  - [ ]* 21.1 编写组件集成测试
    - 测试完整交互流程
    - 测试键盘导航
    - 测试鼠标选区
  - [ ]* 21.2 编写性能测试
    - 测试 10 万行数据渲染
    - 测试滚动流畅度

- [x] 22. 文档和示例
  - [x] 22.1 编写组件使用文档
    - API 文档
    - 使用示例
  - [x] 22.2 创建示例页面
    - 在新 UI 中添加 DataGrid 示例页面

- [x] 23. Checkpoint - 确保新组件测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 10: 集成替换

- [x] 24. 替换 ResultPanel 中的 AG Grid
  - [x] 24.1 更新 ResultPanel.tsx
    - 将 AGGridWrapper 替换为新 DataGrid 组件
    - 保持现有 props 接口兼容
    - _Requirements: 1.1_
  - [x] 24.2 迁移筛选功能
    - 移除 ColumnFilterMenu.tsx（旧实现）
    - 使用新 DataGrid 内置筛选
    - _Requirements: 4.1_
  - [x] 24.3 迁移复制功能
    - 移除 useGridCopy.ts（旧实现）
    - 使用新 DataGrid 内置复制
    - _Requirements: 3.1_
  - [x] 24.4 迁移统计信息
    - 移除 useGridStats.ts（旧实现）
    - 使用新 DataGrid 内置统计
    - _Requirements: 10.1_

- [x] 25. 回归测试
  - [x] 25.1 验证现有功能
    - 测试查询结果展示
    - 测试筛选功能
    - 测试复制功能
    - 测试导出功能
    - 测试 Toast 提示
  - [x] 25.2 验证 i18n
    - 测试中文显示
    - 测试英文显示

- [x] 26. 清理旧代码
  - [x] 26.1 移除 AG Grid 相关文件
    - 移除 AGGridWrapper.tsx
    - 移除 CustomHeaderComponent.tsx
    - 移除旧 hooks（useAGGridConfig.ts 等）
  - [x] 26.2 移除 AG Grid 依赖（可选）
    - 如果旧 UI 不再使用，可移除 ag-grid-community 依赖

- [x] 27. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## 功能清单总结

### 核心功能
| 功能 | 状态 | 任务 |
|------|------|------|
| TanStack Table 集成 | 待实现 | 2.1 |
| 行虚拟滚动 | 待实现 | 3.1 |
| 列虚拟滚动（> 50 列） | 待实现 | 3.1 |
| 列头滚动同步 | 待实现 | 3.1 |
| 列排序 | 待实现 | 2.1 |
| 列宽调整 | 待实现 | 12.2 |

### 选区功能（单矩形模型）
| 功能 | 状态 | 任务 |
|------|------|------|
| 单击选中 | 待实现 | 4.1 |
| 拖拽选区 | 待实现 | 4.1 |
| Shift+Click 扩展 | 待实现 | 4.1 |
| Ctrl+Click 重置 | 待实现 | 4.1 |
| Ctrl+A 逻辑全选 | 待实现 | 4.3 |
| 键盘导航 | 待实现 | 4.3 |
| Esc 清除 | 待实现 | 18.3 |
| 边缘自动滚动 | 待实现 | 4.5 |

### 复制功能
| 功能 | 状态 | 任务 |
|------|------|------|
| Ctrl+C 复制 TSV（原始值） | 待实现 | 6.1, 18.1 |
| 复制为 CSV（原始值） | 待实现 | 6.1 |
| 复制为 JSON（NULL → null） | 待实现 | 6.1 |
| 复制列名 | 待实现 | 6.1 |
| 特殊字符转义 | 待实现 | 7.1 |

### 筛选功能（支持高基数列）
| 功能 | 状态 | 任务 |
|------|------|------|
| 筛选菜单 | 待实现 | 9.1 |
| 低基数列：值列表 | 待实现 | 8.1 |
| 高基数列：Top 100 + 条件过滤 | 待实现 | 8.1, 9.1 |
| 搜索过滤 | 待实现 | 9.1 |
| 全选/清空/反选 | 待实现 | 8.1 |
| Include/Exclude 模式 | 待实现 | 8.1 |
| 筛选状态指示 | 待实现 | 9.2 |
| 高基数列"应用"按钮 | 待实现 | 9.3 |
| Debounce 300ms | 待实现 | 8.1 |

### 交互功能
| 功能 | 状态 | 任务 |
|------|------|------|
| 右键菜单 | 待实现 | 14.1 |
| 统计信息 | 待实现 | 15.1 |
| 主题适配 | 待实现 | 17.1 |
| 加载/空状态 | 待实现 | 17.2 |
| ARIA Grid 语义 | 待实现 | 17.1 |
| Focus Ring | 待实现 | 11.1 |

### 性能优化
| 功能 | 状态 | 任务 |
|------|------|------|
| 10 万行 × 200 列流畅滚动 | 待实现 | 3.1, 19.2 |
| 筛选计算优化 | 待实现 | 19.1 |
| 滚动位置保持 | 待实现 | 20.1 |

### 集成替换
| 功能 | 状态 | 任务 |
|------|------|------|
| 替换 ResultPanel AG Grid | 待实现 | 24.1 |
| 迁移筛选功能 | 待实现 | 24.2 |
| 迁移复制功能 | 待实现 | 24.3 |
| 迁移统计信息 | 待实现 | 24.4 |
| i18n key 对齐 | 待实现 | 1.3 |
| 回归测试 | 待实现 | 25.1, 25.2 |
| 清理旧代码 | 待实现 | 26.1, 26.2 |
