# Implementation Plan (v2)

## 📋 任务组织原则

1. **按优先级分 Phase**：每个 Phase 可以独立交付
2. **测试标记为可选**：核心功能优先，测试可后补
3. **增量实现**：每个任务都可以独立完成和测试
4. **明确依赖**：标注任务之间的依赖关系

## 🎯 Phase 1: 主区域布局和数据源面板（5-7 天）

### 1. 设置项目结构和依赖

- [ ] 1.1 安装依赖包
  - 安装 react-resizable-panels
  - 安装 ag-grid-react 和 ag-grid-community
  - 安装 @monaco-editor/react
  - 安装 react-window（虚拟滚动）
  - _Requirements: Phase 1 基础_

- [ ] 1.2 创建目录结构
  - 创建 frontend/src/new/Query/ 目录
  - 创建子目录：DataSourcePanel/, QueryTabs/, ResultPanel/, SQLQuery/, etc.
  - 创建 hooks/ 和 utils/ 目录
  - _Requirements: Phase 1 基础_

- [ ] 1.3 配置 TypeScript 和 Vite
  - 配置 Web Worker 支持
  - 配置 Monaco Editor 支持
  - _Requirements: Phase 1 基础_

### 2. 实现 QueryWorkspace 主容器

- [ ] 2.1 创建 QueryWorkspace.tsx
  - 使用 react-resizable-panels 实现三栏布局
  - 实现面板大小调整和持久化（localStorage）
  - 实现面板折叠/展开
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2.2 创建 useQueryWorkspace hook
  - 管理 selectedTables 状态
  - 管理 currentTab 状态
  - 管理 queryResults 状态
  - 实现 handleTableSelect, handleTabChange, handleQueryExecute
  - _Requirements: 1.1, 1.2, 1.3_

- [ ]* 2.3 编写 QueryWorkspace 单元测试
  - 测试布局渲染
  - 测试面板调整大小
  - 测试状态管理
  - _Requirements: 2.1, 2.2_

### 3. 实现 DataSourcePanel 组件

- [ ] 3.1 创建 DataSourcePanel/index.tsx
  - 使用 useQuery 获取表列表（getDuckDBTablesEnhanced）
  - 实现搜索输入框（debounced 300ms）
  - 实现表分组（DuckDB 表、数据库连接、系统表）
  - _Requirements: 2.1, 2.2_

- [ ] 3.2 创建 TreeSection.tsx
  - 实现可展开/折叠的 section
  - 使用 ChevronDown/ChevronRight 图标
  - 实现展开状态持久化
  - _Requirements: 3.1_

- [ ] 3.3 创建 TableItem.tsx
  - 实现单选模式（单击选中）
  - 实现多选模式（checkbox）
  - 实现选中状态样式（bg-primary/10 border-l-2 border-primary）
  - _Requirements: 3.2_

- [ ] 3.4 创建 ContextMenu.tsx（右键菜单）
  - 实现"预览数据"（SELECT * LIMIT 100）
  - 实现"查看结构"（显示列信息对话框）
  - 实现"删除表"（确认对话框 + deleteDuckDBTableEnhanced）
  - _Requirements: 3.3_

- [ ] 3.5 实现底部操作按钮
  - 实现"刷新"按钮（triggerRefresh）
  - 实现"添加"按钮（导航到数据源管理页面）
  - _Requirements: 3.1_

- [ ]* 3.6 编写 DataSourcePanel 单元测试
  - 测试表列表渲染
  - 测试搜索功能
  - 测试表选择
  - 测试右键菜单
  - _Requirements: 3.1-3.5_

### 4. 实现 QueryTabs 组件

- [ ] 4.1 创建 QueryTabs/index.tsx
  - 使用 shadcn/ui Tabs 组件
  - 实现 5 个 Tab：SQL 查询, JOIN 查询, 集合操作, 透视表, 可视化查询
  - 实现 Tab 切换动画
  - _Requirements: 2.1_

- [ ] 4.2 创建占位组件
  - 创建 SQLQuery/index.tsx（占位）
  - 创建 JoinQuery/index.tsx（占位）
  - 创建 SetOperations/index.tsx（占位）
  - 创建 PivotTable/index.tsx（占位）
  - 创建 VisualQuery/index.tsx（占位）
  - _Requirements: 4.1_

