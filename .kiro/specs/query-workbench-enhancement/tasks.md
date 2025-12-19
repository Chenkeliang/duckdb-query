# 查询工作台功能增强 - 任务清单

> **版本**: 1.0  
> **创建时间**: 2024-12-19  
> **状态**: 📋 待开始

---

## 任务总览

| 阶段 | 任务数 | 预估工时 | 状态 |
|------|--------|----------|------|
| Phase 1: SQL 格式化 | 4 | 1 天 | ⬜ 待开始 |
| Phase 2: TanStack Table 增强 | 8 | 2 天 | ⬜ 待开始 |
| Phase 3: 异步任务完善 | 6 | 2 天 | ⬜ 待开始 |
| Phase 4: 测试与优化 | 4 | 1 天 | ⬜ 待开始 |

---

## Phase 1: SQL 格式化增强

### Task 1.1: 安装 sql-formatter 依赖
- [ ] 在 frontend 目录执行 `npm install sql-formatter`
- [ ] 验证安装成功
- [ ] 检查包体积影响

**验收标准**：
- `sql-formatter` 出现在 package.json dependencies 中
- 无构建错误

---

### Task 1.2: 创建 SQL 格式化工具
- [ ] 创建 `frontend/src/new/utils/sqlFormatter.ts`
- [ ] 实现 `formatSQLDataGrip()` 函数
- [ ] 实现 `formatSQLCompact()` 函数
- [ ] 配置 DataGrip 风格选项

**代码位置**：`frontend/src/new/utils/sqlFormatter.ts`

**验收标准**：
- 格式化后 SELECT 列表每列一行
- JOIN 条件正确对齐
- 关键字大写
- 不破坏注释和字符串

---

### Task 1.3: 集成到 SQL 编辑器
- [ ] 修改 `useSQLEditor.ts` 中的 `formatSQL` 函数
- [ ] 导入新的格式化工具
- [ ] 保留错误处理（格式化失败返回原始 SQL）

**代码位置**：`frontend/src/new/Query/SQLQuery/hooks/useSQLEditor.ts`

**验收标准**：
- 点击 Format 按钮后 SQL 正确格式化
- 格式化失败时不丢失原始 SQL

---

### Task 1.4: 测试 SQL 格式化
- [ ] 测试简单 SELECT 语句
- [ ] 测试多表 JOIN 语句
- [ ] 测试带子查询的语句
- [ ] 测试带注释的语句
- [ ] 测试带字符串字面量的语句
- [ ] 测试 DuckDB 特有语法（ATTACH、COPY 等）

**验收标准**：
- 所有测试场景格式化正确
- 无 JavaScript 错误

---

## Phase 2: TanStack Table 功能增强

### Task 2.1: 实现列可见性 Hook
- [ ] 创建 `frontend/src/new/Query/DataGrid/hooks/useColumnVisibility.ts`
- [ ] 实现 `useColumnVisibility` Hook
- [ ] 支持 localStorage 持久化
- [ ] 支持显示/隐藏所有列
- [ ] 支持重置为默认

**代码位置**：`frontend/src/new/Query/DataGrid/hooks/useColumnVisibility.ts`

**验收标准**：
- 可以隐藏/显示单个列
- 刷新页面后保持列可见性状态
- 可以一键显示所有列

---

### Task 2.2: 实现导出功能 Hook
- [ ] 创建 `frontend/src/new/Query/DataGrid/hooks/useGridExport.ts`
- [ ] 实现 `exportCSV()` 函数
- [ ] 实现 `exportJSON()` 函数
- [ ] 支持导出范围选择（全部/筛选后/选中）
- [ ] 正确处理特殊字符（逗号、换行、引号）
- [ ] 添加 UTF-8 BOM（Excel 兼容）

**代码位置**：`frontend/src/new/Query/DataGrid/hooks/useGridExport.ts`

**验收标准**：
- CSV 文件可以在 Excel 中正确打开
- JSON 文件格式正确
- 特殊字符正确转义

---

### Task 2.3: 更新 hooks/index.ts 导出
- [ ] 导出 `useColumnVisibility`
- [ ] 导出 `useGridExport`

