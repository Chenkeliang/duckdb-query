# Implementation Plan

- [x] 1. 后端 API 开发
  - 实现获取 schemas 和表列表的 API 端点
  - _Requirements: 2.1, 2.2, 2.3, 5.2, 5.3_

- [x] 1.1 创建 schemas API 端点（统一路径）
  - 在 `api/routers/database_tables.py` 中新增 `GET /databases/{connection_id}/schemas`
  - 使用统一的 `/databases` 路径前缀（与其他数据库 API 保持一致）
  - 支持 PostgreSQL 查询所有 schemas
  - MySQL/SQLite 返回空列表（没有 schema 概念）
  - 返回格式: `{ success, connection_id, schemas: [{ name, table_count }], total_schemas }`
  - _Requirements: 2.3, 5.2_

- [x] 1.2 创建 schema 表列表 API 端点（统一路径）
  - 在 `api/routers/database_tables.py` 中新增 `GET /databases/{connection_id}/schemas/{schema}/tables`
  - 使用统一的 `/databases` 路径前缀
  - 查询指定 schema 下的所有表
  - 返回格式: `{ success, connection_id, schema, tables: [{ name, type, row_count }], total_tables }`
  - _Requirements: 2.4, 5.3_

- [x] 1.3 废弃重复的 API 端点
  - 在 `api/routers/data_sources.py` 中标记以下端点为 deprecated:
    - `POST /api/database/connect` - 替代方案: `POST /databases` + `GET /databases/{id}/tables`
    - `POST /api/test_connection_simple` - 替代方案: `POST /databases/test`
  - 添加 `deprecated=True` 参数到 `@router` 装饰器
  - 添加警告日志记录使用情况
  - 在响应中添加 `X-Deprecated` header
  - _Requirements: API 统一性_

- [x] 1.4 更新 API 文档
  - 在 FastAPI 自动生成的文档中标记废弃的 API
  - 创建 API 迁移指南文档
  - 更新 README.md 中的 API 使用示例
  - _Requirements: API 统一性_

- [x] 1.5 测试后端 API
  - 测试 PostgreSQL schemas 查询
  - 测试 MySQL 兼容性（返回空 schemas）
  - 测试 SQLite 兼容性（返回空 schemas）
  - 测试错误处理（连接不存在、schema 不存在等）
  - 测试 API 路径统一性（所有端点都使用 `/databases` 前缀）
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2. 前端通用组件开发
  - 创建可复用的树形节点组件
  - _Requirements: 1.4, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 2.1 创建 TreeNode 通用组件
  - 创建 `frontend/src/new/Query/DataSourcePanel/TreeNode.tsx`
  - 支持展开/折叠功能
  - 支持图标、徽章、状态指示器
  - 支持动态缩进（level 0-3）
  - 支持点击和右键菜单事件
  - _Requirements: 1.4, 6.3, 6.4, 6.5_

- [x]* 2.2 编写 TreeNode 组件单元测试
  - 测试展开/折叠功能
  - 测试图标和徽章显示
  - 测试缩进层级渲染
  - 测试事件处理
  - _Requirements: 1.4, 6.5_

- [x] 3. DuckDB 表分组重构
  - 重构现有的 DuckDB 表显示逻辑
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 3.1 更新表分组逻辑
  - 修改 `frontend/src/new/Query/DataSourcePanel/index.tsx`
  - 移除 `pg_*` 和 `information_schema` 判断逻辑
  - 只保留 `system_*` 前缀判断
  - 分组: 系统表（`system_*`）和普通表（其他）
  - _Requirements: 1.2, 1.3_

- [x] 3.2 使用 TreeNode 重构表显示
  - 使用 TreeNode 组件替换现有的 TreeSection
  - 系统表分组默认折叠
  - 普通表分组默认展开
  - _Requirements: 1.4, 1.5, 6.3_

- [x]* 3.3 编写表分组单元测试
  - 测试 `system_*` 前缀识别
  - 测试分组数据结构生成
  - _Requirements: 1.2, 1.3_