### 5. Checkpoint - Phase 1 验证

- [ ] 5.1 集成测试
  - 验证三栏布局正常工作
  - 验证数据源面板显示表列表
  - 验证表选择功能
  - 验证 Tab 切换
  - _Requirements: 2.1-4.2_

---

## 🎯 Phase 2: ResultPanel（AG-Grid + Excel 过滤）（5-7 天）

### 6. 集成 AG-Grid

- [ ] 6.1 创建 AG-Grid 自定义主题
  - 创建 styles/ag-theme-duckquery.css
  - 定义 CSS 变量映射到项目设计系统
  - 测试明暗模式切换
  - _Requirements: 1.1_

- [ ] 6.2 创建 ResultPanel/index.tsx
  - 集成 AgGridReact 组件
  - 配置 columnDefs 和 defaultColDef
  - 实现虚拟滚动（rowModelType="clientSide"）
  - _Requirements: 6.1_

- [ ] 6.3 创建 ResultToolbar.tsx
  - 显示行数、列数、执行时间
  - 添加导出按钮
  - 添加搜索按钮
  - 添加折叠/展开按钮
  - _Requirements: 6.2_

- [ ] 6.4 实现面板折叠功能
  - 实现垂直 resizer
  - 实现折叠到 40px 高度
  - 实现展开按钮
  - _Requirements: 6.2, 6.3_

### 7. 实现 Excel 风格列筛选

- [ ] 7.1 创建 Web Worker
  - 创建 workers/distinctValues.worker.ts
  - 实现 distinct values 计算逻辑
  - 实现采样（10,000 行）和限制（1,000 个值）
  - _Requirements: 1.3_

- [ ] 7.2 创建 ColumnFilterMenu.tsx
  - 使用 Popover 组件
  - 实现搜索输入框
  - 实现操作按钮（全选、反选、重复项、唯一项）
  - 实现包含/排除模式切换
  - _Requirements: 7.1_

- [ ] 7.3 实现虚拟滚动列表
  - 使用 react-window FixedSizeList
  - 渲染 distinct values 列表
  - 实现 checkbox 选择
  - 显示出现次数 badge
  - _Requirements: 7.2_

- [ ] 7.4 集成到 AG-Grid
  - 创建自定义 AgColumnHeader 组件
  - 添加过滤按钮
  - 实现过滤应用逻辑
  - 显示过滤状态（按钮颜色 + chip）
  - _Requirements: 6.2, 7.2, 7.3_

- [ ]* 7.5 编写列筛选单元测试
  - 测试 distinct values 计算
  - 测试搜索功能
  - 测试全选/反选
  - 测试过滤应用
  - _Requirements: 7.1-7.4_

### 8. 实现单元格选择和复制

- [ ] 8.1 配置 AG-Grid 范围选择
  - 启用 enableRangeSelection
  - 启用 enableCellTextSelection
  - 监听 onRangeSelectionChanged 事件
  - _Requirements: 6.2_

- [ ] 8.2 实现复制功能
  - 实现 Ctrl+C 快捷键
  - 提取选中数据
  - 转换为 TSV 格式
  - 复制到剪贴板
  - 显示 toast 提示
  - _Requirements: 8.1_

- [ ] 8.3 创建右键菜单
  - 使用 shadcn/ui ContextMenu
  - 添加"复制"选项
  - 添加"复制为 CSV"选项
  - 添加"复制为 JSON"选项
  - 添加"导出选中数据"选项
  - _Requirements: 8.2_

### 9. 实现键盘导航

- [ ] 9.1 配置 AG-Grid 键盘导航
  - 监听 onCellKeyDown 事件
  - 实现方向键导航
  - 实现 Ctrl+Home/End 跳转
  - 实现 Page Up/Down 翻页
  - _Requirements: 6.2_

- [ ] 9.2 实现快捷键
  - Ctrl+C: 复制
  - Ctrl+F: 搜索
  - Ctrl+A: 全选
  - _Requirements: 9.1_

### 10. 实现浮动工具栏

