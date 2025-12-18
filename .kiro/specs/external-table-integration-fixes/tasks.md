# Implementation Plan

## Phase 1: P0 - 外部链路贯通

- [x] 1. 修复数据源 Hook API 契约
  - [x] 1.1 修复 useDatabaseConnections Hook
    - 修改 `frontend/src/new/hooks/useDatabaseConnections.ts`
    - 正确读取 `data.data.items` 路径
    - 将 `item.subtype` 映射到 `connection.type`
    - 去除 `item.id` 的 `db_` 前缀
    - _Requirements: 2.1, 2.2_
  - [x] 1.2 Write property test for API response transformation
    - **Property 2: API Response Transformation Correctness**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  - [x] 1.3 修复 useDataSources Hook
    - 修改 `frontend/src/new/hooks/useDataSources.ts`
    - 正确读取 `query.data?.data?.items` 而非 `query.data?.datasources`
    - 添加 `dbType` 字段从 `subtype` 映射
    - _Requirements: 2.3, 2.4_

- [x] 2. 统一 SelectedTable 数据流
  - [x] 2.1 改造 useQueryWorkspace Hook
    - 修改 `frontend/src/new/hooks/useQueryWorkspace.ts`
    - 将 `selectedTables` 类型从 `Record<string, string[]>` 改为 `Record<string, SelectedTable[]>`
    - 新增 `lastQuery: { sql: string; source: TableSource } | null` 状态
    - 修改 `handleTableSelect` 接收 `SelectedTable` 对象
    - 修改 `handleQueryExecute` 接收可选 `source` 参数
    - _Requirements: 1.1, 1.4, 3.3_
  - [x] 2.2 Write property test for SelectedTable data flow
    - **Property 1: SelectedTable Data Flow Integrity**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
  - [x] 2.3 改造 QueryWorkspace 组件
    - 修改 `frontend/src/new/Query/QueryWorkspace.tsx`
    - 传递 `SelectedTable[]` 到 QueryTabs
    - 传递 `lastQuery.source` 和 `lastQuery.sql` 到 ResultPanel
    - _Requirements: 1.2, 4.1_
  - [x] 2.4 改造 QueryTabs 组件
    - 修改 `frontend/src/new/Query/QueryTabs/index.tsx`
    - 将 `selectedTables` props 类型改为 `SelectedTable[]`
    - 透传到 SQL/Join/Set/Pivot/Visual 子组件
    - _Requirements: 1.2, 1.3_

- [x] 3. 实现外部查询执行链路
  - [x] 3.1 添加外部 SQL 执行函数
    - 在 `frontend/src/services/apiClient.js` 添加 `executeExternalSQL` 函数
    - 调用 `POST /api/execute_sql`
    - 确保 `datasource.id` 不带 `db_` 前缀
    - _Requirements: 3.1_
  - [x] 3.2 修改 handleQueryExecute 支持外部数据源
    - 在 `useQueryWorkspace.ts` 中根据 `source.type` 路由到不同执行函数
    - `external` → `executeExternalSQL`
    - `duckdb` 或无 source → `executeDuckDBSQL`
    - 执行后保存 `lastQuery` 状态
    - _Requirements: 3.2, 3.3_
  - [x] 3.3 Write property test for external query routing
    - **Property 3: External Query Execution Routing**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 4. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 修复导入链路
  - [x] 5.1 修改 ResultPanel 传递查询信息
    - 修改 `frontend/src/new/Query/ResultPanel/ResultPanel.tsx`
    - 添加 `source` 和 `currentSQL` props
    - 根据 `source?.type === 'external'` 显示导入按钮
    - _Requirements: 4.1, 4.2_
  - [x] 5.2 修复 ImportToDuckDBDialog ID 处理
    - 修改 `frontend/src/new/Query/ResultPanel/ImportToDuckDBDialog.tsx`
    - 确保 `datasource.id` 去除 `db_` 前缀
    - 确保 `datasource.type` 使用实际数据库类型
    - _Requirements: 4.3, 4.4_
  - [x] 5.3 Write property test for import dialog data flow
    - **Property 4: Import Dialog Data Flow Correctness**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**


- [x] 6. 修复 DataSourcePanel 选中状态
  - [x] 6.1 修改 DatabaseConnectionNode 选中判断
    - 修改 `frontend/src/new/Query/DataSourcePanel/DatabaseConnectionNode.tsx`
    - 使用完整标识符匹配（connection.id + schema + table.name）
    - 支持 SelectedTable 对象比较
    - _Requirements: 5.1, 5.2_
  - [x] 6.2 修改 SchemaNode 选中判断（如存在）
    - 同样使用完整标识符匹配
    - _Requirements: 5.3, 5.4_
  - [x] 6.3 Write property test for selection state
    - **Property 5: External Table Selection State Correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 7. 修复连接测试逻辑
  - [x] 7.1 修改连接测试 API 调用
    - 新连接调用 `POST /api/datasources/databases/test`
    - 已保存连接调用 `POST /api/datasources/databases/{id}/refresh`
    - 正确解析 `data.connection_test.success` 作为测试结果
    - _Requirements: 6.1, 6.2_
  - [x] 7.2 处理密码占位符显示
    - 已保存连接显示 `***ENCRYPTED***` 占位符
    - _Requirements: 6.3_
  - [x] 7.3 Write property test for connection test routing
    - **Property 6: Connection Test API Routing**
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 8. Checkpoint - P0 完成验证
  - Ensure all tests pass, ask the user if questions arise.