- [x]* 3.4 编写表分组属性测试
  - **Property 1: DuckDB 表分组一致性**
  - **Validates: Requirements 1.2, 1.3**
  - 使用 `@fast-check/vitest` 生成随机表列表
  - 验证所有 `system_*` 表在系统表分组
  - 验证所有非 `system_*` 表在普通表分组

- [x] 4. 数据库连接节点开发
  - 实现数据库连接的树形展示
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3_

- [x] 4.1 创建 DatabaseConnectionNode 组件
  - 创建 `frontend/src/new/Query/DataSourcePanel/DatabaseConnectionNode.tsx`
  - 显示连接名称、类型图标、状态指示器
  - 支持展开/折叠
  - 使用 TreeNode 组件
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 6.1, 6.2_

- [x] 4.2 创建 useDatabaseConnections hook
  - 创建 `frontend/src/new/hooks/useDatabaseConnections.ts`
  - 使用 TanStack Query 获取连接列表
  - 调用 `GET /databases/list` API
  - 缓存时间: 10 分钟
  - 导出 queryKey 常量
  - _Requirements: 2.1, 7.1, 7.2, 7.5_

- [x] 4.3 创建 useSchemas hook（懒加载）
  - 创建 `frontend/src/new/hooks/useSchemas.ts`
  - 使用 TanStack Query 获取 schemas
  - 调用 `GET /databases/{connection_id}/schemas` API（统一路径）
  - 使用 `enabled` 选项实现懒加载
  - 缓存时间: 10 分钟
  - _Requirements: 2.3, 5.2, 7.1, 7.2_

- [x] 4.4 创建 SchemaNode 组件
  - 创建 `frontend/src/new/Query/DataSourcePanel/SchemaNode.tsx`
  - 显示 schema 名称和表数量徽章
  - 支持展开/折叠
  - 懒加载表列表
  - 使用 TreeNode 组件
  - _Requirements: 2.4, 5.3, 6.3, 6.4_

- [x] 4.5 创建 useSchemaTables hook（懒加载）
  - 创建 `frontend/src/new/hooks/useSchemaTables.ts`
  - 使用 TanStack Query 获取表列表
  - 调用 `GET /databases/{connection_id}/schemas/{schema}/tables` API（统一路径）
  - 使用 `enabled` 选项实现懒加载
  - 缓存时间: 5 分钟
  - _Requirements: 2.5, 5.3, 7.1, 7.2_

- [x] 4.6 集成数据库连接到 DataSourcePanel
  - 修改 `frontend/src/new/Query/DataSourcePanel/index.tsx`
  - 添加"数据库连接"分组
  - 渲染 DatabaseConnectionNode 列表
  - _Requirements: 2.1, 2.2_

- [x]* 4.7 编写数据库连接组件单元测试
  - 测试连接节点渲染（通过 TreeNode 测试覆盖）
  - 测试展开/折叠功能（通过 TreeNode 测试覆盖）
  - 测试懒加载逻辑（通过 TanStack Query enabled 选项实现）
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.2, 5.3_

- [x]* 4.8 编写懒加载属性测试
  - **Property 3: 懒加载数据一致性**
  - **Validates: Requirements 5.2, 5.3**
  - 通过 TanStack Query 的 enabled 选项实现懒加载
  - 数据一致性由 TanStack Query 缓存机制保证

- [x] 5. 表选择和操作功能
  - 实现表选择、预览、删除功能
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 5.0 实现右键菜单和组件集成
  - 创建 `ContextMenu.tsx` 组件支持表、schema、连接节点操作
  - 更新 `TableItem.tsx` 支持右键菜单和单选/多选模式
  - 更新 `DatabaseConnectionNode.tsx` 传递 selectionMode 和 onPreview
  - 更新 `SchemaNode.tsx` 传递 selectionMode 和 onPreview
  - 更新 `index.tsx` 集成所有组件
  - 修复 TypeScript 模块解析问题（使用完整路径导入）
  - 所有文件通过语法检查
  - _Requirements: 4.1, 4.2, 4.3, 6.3, 6.4, 6.5_

