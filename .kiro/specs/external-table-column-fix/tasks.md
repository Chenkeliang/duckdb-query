# Implementation Plan

## 1. 后端：联邦查询 API 端点

- [x] 1.1 创建 FederatedQueryRequest 模型
  - 在 `api/models/query_models.py` 中添加新模型
  - 包含 sql, attach_databases, is_preview, save_as_table, timeout 字段
  - _Requirements: 2.1, 2.2_

- [x] 1.2 实现 `/api/duckdb/federated-query` 端点
  - 在 `api/routers/duckdb_query.py` 中添加新端点
  - 实现 ATTACH/DETACH 流程
  - 获取连接配置并解密密码
  - 使用 `build_attach_sql` 生成 ATTACH 语句
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 1.3 编写联邦查询端点单元测试
  - 测试参数验证
  - 测试 ATTACH/DETACH 流程
  - 测试错误处理
  - _Requirements: 2.2, 2.3_

## 2. 前端：统一表列信息获取 Hook

- [x] 2.1 创建 `useTableColumns` Hook
  - 在 `frontend/src/new/hooks/useTableColumns.ts` 中创建
  - 自动根据表来源选择 API（DuckDB vs External）
  - 统一返回格式 `{ name: string, type: string }[]`
  - 添加 `isEmpty` 标志用于检测空列数组
  - 实现 `transformExternalColumns` 和 `transformDuckDBColumns` 函数
  - 处理 null/undefined/非数组的边界情况
  - _Requirements: 1.1, 1.5, 1.6, 4.1, 4.2_

- [x] 2.2 编写 useTableColumns 属性测试
  - **Property 1: External Table Column API Selection**
  - **Validates: Requirements 1.1, 4.1**

- [x] 2.3 编写 useTableColumns 属性测试
  - **Property 2: Column Data Format Consistency**
  - **Validates: Requirements 1.4, 4.2**

## 3. 前端：JoinQueryPanel 外部表列信息修复

- [x] 3.1 更新 JoinQueryPanel 使用 useTableColumns
  - 替换 `getDuckDBTableDetail` 调用
  - 使用新的 `useTableColumns` Hook
  - _Requirements: 1.1, 1.3, 1.4_

- [x] 3.2 添加外部表列信息加载错误处理
  - 显示用户友好的错误消息
  - 允许重试
  - _Requirements: 1.2_

- [x] 3.3 处理列信息为空的边界情况
  - 当 `columns` 为空数组时显示 "无法获取列信息" 提示
  - 当列名或类型为空时使用默认值
  - 禁用空列表的列选择下拉框
  - _Requirements: 1.5, 1.6_

## 4. 前端：useQueryWorkspace 联邦查询支持

- [ ] 4.1 扩展 TableSource 类型
  - 添加 `type: 'federated'` 支持
  - 添加 `attachDatabases` 字段
  - _Requirements: 3.1, 3.2_

- [ ] 4.2 更新 handleQueryExecute 支持联邦查询
  - 根据 source.type 选择正确的 API
  - `federated` → `executeFederatedQuery`
  - `external` → `executeExternalSQL`
  - `duckdb` → `executeDuckDBSQL`
  - _Requirements: 3.2, 3.3_

- [ ] 4.3 编写 useQueryWorkspace 属性测试
  - **Property 3: Federated Query API Routing**
  - **Validates: Requirements 2.1, 3.2**

- [ ] 4.4 编写 useQueryWorkspace 属性测试
  - **Property 4: Pure DuckDB Query Routing**
  - **Validates: Requirements 3.3**

## 5. 前端：SQLQueryPanel 联邦查询支持

- [x] 5.1 更新 SQLQueryPanel 使用 useTableColumns
  - 替换 `getDuckDBTableDetail` 调用
  - 使用新的 `useTableColumns` Hook
  - _Requirements: 3.1, 3.2_

- [ ] 5.2 构建联邦查询参数
  - 当检测到混用时，使用 `extractAttachDatabases` 构建参数
  - 传递 `type: 'federated'` 给 onExecute
  - _Requirements: 3.1, 3.2_