## Phase 2: P1 - 功能正确性

- [x] 9. 修复 JoinQueryPanel 配置收缩
  - [x] 9.1 实现 joinConfigs 自动收缩
    - 修改 `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx`
    - 当 `activeTables.length` 减少时，收缩 `joinConfigs` 数组
    - 同步清理 `selectedColumns` 中对应表项
    - _Requirements: 7.1, 7.2_
  - [x] 9.2 Write property test for join config synchronization
    - **Property 7: Join Config Synchronization**
    - **Validates: Requirements 7.1, 7.2**
  - [x] 9.3 实现多条件 Join 支持
    - 扩展 `JoinConfig` 类型支持 `conditions: Array<{leftCol, rightCol, operator}>`
    - 添加 UI 支持添加/删除条件
    - 修改 SQL 生成逻辑组合多条件
    - _Requirements: 7.3, 7.4_
  - [x] 9.4 Write property test for multi-condition join SQL
    - **Property 8: Join Multi-Condition SQL Generation**
    - **Validates: Requirements 7.3, 7.4**

- [x] 10. 修复 SetOperationsPanel 列一致性校验
  - [x] 10.1 实现列一致性验证函数
    - 修改 `frontend/src/new/Query/SetOperations/SetOperationsPanel.tsx`
    - 以第一个表的列作为基准集
    - 验证后续表的列数量和名称匹配
    - _Requirements: 8.1, 8.2_
  - [x] 10.2 添加验证 UI 反馈
    - 不一致时显示警告信息
    - 禁用执行按钮
    - _Requirements: 8.3, 8.4_
  - [x] 10.3 Write property test for column validation
    - **Property 9: Set Operations Column Validation**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

- [x] 11. 修复 PivotTablePanel 真正实现
  - [x] 11.1 实现 distinct 值查询
    - 修改 `frontend/src/new/Query/PivotTable/PivotTablePanel.tsx`
    - 查询 `columnField` 的 distinct 值（限制 20 个）
    - 超过阈值时显示警告
    - _Requirements: 9.2, 9.4_
  - [x] 11.2 实现 CASE WHEN 透视 SQL 生成
    - 为每个 distinct 值生成 `CASE WHEN` 表达式
    - 正确组装 `GROUP BY` 子句
    - _Requirements: 9.1, 9.3_
  - [x] 11.3 Write property test for pivot SQL generation
    - **Property 10: Pivot SQL Generation Correctness**
    - **Validates: Requirements 9.1, 9.3, 9.4**

- [x] 12. 处理外部表列信息获取
  - [x] 12.1 在 Join/Set/Pivot 面板添加外部表提示
    - 当选中外部表时显示"请先导入 DuckDB"提示
    - 或禁用相关功能
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 13. 修复 TableContextMenu 外部表处理
  - [x] 13.1 修改右键菜单选项
    - 修改 `frontend/src/new/Query/DataSourcePanel/ContextMenu.tsx`
    - 外部表只显示 Preview 和 Import 选项
    - 隐藏 DESCRIBE、DROP 等 DuckDB 特定选项
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 13.2 Write property test for context menu filtering
    - **Property 11: External Table Context Menu Filtering**
    - **Validates: Requirements 11.1, 11.2, 11.3**

- [x] 14. 修复 AG Grid Community 兼容性
  - [x] 14.1 移除 enterprise-only 配置
    - 修改 `frontend/src/new/Query/ResultPanel/AGGridWrapper.tsx`
    - 移除或禁用 `enableRangeSelection`
    - 添加防御式 API 调用 `gridApi?.getCellRanges?.()`
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 15. Checkpoint - P1 完成验证
  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: P2 - UI/UX 规范

- [x] 16. 清理 UI Token 类
  - [x] 16.1 替换 bg-surface 类
    - 在 `frontend/src/new/` 目录下搜索并替换
    - `bg-surface` → `bg-card` 或 `bg-background`
    - `bg-surface-hover` → `bg-accent`
    - _Requirements: 13.1, 13.2_
  - [x] 16.2 替换 warning 相关类
    - `text-warning` → `text-muted-foreground` + 图标
    - `border-warning` → `border-muted` 或移除
    - _Requirements: 13.3_
  - [x] 16.3 移除 arbitrary z-index
    - 搜索 `z-[` 并替换为 shadcn 内置层级
    - _Requirements: 13.4_

- [x] 17. 国际化文案统一
  - [x] 17.1 替换硬编码中文文案
    - 搜索 `frontend/src/new/` 中的中文字符串
    - 替换为 `t()` 函数调用
    - _Requirements: 14.1, 14.3, 14.4_
  - [x] 17.2 添加 i18n keys
    - 在 `frontend/src/i18n/locales/zh/common.json` 添加中文
    - 在 `frontend/src/i18n/locales/en/common.json` 添加英文
    - _Requirements: 14.2_

- [x] 18. 外部表图标统一
  - [x] 18.1 替换 emoji 为 lucide-react 图标
    - 修改 `frontend/src/new/Query/DataSourcePanel/TableItem.tsx`
    - 使用 `Database`、`Table2` 等图标
    - 添加 Badge 标记数据源类型
    - _Requirements: 15.1, 15.2, 15.3_

- [x] 19. Final Checkpoint - 全部完成验证
  - Ensure all tests pass, ask the user if questions arise.