**代码位置**：`frontend/src/new/Query/DataGrid/hooks/index.ts`

---

### Task 2.4: 集成列可见性到 DataGrid
- [ ] 在 DataGrid 组件中使用 `useColumnVisibility`
- [ ] 添加 `onColumnVisibilityChange` prop
- [ ] 根据可见性过滤显示的列

**代码位置**：`frontend/src/new/Query/DataGrid/DataGrid.tsx`

**验收标准**：
- 隐藏列后表格正确更新
- 列可见性变化触发回调

---

### Task 2.5: 集成导出功能到 DataGrid
- [ ] 在 DataGrid 组件中使用 `useGridExport`
- [ ] 添加 `onExport` prop
- [ ] 传递筛选后数据和选中行

**代码位置**：`frontend/src/new/Query/DataGrid/DataGrid.tsx`

**验收标准**：
- 可以从 DataGrid 导出数据
- 导出考虑筛选状态

---

### Task 2.6: 更新 ResultToolbar 支持 DataGrid
- [ ] 当 `useNewDataGrid=true` 时显示列可见性控制
- [ ] 当 `useNewDataGrid=true` 时显示导出按钮
- [ ] 传递正确的回调函数

**代码位置**：`frontend/src/new/Query/ResultPanel/ResultToolbar.tsx`

**验收标准**：
- DataGrid 模式下工具栏功能完整
- 列可见性菜单正常工作
- 导出按钮正常工作

---

### Task 2.7: 设置 DataGrid 为默认
- [ ] 修改 `ResultPanel.tsx` 中 `useNewDataGrid` 默认值为 `true`
- [ ] 确保切换按钮仍然可用

**代码位置**：`frontend/src/new/Query/ResultPanel/ResultPanel.tsx`

**验收标准**：
- 默认显示 TanStack DataGrid
- 可以切换回 AG Grid

---

### Task 2.8: UI 风格统一
- [ ] 调整选中单元格/行的背景色
- [ ] 统一表头高度和字体
- [ ] 统一底部统计栏样式

**代码位置**：`frontend/src/new/Query/DataGrid/` 相关组件

**验收标准**：
- DataGrid 和 AG Grid 视觉风格一致
- 无明显的样式差异

---

## Phase 3: 异步任务功能完善

### Task 3.1: 创建异步任务发起对话框
- [ ] 创建 `frontend/src/new/Query/AsyncTasks/AsyncTaskDialog.tsx`
- [ ] 使用 shadcn/ui Dialog 组件
- [ ] 实现自定义表名输入（带校验）
- [ ] 实现显示名输入
- [ ] 实现表名校验（字母/数字/下划线，不能以数字开头，最大 64 字符）
- [ ] 集成 API 调用（使用 TanStack Query mutation）
- [ ] 提交成功后刷新任务列表

**代码位置**：`frontend/src/new/Query/AsyncTasks/AsyncTaskDialog.tsx`

**验收标准**：
- 可以输入自定义表名
- 表名校验正确
- 提交后任务正确创建
- 使用 shadcn/ui 组件，无 MUI

---

### Task 3.2: 创建下载结果对话框
- [ ] 创建 `frontend/src/new/Query/AsyncTasks/DownloadResultDialog.tsx`
- [ ] 实现格式选择（CSV/Parquet）
- [ ] 显示格式说明
- [ ] 集成下载 API

**代码位置**：`frontend/src/new/Query/AsyncTasks/DownloadResultDialog.tsx`

**验收标准**：
- 可以选择下载格式
- 下载正确触发
- 显示下载进度

---

### Task 3.3: 完善 AsyncTaskPanel 显示
- [ ] 显示自定义表名
- [ ] 显示显示名
- [ ] 显示任务类型标签
- [ ] 显示文件生成状态

**代码位置**：`frontend/src/new/Query/AsyncTasks/AsyncTaskPanel.tsx`

**验收标准**：
- 任务列表显示完整信息
- 标签样式正确

---