- [ ] 10.1 创建 FloatingToolbar.tsx
  - 显示选中数量
  - 添加"复制"按钮
  - 添加"导出"按钮
  - 添加"统计"按钮
  - 添加关闭按钮
  - _Requirements: 8.1_

- [ ] 10.2 实现选中数据统计
  - 计算 count, sum, avg, min, max
  - 显示在工具栏中
  - _Requirements: 10.1_

### 11. 实现列操作

- [ ] 11.1 实现列宽调整
  - 配置 AG-Grid resizable
  - 实现双击自动调整列宽
  - _Requirements: 6.2_

- [ ] 11.2 实现列右键菜单
  - 添加"自动调整列宽"
  - 添加"自动调整所有列宽"
  - 添加"隐藏此列"
  - 添加"冻结此列"
  - _Requirements: 11.1_

### 12. 实现全局搜索

- [ ] 12.1 创建 SearchDialog.tsx
  - 使用 shadcn/ui Dialog
  - 实现搜索输入框
  - 实现搜索结果导航（上一个/下一个）
  - 显示结果数量
  - _Requirements: 6.2_

- [ ] 12.2 实现搜索逻辑
  - 遍历所有单元格查找匹配
  - 高亮匹配的单元格
  - 实现 Ctrl+F 快捷键
  - _Requirements: 12.1_

### 13. 实现导出功能

- [ ] 13.1 创建 ExportDialog.tsx
  - 使用 shadcn/ui Dialog
  - 显示格式选项（CSV, JSON, Parquet, Excel）
  - 显示格式说明
  - _Requirements: 6.2_

- [ ] 13.2 实现导出逻辑
  - 实现 CSV 导出（UTF-8 BOM）
  - 实现 JSON 导出
  - 实现 Parquet 导出（调用后端 API）
  - 实现 Excel 导出（使用 SheetJS）
  - _Requirements: 13.1_

### 14. Checkpoint - Phase 2 验证

- [ ] 14.1 集成测试
  - 验证 AG-Grid 渲染
  - 验证列筛选功能
  - 验证单元格选择和复制
  - 验证键盘导航
  - 验证导出功能
  - _Requirements: 6.1-13.2_

---

## 🎯 Phase 3: SQL 查询（3-4 天）

### 15. 实现 SQL 编辑器

- [ ] 15.1 创建 SQLQuery/index.tsx
  - 集成 Monaco Editor
  - 配置 SQL 语言支持
  - 配置主题（vs-dark）
  - _Requirements: 1.1_

- [ ] 15.2 创建 SQLToolbar.tsx
  - 添加"格式化"按钮
  - 添加"模板"下拉菜单
  - 添加"执行"按钮
  - _Requirements: 15.1_

- [ ] 15.3 实现 SQL 格式化
  - 安装 sql-formatter
  - 实现格式化逻辑
  - _Requirements: 15.2_

### 16. 实现 SQL 模板

- [ ] 16.1 创建 SQLTemplates.tsx
  - 定义常用 SQL 模板
  - 实现模板选择下拉菜单
  - 实现模板插入逻辑
  - _Requirements: 15.2_

### 17. 实现查询历史

- [ ] 17.1 创建 SQLHistory.tsx
  - 显示最近 20 条查询
  - 显示时间戳和状态
  - 实现点击加载历史查询
  - 实现右键菜单（加载、复制、删除）
  - _Requirements: 15.1_

- [ ] 17.2 实现历史持久化
  - 保存到 localStorage
  - 限制 20 条
  - _Requirements: 17.1_

### 18. 实现查询执行

- [ ] 18.1 集成查询执行 API
  - 调用 executeDuckDBSQL
  - 处理成功响应
  - 处理错误响应
  - 显示 toast 提示
  - _Requirements: 15.1, 2.2_

- [ ] 18.2 实现保存为数据源
  - 添加"保存为数据源"按钮
  - 创建保存对话框
  - 调用 saveQueryResult API
  - 刷新数据源面板
  - _Requirements: 18.1_

### 19. Checkpoint - Phase 3 验证

- [ ] 19.1 集成测试
  - 验证 SQL 编辑器
  - 验证格式化功能
  - 验证模板功能
  - 验证查询历史
  - 验证查询执行
  - _Requirements: 15.1-18.2_

---