- [ ] 5.3 更新混用提示为信息提示
  - 将警告改为信息提示，说明将使用联邦查询
  - _Requirements: 3.4_

## 6. 前端：apiClient 联邦查询更新

- [ ] 6.1 更新 executeFederatedQuery 使用新端点
  - 修改 API 路径为 `/api/duckdb/federated-query`
  - 确保请求参数格式正确
  - _Requirements: 2.1_

- [ ] 6.2 编写 executeFederatedQuery 属性测试
  - **Property 5: Attach Database Parameter Validation**
  - **Validates: Requirements 2.2, 4.3**

- [ ] 6.3 编写 executeFederatedQuery 属性测试
  - **Property 6: Federated Query Response Format**
  - **Validates: Requirements 2.3_

## 7. 前端：SetOperationsPanel 外部表支持

- [x] 7.1 更新 SetOperationsPanel 使用 useTableColumns
  - 替换 `getDuckDBTableDetail` 调用
  - 支持外部表列信息获取
  - _Requirements: 5.1_

- [ ] 7.2 移除外部表执行限制
  - 删除 `if (sourceAnalysis.hasExternal) return false` 检查
  - 允许外部表参与集合操作
  - _Requirements: 5.2_

- [ ] 7.3 添加联邦查询支持
  - 当选中的表包含外部表时，使用联邦查询
  - 构建 `attachDatabases` 参数
  - _Requirements: 5.3_

- [ ] 7.4 增强列数量验证错误提示
  - 显示具体的列数量差异
  - 显示每个表的列数量
  - _Requirements: 5.4_

## 8. 前端：PivotTablePanel 外部表支持

- [x] 8.1 更新 PivotTablePanel 列信息获取
  - 使用 `useTableColumns` Hook 替换当前逻辑
  - 支持外部表列信息获取
  - _Requirements: 6.1_

- [ ] 8.2 更新 PivotTablePanel distinct 值查询
  - 对于外部表，使用联邦查询 API 获取 distinct 值
  - 替换当前返回空值的逻辑
  - _Requirements: 6.2_

- [ ] 8.3 处理外部表列信息为空的情况
  - 显示 "无法获取表结构" 提示
  - 禁用行字段、列字段、值字段选择
  - _Requirements: 6.3_

- [ ] 8.4 添加透视查询联邦查询支持
  - 当源表是外部表时，使用联邦查询 API 执行透视查询
  - _Requirements: 6.4_

## 8.5 前端：VisualQuery 组件外部表支持

- [x] 8.5.1 更新 ColumnSelector 使用 useTableColumns
- [x] 8.5.2 更新 AggregationBuilder 使用 useTableColumns
- [x] 8.5.3 更新 SortBuilder 使用 useTableColumns
- [x] 8.5.4 更新 FilterBuilder 使用 useTableColumns
- [x] 8.5.5 更新 JoinBuilder 使用 useTableColumns

## 9. Checkpoint - 确保所有测试通过

- [x] 9. Checkpoint - Make sure all tests are passing
  - 249 个测试全部通过

## 10. 集成测试和验证

- [ ] 10.1 验证 JoinQueryPanel 外部表列信息显示
  - 选择外部表，确认列信息正确显示
  - _Requirements: 1.1, 1.4_

- [ ] 10.2 验证 SQLQueryPanel 联邦查询执行
  - 混合选择 DuckDB 和外部表
  - 执行查询，确认结果正确
  - _Requirements: 3.1, 3.2_

- [ ] 10.3 验证 SetOperationsPanel 外部表支持
  - 选择外部表，确认列信息和查询执行正确
  - _Requirements: 1.1, 3.2_

- [ ] 10.4 验证 PivotTablePanel 外部表支持
  - 选择外部表，确认 distinct 值查询正确
  - _Requirements: 1.1_

## 11. Final Checkpoint - 确保所有测试通过

- [ ] 11. Final Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.
