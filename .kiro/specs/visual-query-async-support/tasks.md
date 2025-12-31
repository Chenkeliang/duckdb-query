# Tasks: Visual Query Async Task Support

## Overview

为 JOIN 查询面板和集合操作面板添加异步任务支持。

## Task List

### Task 1: Update JoinQueryPanel

**文件**: `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx`

**修改内容**:
1. 添加 `Timer` 图标导入
2. 添加 `AsyncTaskDialog` 组件导入
3. 添加 `Tooltip` 相关组件导入
4. 添加 `asyncDialogOpen` 状态
5. 在"执行"按钮后添加带 Tooltip 的"异步执行"按钮
6. 在组件底部添加 `AsyncTaskDialog`

**关键实现点**:
- 按钮禁用条件：`!canExecute || isExecuting || !sql?.trim()`
- `attachDatabases?.map(...) ?? []` 防止 undefined
- 透传 `connectionName` 到 AsyncTaskDialog
- `datasource` 的 `id`/`type` 字段判空处理

**预计时间**: 20 分钟

---

### Task 2: Update SetOperationsPanel

**文件**: `frontend/src/new/Query/SetOperations/SetOperationsPanel.tsx`

**修改内容**:
1. 添加 `Timer` 图标导入
2. 添加 `AsyncTaskDialog` 组件导入
3. 添加 `Tooltip` 相关组件导入
4. 添加 `asyncDialogOpen` 状态
5. 在"执行"按钮后添加带 Tooltip 的"异步执行"按钮
6. 在组件底部添加 `AsyncTaskDialog`

**注意**: 集合操作不支持外部表，`datasource` 和 `attachDatabases` 留空。

**预计时间**: 15 分钟

---

### Task 3: Manual Verification

1. 启动前后端开发服务器
2. 测试 JOIN 查询面板的异步执行功能
   - 按钮存在且样式正确
   - Tooltip 显示正确
   - 弹窗显示附加数据库列表（包含 connectionName）
3. 测试集合操作面板的异步执行功能
4. 验证任务成功提交并出现在异步任务列表中
5. 测试边界情况（空 SQL、未配置有效查询）

**预计时间**: 15 分钟

---

### Task 4: (Optional) Add Unit Tests

**文件**: `frontend/src/new/Query/JoinQuery/__tests__/JoinQueryPanel.async.test.tsx`

使用 RTL 验证：
- 按钮渲染正确
- 禁用状态正确
- 点击后对话框打开

## Acceptance Criteria

- [ ] JOIN 查询面板有"异步执行"按钮
- [ ] 集合操作面板有"异步执行"按钮
- [ ] 按钮样式为 `variant="outline"`
- [ ] 按钮包含 Timer 图标
- [ ] 按钮有 Tooltip 提示
- [ ] 按钮有 `aria-label` 属性
- [ ] 点击按钮弹出 AsyncTaskDialog
- [ ] 弹窗中附加数据库列表信息完整（含 connectionName）
- [ ] 提交任务成功后对话框关闭
- [ ] SQL 为空时按钮被禁用
- [ ] 查询未就绪时按钮被禁用