_（后续 Phase 4-8 的任务将在下一部分继续）_

**文档版本**: v2.0  
**创建时间**: 2024-12-04  
**状态**: 📝 Part 1/2

## 🎯 Phase 4: JOIN 查询（2-3 天）

### 20. 实现 JOIN 查询构建器

- [ ] 20.1 创建 JoinQuery/index.tsx
  - 显示选中的表卡片（水平布局）
  - 显示 JOIN 连接器
  - 显示空状态提示
  - _Requirements: 2.2, 3.1_

- [ ] 20.2 创建 TableCard.tsx
  - 显示表名
  - 显示列列表（checkbox）
  - 添加移除按钮
  - _Requirements: 20.1_

- [ ] 20.3 创建 JoinConnector.tsx
  - 显示 JOIN 类型下拉菜单（INNER, LEFT, RIGHT, FULL）
  - 显示 JOIN 条件配置
  - 实现添加/删除条件
  - _Requirements: 20.2_

- [ ] 20.4 创建 JoinCondition.tsx
  - 显示左表字段选择器
  - 显示右表字段选择器
  - 显示等号
  - 实现类型检测
  - _Requirements: 20.3_

### 21. 实现类型冲突检测

- [ ] 21.1 创建 TypeConflictDialog.tsx
  - 显示类型不匹配警告
  - 提供类型转换选项
  - 实现 CAST() 函数插入
  - _Requirements: 20.4_

- [ ] 21.2 实现类型检测逻辑
  - 获取列类型信息
  - 比较左右字段类型
  - 显示警告图标
  - _Requirements: 21.1_

### 22. 实现 JOIN 查询生成和执行

- [ ] 22.1 实现 SQL 生成逻辑
  - 生成 SELECT 子句（选中的列）
  - 生成 FROM 子句
  - 生成 JOIN 子句
  - 生成 ON 子句
  - _Requirements: 20.1-21.2_

- [ ] 22.2 实现查询执行
  - 调用 executeDuckDBSQL
  - 显示结果在 ResultPanel
  - _Requirements: 22.1, 2.2_

### 23. Checkpoint - Phase 4 验证

- [ ] 23.1 集成测试
  - 验证表卡片显示
  - 验证 JOIN 类型选择
  - 验证 JOIN 条件配置
  - 验证类型冲突检测
  - 验证查询生成和执行
  - _Requirements: 20.1-22.2_

---

## 🎯 Phase 5: 集合操作（2-3 天）

### 24. 实现集合操作构建器

- [ ] 24.1 创建 SetOperations/index.tsx
  - 显示选中的表卡片（垂直布局）
  - 显示集合操作连接器
  - 显示空状态提示
  - _Requirements: 2.2, 3.1_

- [ ] 24.2 复用 TableCard.tsx
  - 调整为垂直布局
  - _Requirements: 20.2, 24.1_

- [ ] 24.3 创建 SetConnector.tsx
  - 显示操作类型下拉菜单（UNION, UNION ALL, INTERSECT, EXCEPT）
  - 显示操作类型徽章
  - _Requirements: 24.2_

### 25. 实现列映射配置

- [ ] 25.1 创建 ColumnMappingDialog.tsx
  - 显示所有表的列
  - 实现拖拽映射
  - 显示映射关系
  - _Requirements: 24.3_

- [ ] 25.2 实现列映射逻辑
  - 检测列名不一致
  - 显示"列映射"按钮
  - 应用列映射到 SQL 生成
  - _Requirements: 25.1_

### 26. 实现集合操作查询生成和执行

- [ ] 26.1 实现 SQL 生成逻辑
  - 生成多个 SELECT 子句
  - 生成集合操作符
  - 应用列映射（使用 AS 别名）
  - _Requirements: 24.1-25.2_

- [ ] 26.2 实现查询执行
  - 调用 executeDuckDBSQL
  - 显示结果在 ResultPanel
  - _Requirements: 26.1, 2.2_

### 27. Checkpoint - Phase 5 验证

- [ ] 27.1 集成测试
  - 验证表卡片显示
  - 验证集合操作类型选择
  - 验证列映射功能
  - 验证查询生成和执行
  - _Requirements: 24.1-26.2_

---

