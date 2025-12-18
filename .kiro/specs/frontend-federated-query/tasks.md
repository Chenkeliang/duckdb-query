# Implementation Plan

## 1. API Client 扩展

- [x] 1.1 添加 executeFederatedQuery 函数
  - 在 `frontend/src/services/apiClient.js` 中添加新函数
  - 支持 `attach_databases` 参数
  - 设置 2 秒连接超时
  - _Requirements: 6.1, 6.2, 10.6_

- [x] 1.2 编写 Property 6 属性测试：API 请求序列化
  - **Property 6: API request serialization**
  - **Validates: Requirements 2.4, 6.2, 6.4**
  - 验证 attach_databases 数组正确序列化为 JSON

- [x] 1.3 添加联邦查询错误解析函数
  - 实现 `parseFederatedQueryError()` 函数
  - 解析认证、超时、网络错误
  - _Requirements: 3.1, 3.2, 3.3, 6.3_

## 2. SQL 生成工具扩展

- [x] 2.1 实现 extractAttachDatabases 函数
  - 在 `frontend/src/new/utils/sqlUtils.ts` 中添加
  - 从表列表提取唯一的外部连接
  - 过滤掉 DuckDB 本地表
  - _Requirements: 1.3, 8.3, 9.3_

- [x] 2.2 编写 Property 1 属性测试：attach_databases 列表一致性
  - **Property 1: Attach databases list consistency**
  - **Validates: Requirements 1.3, 8.3, 9.3**
  - 验证列表包含且仅包含唯一的外部连接

- [x] 2.3 实现 generateDatabaseAlias 函数
  - 生成唯一的数据库别名
  - 处理别名冲突
  - _Requirements: 9.2, 9.5_

- [x] 2.4 编写 Property 5 属性测试：数据库别名唯一性
  - **Property 5: Unique database aliases**
  - **Validates: Requirements 9.2, 9.5**
  - 验证生成的别名始终唯一

- [x] 2.5 实现 formatTableReference 函数
  - 外部表使用 `alias.schema.table` 格式
  - DuckDB 表使用普通表名
  - _Requirements: 2.1, 8.2_

- [x] 2.6 编写 Property 2 和 Property 3 属性测试
  - **Property 2: External table SQL prefix**
  - **Property 3: DuckDB table SQL format**
  - **Validates: Requirements 2.1, 4.2, 8.2**

## 3. Checkpoint - 确保基础工具测试通过

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## 4. useFederatedQuery Hook

- [x] 4.1 创建 useFederatedQuery Hook
  - 在 `frontend/src/new/hooks/useFederatedQuery.ts` 中创建
  - 管理 attachDatabases 状态
  - 提供 addTable/removeTable/clearTables 方法
  - _Requirements: 1.3, 1.4_

- [x] 4.2 编写 Property 4 属性测试：表移除后的 attach_databases 更新
  - **Property 4: Attach databases removal consistency**
  - **Validates: Requirements 1.4**
  - 验证移除表后正确更新 attach_databases

- [x] 4.3 实现 generateSQL 方法
  - 支持混合源查询 SQL 生成
  - 正确处理列别名
  - _Requirements: 2.1, 2.3, 4.3, 4.4_

- [x] 4.4 编写 Property 7 属性测试：多表查询的列别名
  - **Property 7: Column alias in multi-table queries**
  - **Validates: Requirements 4.3, 4.4**
  - 验证列引用包含正确的表别名

- [x] 4.5 实现 executeQuery 方法
  - 调用 executeFederatedQuery API
  - 处理错误响应
  - _Requirements: 2.4, 10.1, 10.4_

## 5. Checkpoint - 确保 Hook 测试通过

- [x] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## 6. JoinQueryPanel 跨数据库支持

- [x] 6.1 移除跨数据库限制
  - 修改 `canExecute` 逻辑，允许混合源 JOIN
  - 移除 `sourceAnalysis.mixed` 和 `sourceAnalysis.hasExternal` 检查
  - _Requirements: 1.1, 8.1, 9.1_

- [x] 6.2 集成 useFederatedQuery Hook
  - 使用 Hook 管理 attach_databases
  - 更新 SQL 生成逻辑
  - _Requirements: 1.3, 2.2_

- [x] 6.3 更新 handleExecute 函数
  - 传递 attach_databases 参数
  - 处理联邦查询错误
  - _Requirements: 2.4, 3.1, 3.2, 3.3_

- [x] 6.4 编写 JoinQueryPanel 集成测试
  - 测试跨数据库表选择
  - 测试 SQL 生成
  - 测试错误处理

## 7. AttachedDatabasesIndicator 组件

- [x] 7.1 创建 AttachedDatabasesIndicator 组件
  - 在 `frontend/src/new/Query/components/` 中创建
  - 显示将要连接的数据库列表
  - 支持 Tooltip 显示连接详情
  - _Requirements: 7.1, 7.2, 7.4_

- [x] 7.2 编写 Property 8 属性测试：UI 指示器响应性
  - **Property 8: UI indicator reactivity**
  - **Validates: Requirements 7.3**
  - 验证 UI 指示器随 attach_databases 变化更新

- [x] 7.3 集成到 JoinQueryPanel
  - 在工具栏显示附加数据库指示器
  - 根据 attach_databases 状态显示/隐藏
  - _Requirements: 7.1, 7.3, 7.4_

## 8. Checkpoint - 确保 UI 组件测试通过

- [x] 8. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## 9. 错误处理和用户反馈

- [ ] 9.1 实现连接错误提示
  - 显示具体的连接失败信息
  - 提供跳转到数据源设置的链接
  - _Requirements: 3.1, 3.2, 10.2, 10.5_

- [ ] 9.2 实现超时错误处理
  - 显示超时错误信息
  - 提供重试按钮
  - _Requirements: 3.3, 10.3_

- [ ] 9.3 实现连接状态指示器
  - 显示每个外部数据库的连接状态
  - 连接不可用时禁用执行按钮
  - _Requirements: 11.1, 11.3, 11.4_

## 10. Visual Query Builder 支持

- [ ] 10.1 更新 TableSelector 组件
  - 支持选择外部数据库表
  - 显示数据库类型图标
  - _Requirements: 4.1, 8.4_

- [ ] 10.2 更新 QueryBuilder SQL 生成
  - 使用 formatTableReference 生成表引用
  - 正确处理外部表的列引用
  - _Requirements: 4.2, 4.3, 4.4_

## 11. 国际化支持

- [x] 11.1 添加中文翻译
  - 在 `frontend/src/i18n/locales/zh/common.json` 中添加
  - 包括错误消息、提示文本等
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 11.2 添加英文翻译
  - 在 `frontend/src/i18n/locales/en/common.json` 中添加
  - _Requirements: 3.1, 3.2, 3.3_

## 12. Final Checkpoint - 确保所有测试通过

- [ ] 12. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