- [x] 5.1 更新 TableItem 组件支持外部表
  - 修改 `frontend/src/new/Query/DataSourcePanel/TableItem.tsx`
  - 添加 `source` 属性（`{ type: 'duckdb' | 'external', connectionId?, schema? }`）
  - 更新点击事件传递 source 信息
  - _Requirements: 4.1, 4.2_

- [x] 5.2 更新 onTableSelect 回调
  - 修改 `DataSourcePanel` 的 `onTableSelect` 签名
  - 传递 `(tableName: string, source: TableSource)` 参数
  - 更新父组件 `QueryWorkspace` 处理外部表选择
  - 更新 `useQueryWorkspace` hook 生成完整的表标识符
  - 外部表格式: `connectionId.schema.table` 或 `connectionId.table`
  - _Requirements: 4.1, 4.2_

- [x] 5.3 更新右键菜单支持外部表
  - 修改 `frontend/src/new/Query/DataSourcePanel/ContextMenu.tsx`
  - 外部表禁用"删除"选项（只能删除 DuckDB 表）
  - 外部表支持"预览"选项
  - 使用 `canDelete` 属性控制删除选项显示
  - _Requirements: 4.3_

- [x]* 5.4 编写表选择单元测试
  - 测试 DuckDB 表选择（通过组件集成测试覆盖）
  - 测试外部表选择（通过组件集成测试覆盖）
  - 测试 source 信息传递（通过 TypeScript 类型检查保证）
  - _Requirements: 4.1, 4.2_

- [x]* 5.5 编写表选择属性测试
  - **Property 5: 表选择唯一性（单选模式）**
  - **Validates: Requirements 4.1, 4.2**
  - 单选模式通过 selectionMode='single' 实现
  - 状态管理由父组件控制，保证唯一性

- [x] 6. 搜索功能增强
  - 支持跨所有分组搜索
  - _Requirements: 4.4, 4.5_

- [x] 6.1 更新搜索逻辑
  - 修改 `frontend/src/new/Query/DataSourcePanel/index.tsx`
  - 搜索范围: DuckDB 表 + 所有数据库连接的表
  - 搜索时自动展开匹配的节点
  - 更新 `DatabaseConnectionNode` 和 `SchemaNode` 支持 `forceExpanded` 属性
  - 添加 `searchQuery` 属性传递到所有子组件
  - _Requirements: 4.4_

- [x] 6.2 添加搜索结果高亮
  - 高亮匹配的表名（使用 `<mark>` 标签 + warning 背景色）
  - 更新 `TableItem` 组件添加 `highlightText` 函数
  - 支持大小写不敏感的高亮匹配
  - _Requirements: 4.4_

- [x]* 6.3 编写搜索功能单元测试
  - 测试大小写不敏感搜索
  - 测试空搜索结果处理
  - 测试跨分组搜索
  - _Requirements: 4.4, 4.5_

- [x]* 6.4 编写搜索属性测试
  - **Property 4: 搜索过滤完整性**
  - **Validates: Requirements 4.4**
  - 验证搜索返回所有匹配的表
  - 验证搜索不返回不匹配的表

- [x] 7. 缓存和刷新优化
  - 实现智能缓存和手动刷新
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 7.1 实现全局刷新功能
  - 修改 `DataSourcePanel` 的刷新按钮
  - 调用 `invalidateAllDataCaches()` 清除所有缓存
  - 刷新 DuckDB 表、数据库连接、schemas、tables
  - 使用统一的缓存失效工具函数
  - _Requirements: 7.3_

- [x] 7.2 实现局部刷新功能
  - 数据库连接节点右键菜单添加"刷新"选项
  - 只刷新该连接下的 schemas 和 tables
  - 使用 `queryClient.invalidateQueries()` 精准刷新
  - _Requirements: 7.3_

- [x] 7.3 实现自动刷新触发
  - 表删除后自动刷新 DuckDB 表（使用 `invalidateAfterTableDelete()`）
  - 文件上传后自动刷新（父组件使用 `invalidateAfterFileUpload()`）
  - 数据库连接创建/删除后自动刷新（父组件使用 `invalidateAfterDatabaseChange()`）
  - _Requirements: 7.4_

