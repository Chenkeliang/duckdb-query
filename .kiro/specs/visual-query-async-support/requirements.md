# Requirements: Visual Query Async Task Support

## Overview

当前 SQL 查询面板支持异步任务执行，但 JOIN 查询面板和集合操作面板不支持。用户需要在这两个面板中也能提交异步任务，以便执行长时间运行的复杂查询并将结果保存到 DuckDB 表中。

## Current State

### SQL Query Panel (支持异步)

- 有"异步执行"按钮 (`variant="outline"`)
- 点击后弹出 `AsyncTaskDialog` 对话框
- 支持自定义表名和联邦查询 (`attachDatabases`)
- 快捷键：`Ctrl+Shift+Enter` / `Cmd+Shift+Enter`

### JOIN Query Panel (不支持异步)

- 只有"执行"按钮
- 没有异步执行入口
- 已经计算了 `attachDatabases`（用于联邦查询），但未传递给异步对话框

### Set Operations Panel (不支持异步)

- 只有"执行"按钮
- 没有异步执行入口
- 注意：当前不支持外部表，只支持 DuckDB 表

## Requirements

### R1: JOIN Query Panel Async Support

1.1. 在"执行"按钮后添加"异步执行"按钮

1.2. 按钮样式：`variant="outline"`，与 SQLToolbar 一致

1.3. 点击后弹出 `AsyncTaskDialog` 对话框

1.4. 传递以下参数给对话框：
   - `sql`: 生成的 JOIN 查询 SQL
   - `datasource`: 如果是外部表查询，传递数据源信息
   - `attachDatabases`: 附加数据库列表（用于联邦查询）

1.5. 需要导入 `AsyncTaskDialog` 组件

1.6. 需要添加状态控制对话框开关 (`asyncDialogOpen`)

### R2: Set Operations Panel Async Support

2.1. 在"执行"按钮后添加"异步执行"按钮

2.2. 按钮样式：`variant="outline"`，与 SQLToolbar 一致

2.3. 点击后弹出 `AsyncTaskDialog` 对话框

2.4. 传递以下参数给对话框：
   - `sql`: 生成的集合操作 SQL
   - `datasource`: 可选（当前只支持 DuckDB 表）
   - `attachDatabases`: 可选（如果未来支持外部表）

2.5. 由于当前集合操作不支持外部表，异步执行时 `datasource` 和 `attachDatabases` 可以留空

### R3: UI Consistency

3.1. "异步执行"按钮应包含 `Timer` 图标

3.2. 按钮文本使用 i18n key：`query.sql.asyncExecute`

3.3. 按钮应有 Tooltip 提示异步执行的用途

### R4: Completion Handling

4.1. 异步任务提交成功后，应触发 `onSuccess` 回调

4.2. 可选：显示 Toast 提示用户任务已提交

## Out of Scope

- 键盘快捷键支持（可在后续迭代中添加）
- 集合操作的外部表支持（需要单独的功能迭代）

## Success Criteria

- [ ] JOIN 查询面板有"异步执行"按钮
- [ ] 集合操作面板有"异步执行"按钮
- [ ] 点击后弹出异步任务对话框
- [ ] 任务可以成功提交
- [ ] 提交的任务在异步任务面板中可见