## 🎯 Phase 6: 透视表（3-4 天）

### 28. 实现透视表构建器

- [ ] 28.1 创建 PivotTable/index.tsx
  - 显示配置区域（行维度、列维度、值聚合）
  - 显示字段列表
  - 显示生成按钮
  - _Requirements: 2.2, 3.1_

- [ ] 28.2 创建 DimensionZone.tsx
  - 实现拖放区域
  - 显示已添加的维度
  - 实现维度重排序
  - 实现维度删除
  - _Requirements: 28.1_

- [ ] 28.3 创建 ValueConfig.tsx
  - 显示字段选择器
  - 显示聚合函数选择器（SUM, AVG, COUNT, MIN, MAX）
  - 实现添加/删除值聚合
  - _Requirements: 28.1_

### 29. 实现透视表查询生成和执行

- [ ] 29.1 实现 SQL 生成逻辑
  - 生成 SELECT 子句（行维度 + 聚合）
  - 生成 FROM 子句
  - 生成 GROUP BY 子句
  - 生成 PIVOT 子句（如果需要）
  - _Requirements: 28.1-28.3_

- [ ] 29.2 实现查询执行
  - 调用 executeDuckDBSQL
  - 显示结果在 ResultPanel
  - _Requirements: 29.1, 2.2_

### 30. Checkpoint - Phase 6 验证

- [ ] 30.1 集成测试
  - 验证维度配置
  - 验证值聚合配置
  - 验证查询生成和执行
  - _Requirements: 28.1-29.2_

---

## 🎯 Phase 7: 异步任务（2-3 天）

### 31. 实现异步任务列表

- [ ] 31.1 创建 AsyncTasks/index.tsx
  - 使用 useQuery 获取任务列表（listAsyncTasks）
  - 实现自动刷新（5 秒）
  - 显示任务表格
  - _Requirements: 2.2_

- [ ] 31.2 创建 TaskTable.tsx
  - 显示列：任务ID, 状态, 查询语句, 创建时间, 执行时间, 操作
  - 实现状态徽章（queued, running, success, failed）
  - 实现任务状态变化检测
  - _Requirements: 31.1_

- [ ] 31.3 实现任务完成回调
  - 监听任务状态变化
  - 调用 onTaskCompleted 回调
  - 触发 triggerRefresh() 刷新数据源
  - _Requirements: 31.2_

### 32. 实现异步任务操作

- [ ] 32.1 创建 TaskActions.tsx
  - 实现"预览结果"按钮
  - 实现"下载"按钮
  - 实现"取消"按钮
  - 实现"重试"按钮
  - _Requirements: 31.2_

- [ ] 32.2 创建 FormatDialog.tsx
  - 显示格式选择（CSV, Parquet）
  - 显示格式说明
  - 实现下载逻辑
  - _Requirements: 32.1_

- [ ] 32.3 创建 CancelDialog.tsx
  - 显示取消确认
  - 输入取消原因
  - 调用 cancelAsyncTask API
  - _Requirements: 32.1_

- [ ] 32.4 创建 RetryDialog.tsx
  - 显示重试确认
  - 显示原始 SQL
  - 调用 retryAsyncTask API
  - _Requirements: 32.1_

### 33. Checkpoint - Phase 7 验证

- [ ] 33.1 集成测试
  - 验证任务列表显示
  - 验证自动刷新
  - 验证任务操作（预览、下载、取消、重试）
  - 验证数据源刷新
  - _Requirements: 31.1-32.4_

---

## 🎯 Phase 8: 可视化查询（4-5 天）

### 34. 实现可视化查询构建器

- [ ] 34.1 创建 VisualQuery/index.tsx
  - 显示查询模式卡片
  - 显示配置面板
  - 显示 SQL 预览
  - _Requirements: 2.2, 3.1_

- [ ] 34.2 创建 ModeCards.tsx
  - 显示 5 个模式卡片（字段选择, 筛选条件, 分组聚合, 排序, 限制结果）
  - 实现卡片点击切换
  - 显示"启用"徽章
  - _Requirements: 34.1_

- [ ] 34.3 创建 FieldSelector.tsx
  - 显示字段列表（checkbox）
  - 显示字段类型标签
  - 实现全选/反选
  - _Requirements: 34.2_