### Task 3.4: 完善 AsyncTaskPanel 操作
- [ ] 添加下载按钮（成功任务）
- [ ] 完善取消对话框（带原因输入）
- [ ] 完善重试对话框（带确认）
- [ ] 添加预览结果功能

**代码位置**：`frontend/src/new/Query/AsyncTasks/AsyncTaskPanel.tsx`

**验收标准**：
- 所有操作按钮正常工作
- 对话框交互流畅

---

### Task 3.5: 集成到 SQL 面板
- [ ] 在 SQL 面板添加"异步执行"按钮（与"执行"按钮并列）
- [ ] 使用 shadcn/ui Button 组件
- [ ] 点击后打开 AsyncTaskDialog
- [ ] 添加快捷键支持（Ctrl+Shift+Enter）
- [ ] SQL 为空时禁用按钮

**代码位置**：`frontend/src/new/Query/SQLQuery/SQLQueryPanel.tsx`

**验收标准**：
- 异步执行按钮可见且样式一致
- 快捷键正常工作
- 对话框正确打开
- SQL 为空时按钮禁用

---

### Task 3.6: 更新 API 客户端
- [ ] 确保 `submitAsyncQuery` 支持新参数
- [ ] 确保 `downloadAsyncResult` 正常工作
- [ ] 添加必要的类型定义

**代码位置**：`frontend/src/services/apiClient.js`

**验收标准**：
- API 调用正确
- 类型定义完整

---

## Phase 4: 测试与优化

### Task 4.1: 功能测试
- [ ] 测试 SQL 格式化各种场景
- [ ] 测试 DataGrid 列隐藏/显示
- [ ] 测试 DataGrid 导出功能
- [ ] 测试异步任务完整流程

**验收标准**：
- 所有功能正常工作
- 无 JavaScript 错误

---

### Task 4.2: 性能测试
- [ ] 测试大数据量（10 万行）下 DataGrid 性能
- [ ] 测试导出大文件性能
- [ ] 测试格式化长 SQL 性能

**验收标准**：
- 10 万行数据流畅滚动
- 导出 10 万行 < 5 秒
- 格式化 1000 行 SQL < 1 秒

---

### Task 4.3: UI 调整
- [ ] 检查深色模式兼容性
- [ ] 检查响应式布局
- [ ] 检查国际化文本

**验收标准**：
- 深色模式正常
- 移动端可用
- 中英文切换正常

---

### Task 4.4: 文档更新
- [ ] 更新 DataGrid README
- [ ] 更新 AsyncTaskPanel 注释
- [ ] 更新 i18n 翻译文件

**验收标准**：
- 文档与代码一致
- 翻译完整

---

## 完成标准

### 整体验收标准

1. **SQL 格式化**
   - [ ] 使用 sql-formatter 库实现
   - [ ] 格式化效果符合 DataGrip 风格
   - [ ] 格式化失败时返回原始 SQL
   - [ ] 不破坏原有功能

2. **TanStack Table**
   - [ ] 默认使用 DataGrid
   - [ ] 列隐藏/显示正常
   - [ ] 列可见性状态持久化
   - [ ] 导出 CSV/JSON 正常
   - [ ] 导出文件格式正确（UTF-8 BOM）
   - [ ] UI 风格与 AG Grid 一致
   - [ ] 深色模式正常

3. **异步任务**
   - [ ] 可以发起带自定义表名的任务
   - [ ] 表名校验正确
   - [ ] 可以下载结果文件（CSV/Parquet）
   - [ ] 任务列表显示完整信息
   - [ ] 所有对话框使用 shadcn/ui 组件

4. **UI/UX**
   - [ ] 所有新增组件使用 shadcn/ui + Tailwind CSS
   - [ ] 无 MUI 组件
   - [ ] 无自定义 CSS
   - [ ] 深色模式适配
   - [ ] 国际化完整

5. **构建**
   - [ ] `npm run build` 通过
   - [ ] `npm run lint` 无错误
   - [ ] `npx tsc --noEmit` 无错误
   - [ ] 无新增 console.error/warn

---

## 进度跟踪

| 日期 | 完成任务 | 备注 |
|------|----------|------|
| - | - | - |