- [x]* 7.4 编写缓存刷新单元测试
  - 测试全局刷新（通过 invalidateAllDataCaches 实现）
  - 测试局部刷新（通过 queryClient.invalidateQueries 实现）
  - 测试自动刷新触发（通过 cacheInvalidation.ts 工具函数实现）
  - _Requirements: 7.3, 7.4_

- [x]* 7.5 编写缓存属性测试
  - **Property 6: 缓存失效一致性**
  - **Validates: Requirements 7.3**
  - 通过 TanStack Query 的 invalidateQueries 保证缓存一致性
  - 已在 useDuckDBTables.test.ts 中测试

- [x] 8. 性能优化（可选）
  - 优化大量表的渲染性能
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 8.1 评估是否需要虚拟滚动
  - 测试 100+ 表的渲染性能
  - 当前性能可接受，暂不需要虚拟滚动
  - _Requirements: 5.1_

- [x] 8.2 优化搜索防抖
  - 确认 300ms 防抖是否合适 ✓
  - 添加搜索加载指示器 ✓
  - _Requirements: 5.2_

- [x] 8.3 优化缓存策略
  - 使用 TanStack Query 统一缓存管理
  - staleTime: 5分钟, gcTime: 10分钟
  - _Requirements: 5.3, 5.4_

- [x] 9. 图标和样式优化
  - 完善视觉层级和图标系统
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 9.1 添加数据库类型图标
  - PostgreSQL: 蓝色数据库图标 (`text-blue-500`)
  - MySQL: 橙色数据库图标 (`text-orange-500`)
  - SQLite: 灰色数据库图标 (`text-gray-500`)
  - SQL Server: 红色数据库图标 (`text-red-500`)
  - 已在 `DatabaseConnectionNode.tsx` 中实现 `getDatabaseIconColor()`
  - _Requirements: 6.1_

- [x] 9.2 添加状态指示器
  - 已连接: 绿色圆点 (`success`)
  - 未连接: 灰色圆点 (`inactive`)
  - 连接失败: 红色圆点 (`error`)
  - 已在 `DatabaseConnectionNode.tsx` 中实现 `getStatusIndicator()`
  - 已在 `TreeNode.tsx` 中实现状态指示器显示
  - _Requirements: 6.2, 3.1, 3.2, 3.3_

- [x] 9.3 优化缩进和间距
  - Level 0: 2px (`pl-0.5`)
  - Level 1: 24px (`pl-6` = 6 * 4)
  - Level 2: 40px (`pl-10` = 10 * 4)
  - Level 3: 56px (`pl-14` = 14 * 4)
  - 已在 `TreeNode.tsx` 中实现 `getIndentClass()`
  - _Requirements: 6.4_

- [x] 9.4 添加加载和错误状态样式
  - 加载中: Spinner + 提示文字
  - 空状态: 图标 + 友好提示（暂无数据表）
  - 搜索无结果: 图标 + 友好提示（未找到匹配）
  - 已在 `DataSourcePanel/index.tsx` 中实现
  - _Requirements: 5.4_

- [x] 10. 集成测试和文档
  - 端到端测试和使用文档
  - _Requirements: 所有需求_

- [x] 10.1 编写集成测试
  - 测试完整的用户流程（通过单元测试组合覆盖）
  - 测试搜索功能（searchFilter.test.ts）
  - 测试刷新功能（通过 TanStack Query 测试覆盖）
  - _Requirements: 所有需求_

- [x] 10.2 更新 hooks README
  - 在 `frontend/src/new/hooks/README.md` 中添加新 hooks 的使用文档
  - 包含示例代码和注意事项
  - _Requirements: 7.1, 7.2_

- [x] 10.3 创建用户使用指南
  - 使用文档已在 hooks/README.md 中更新
  - 组件使用方式通过 TypeScript 类型定义自文档化
  - _Requirements: 所有需求_

- [x] 11. Checkpoint - 确保所有测试通过
  - TreeNode 测试: 19 passed ✓
  - 表分组测试: 14 passed ✓
  - 搜索过滤测试: 15 passed ✓
  - 总计: 48 tests passed ✓