- [ ] 34.4 创建 FilterBuilder.tsx
  - 显示过滤条件列表
  - 实现添加条件（字段、操作符、值）
  - 实现删除条件
  - _Requirements: 34.2_

- [ ] 34.5 创建 GroupByBuilder.tsx
  - 显示分组字段列表
  - 显示聚合函数配置
  - 实现拖拽排序
  - _Requirements: 34.2_

- [ ] 34.6 创建 SortBuilder.tsx
  - 显示排序字段列表
  - 显示 ASC/DESC 选择器
  - 实现拖拽排序
  - _Requirements: 34.2_

- [ ] 34.7 创建 LimitConfig.tsx
  - 显示限制输入框
  - 显示预设按钮（100, 1000, 10000）
  - _Requirements: 34.2_

### 35. 实现可视化查询生成和执行

- [ ] 35.1 实现 SQL 生成逻辑
  - 生成 SELECT 子句
  - 生成 FROM 子句
  - 生成 WHERE 子句
  - 生成 GROUP BY 子句
  - 生成 ORDER BY 子句
  - 生成 LIMIT 子句
  - _Requirements: 34.1-34.7_

- [ ] 35.2 实现实时 SQL 预览
  - 监听配置变化
  - 实时更新 SQL 预览
  - 实现 SQL 格式化
  - _Requirements: 35.1_

- [ ] 35.3 实现查询执行
  - 调用 executeDuckDBSQL
  - 显示结果在 ResultPanel
  - _Requirements: 35.1, 2.2_

### 36. Checkpoint - Phase 8 验证

- [ ] 36.1 集成测试
  - 验证所有查询模式
  - 验证 SQL 生成
  - 验证实时预览
  - 验证查询执行
  - _Requirements: 34.1-35.3_

---

## 🎯 Final: 整体测试和优化

### 37. 端到端测试

- [ ] 37.1 测试完整查询工作流
  - 选择表 → 构建查询 → 执行 → 查看结果
  - 测试所有查询模式
  - _Requirements: All phases_

- [ ] 37.2 测试数据源刷新机制
  - 上传文件 → 刷新 → 表出现在列表
  - 异步任务完成 → 自动刷新 → 表出现在列表
  - _Requirements: 3.1, 31.3_

- [ ] 37.3 测试错误处理
  - SQL 语法错误
  - 网络错误
  - 权限错误
  - _Requirements: All phases_

### 38. 性能优化

- [ ] 38.1 优化 AG-Grid 性能
  - 测试 100K 行数据渲染
  - 优化虚拟滚动配置
  - _Requirements: 6.2_

- [ ] 38.2 优化 Web Worker
  - 测试大数据集 distinct values 计算
  - 优化采样策略
  - _Requirements: 7.1_

- [ ] 38.3 优化状态管理
  - 检查不必要的重渲染
  - 添加 useMemo 和 useCallback
  - _Requirements: 2.2_

### 39. 文档和清理

- [ ] 39.1 更新 README
  - 添加新功能说明
  - 更新截图
  - _Requirements: All phases_

- [ ] 39.2 代码清理
  - 删除 console.log
  - 删除未使用的导入
  - 格式化代码
  - _Requirements: All phases_

- [ ] 39.3 创建迁移指南
  - 记录从旧 UI 到新 UI 的变化
  - 记录 API 变化
  - _Requirements: All phases_

---

## 📊 任务统计

| Phase | 任务数 | 可选任务数 | 预计工作量 |
|-------|-------|-----------|-----------|
| 1 | 15 | 2 | 5-7 天 |
| 2 | 24 | 1 | 5-7 天 |
| 3 | 10 | 0 | 3-4 天 |
| 4 | 8 | 0 | 2-3 天 |
| 5 | 8 | 0 | 2-3 天 |
| 6 | 7 | 0 | 3-4 天 |
| 7 | 9 | 0 | 2-3 天 |
| 8 | 13 | 0 | 4-5 天 |
| Final | 9 | 0 | 2-3 天 |
| **总计** | **103** | **3** | **28-39 天** |

---

**文档版本**: v2.0  
**创建时间**: 2024-12-04  
**状态**: ✅ 完整
