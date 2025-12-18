# Implementation Plan

## P0 问题修复（已完成）

- [x] 1. 修复统一数据源返回解析
  - [x] 1.1 修复 useDuckQuery.js 中的 connections 解析
    - 正确读取 `connectionsRes.data.items`
    - 映射 `item.subtype` 为 `type`
    - 映射 `item.connection_info` 为 `params`
    - 处理加密密码占位符
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. 修复统一三类 DB 的 test+save
  - [x] 2.1 修复 handleTestConnection 函数
    - 检测加密密码占位符 `***ENCRYPTED***`
    - 对已保存连接使用 `refreshDatabaseConnection` API
    - 对新密码使用 `testDatabaseConnection` API
    - 正确读取 `result.data.connection_test.success`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3. 修复异步任务预览跳转
  - [x] 3.1 修改跳转目标
    - 从 `"sql"` 改为 `"queryworkbench"`
    - _Requirements: 4.1_
  - [x] 3.2 添加 previewSQL prop 传递链
    - QueryWorkbenchPage 添加 previewSQL prop
    - QueryWorkspace 添加 previewSQL prop
    - QueryTabs 添加 previewSQL prop
    - SQLQueryPanel 添加 previewSQL prop
    - _Requirements: 4.2_
  - [x] 3.3 实现 SQL 预填
    - 在 SQLQueryPanel 中使用 useEffect 预填 SQL
    - 仅预填不自动执行
    - _Requirements: 4.3_

- [x] 4. 修复 Settings 入口空白
  - [x] 4.1 创建 SettingsPage 组件
    - 使用 shadcn/ui 组件
    - 包含数据库、界面、语言、安全设置卡片
    - 支持 i18n
    - _Requirements: 5.1, 5.2_
  - [x] 4.2 在 DuckQueryApp.jsx 中添加 settings 分支
    - 使用 React.lazy 懒加载
    - _Requirements: 5.3_

## P1 问题修复（已完成）

- [x] 5. 修复新侧边栏外部库节点类型映射错误
  - [x] 5.1 修复 useDataSources.ts 中的数据映射
    - 正确读取 `query.data.data.items`
    - 映射 `item.subtype` 为 `type`
    - 处理加密密码显示
    - _Requirements: 6.1, 6.2, 6.3_

## 待验证问题

- [ ] 6. 验证选中回填时密码显示
  - [ ] 6.1 检查编辑已保存连接时密码字段显示
    - 应显示空字符串而非加密占位符
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 7. 验证 PasteData 保存健壮性
  - [ ] 7.1 检查数据验证逻辑
    - _Requirements: 8.1_
  - [ ] 7.2 检查错误处理
    - _Requirements: 8.2, 8.3_

- [ ] 8. 验证新 DataSourcePanel 文案/i18n
  - [ ] 8.1 检查所有用户可见文本是否使用 i18n
    - _Requirements: 9.1, 9.2, 9.3_

## 修改的文件清单

1. `frontend/src/hooks/useDuckQuery.js` - 数据源解析
2. `frontend/src/DuckQueryApp.jsx` - 测试连接、异步任务预览、Settings 分支
3. `frontend/src/new/QueryWorkbenchPage.tsx` - 添加 previewSQL 支持
4. `frontend/src/new/Query/QueryWorkspace.tsx` - 添加 previewSQL 支持
5. `frontend/src/new/Query/QueryTabs/index.tsx` - 添加 previewSQL 支持
6. `frontend/src/new/Query/SQLQuery/SQLQueryPanel.tsx` - 添加 previewSQL 支持
7. `frontend/src/new/Settings/SettingsPage.tsx` - 新建设置页面
8. `frontend/src/new/hooks/useDataSources.ts` - 修复数据映射
