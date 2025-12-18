# Implementation Plan

## Phase 0: 基础设施验证 (已完成 ✅)

- [x] 0.1 后端 API 验证
  - 已确认 `/api/save_query_to_duckdb` 支持 MySQL 和 DuckDB 内部查询
  - 已确认 `/api/execute_sql` 支持外部数据库查询
  - _Requirements: 4.3, 3.3_

## Phase 1: 核心功能实现

- [x] 1. SelectedTable 数据结构升级
  - [x] 1.1 定义新的 SelectedTable 接口和类型
    - 创建 `frontend/src/new/types/SelectedTable.ts` 类型定义文件
    - 定义 `SelectedTableObject` 接口支持 `{ name, source, connection, schema }` 格式
    - 导出 `SelectedTable` 联合类型支持 string 和 object 两种格式
    - _Requirements: 2.1, 2.2_
  - [x] 1.2 创建兼容性工具函数
    - 创建 `frontend/src/new/utils/tableUtils.ts` 工具函数文件
    - 实现 `normalizeSelectedTable()` - 统一处理新旧格式
    - 实现 `getTableName()` - 提取表名
    - 实现 `isExternalTable()` - 判断是否为外部表
    - _Requirements: 2.3, 2.4_
  - [ ]* 1.3 Write property tests for SelectedTable utilities
    - **Property 1: SelectedTable Normalization Consistency**
    - **Property 2: External Table Detection Accuracy**
    - **Property 3: Table Name Extraction Consistency**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

- [x] 2. DataSourcePanel 外部表选择增强
  - [x] 2.1 修改表点击处理逻辑
    - 在 `DataSourcePanel` 中区分 DuckDB 表和外部表
    - 点击外部表时创建 `SelectedTableObject` 包含连接信息
    - _Requirements: 1.2_
  - [x] 2.2 添加外部表视觉标识
    - MySQL 使用 🐬 图标, PostgreSQL 使用 🐘 图标, SQLite 使用 📄 图标
    - 外部表使用不同的背景色或边框样式区分
    - _Requirements: 1.1, 1.3_
  - [ ]* 2.3 Write unit tests for DataSourcePanel external table handling
    - 测试外部表点击创建正确的 SelectedTableObject
    - 测试视觉标识正确显示
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. SQL Query Panel 外部查询支持
  - [x] 3.1 修改 SQL 生成逻辑
    - 检测选中的外部表并生成适合外部数据库的预览 SQL
    - 混合查询时显示警告提示用户
    - _Requirements: 3.1, 5.4_
  - [x] 3.2 实现外部查询执行
    - 调用 `/api/execute_sql` 时传递 `connection_id` 和 `datasource` 信息
    - 处理外部数据库的查询结果并正确显示
    - _Requirements: 3.2, 3.3_
  - [x] 3.3 添加查询来源指示
    - 在 SQL 编辑器中显示目标数据库信息（如 "MySQL: production_db"）
    - _Requirements: 3.2_
  - [ ]* 3.4 Write property test for cross-database query prevention
    - **Property 5: Cross-Database Query Prevention**
    - **Validates: Requirements 5.4, 6.3, 7.4**

- [x] 4. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Result Panel 导入功能
  - [x] 5.1 检测外部查询结果
    - 根据查询来源在结果面板显示"导入到 DuckDB"按钮
    - 仅当查询来源为外部数据库时显示导入按钮
    - _Requirements: 4.1_
  - [x] 5.2 创建导入对话框组件
    - 创建 `ImportToDuckDBDialog.tsx` 组件
    - 实现表名输入和验证（只允许字母、数字、下划线）
    - 显示导入进度和错误处理
    - _Requirements: 4.2_
  - [x] 5.3 实现导入功能
    - 调用 `/api/save_query_to_duckdb` API 执行导入
    - 导入成功后刷新 DuckDB 表列表
    - 处理导入失败的错误提示和重试选项
    - _Requirements: 4.3, 4.4, 4.5_
  - [ ]* 5.4 Write property test for import data integrity
    - **Property 4: Import Operation Data Integrity**
    - **Validates: Requirements 4.3, 4.4**

- [x] 6. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 2: 查询构建器适配

- [x] 7. Visual Query Builder 外部表支持
  - [x] 7.1 修改 TableSelector 组件
    - 显示外部表时添加数据库类型标识图标
    - 支持选择外部表到查询构建器
    - _Requirements: 5.1_
  - [x] 7.2 更新 QueryBuilder SQL 生成
    - 根据表来源生成适当的 SQL 语法
    - 处理外部表的模式名（PostgreSQL schema）
    - _Requirements: 5.2_
  - [x] 7.3 添加跨数据库查询警告
    - 检测混合查询并显示警告对话框
    - 建议用户先导入外部表到 DuckDB
    - _Requirements: 5.3, 5.4_
  - [ ]* 7.4 Write unit tests for Visual Query Builder external table handling
    - 测试外部表显示正确的标识
    - 测试 SQL 生成逻辑
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 8. Join Query 外部表支持
  - [x] 8.1 修改 JoinQueryPanel 验证逻辑
    - 验证 Join 表是否来自同一数据库连接
    - 显示跨数据库 Join 的警告并建议导入
    - _Requirements: 6.3_
  - [x] 8.2 更新 Join SQL 生成
    - 根据表来源生成正确的 Join SQL 语法
    - 处理外部表的完整表名（包含 schema）
    - _Requirements: 6.2, 6.4_
  - [x] 8.3 添加外部表来源指示
    - 在 Join 构建器中显示表的数据库来源标识
    - _Requirements: 6.1_
  - [ ]* 8.4 Write unit tests for Join Query external table handling
    - 测试同数据库 Join 验证通过
    - 测试跨数据库 Join 显示警告
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 9. Set Operations 外部表支持
  - [x] 9.1 实现列兼容性验证
    - 检查外部表的列结构
    - 验证 UNION/INTERSECT/EXCEPT 的列匹配
    - _Requirements: 7.1_
  - [x] 9.2 添加列映射建议
    - 当列不匹配时提供映射建议
    - _Requirements: 7.2_
  - [x] 9.3 实现外部 Set 操作执行
    - 生成并执行外部数据库的 Set 操作 SQL
    - _Requirements: 7.3_
  - [ ]* 9.4 Write unit tests for Set Operations external table handling
    - 测试列兼容性验证
    - 测试 Set 操作 SQL 生成
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 10. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: 高级功能

- [x] 11. Pivot Table 外部数据支持
  - [x] 11.1 实现外部表列信息获取
    - 查询外部数据库的表结构获取列信息
    - 缓存列信息以提高性能
    - _Requirements: 8.1_
  - [x] 11.2 添加列类型验证
    - 验证 Pivot 维度的数据类型
    - 建议合适的聚合函数
    - _Requirements: 8.2_
  - [x] 11.3 实现外部 Pivot 查询
    - 生成外部数据库的 Pivot SQL
    - 处理大结果集的导入选项
    - _Requirements: 8.3, 8.4_
  - [ ]* 11.4 Write unit tests for Pivot Table external data handling
    - 测试列信息获取
    - 测试 Pivot SQL 生成
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 12. 性能优化
  - [x] 12.1 实现连接池管理
    - 复用外部数据库连接
    - 连接超时和清理机制
    - _Requirements: 10.1_
  - [x] 12.2 添加查询优化
    - 自动添加 LIMIT 子句到预览查询
    - 大结果集分页加载
    - _Requirements: 10.2_
  - [x] 12.3 实现进度指示和取消
    - 长时间查询的进度显示
    - 查询取消功能
    - _Requirements: 10.3, 10.4_

## Phase 4: 错误处理和用户体验

- [x] 13. 错误处理增强
  - [x] 13.1 实现连接错误诊断
    - 具体的数据库连接错误信息
    - 连接测试和诊断工具
    - _Requirements: 9.1_
  - [x] 13.2 添加查询错误处理
    - 区分语法错误和执行错误
    - 数据库特定的错误信息
    - _Requirements: 9.2, 9.3_
  - [x] 13.3 实现导入错误处理
    - 表名冲突检测和处理
    - 数据类型转换错误提示
    - _Requirements: 9.4_

- [x] 14. 国际化支持
  - [x] 14.1 添加 i18n 键值
    - 外部数据库相关的所有文本
    - 错误消息和提示文本
    - _Requirements: 11.1, 11.2_
  - [x] 14.2 更新语言文件
    - 中文和英文翻译
    - 数据库类型术语统一
    - _Requirements: 11.3, 11.4_

- [x] 15. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## 修改的文件清单

### Phase 1 核心功能
1. `frontend/src/new/types/SelectedTable.ts` - 新建类型定义
2. `frontend/src/new/utils/tableUtils.ts` - 新建工具函数
3. `frontend/src/new/Query/DataSourcePanel/DataSourcePanel.tsx` - 外部表选择
4. `frontend/src/new/Query/SQLQuery/SQLQueryPanel.tsx` - 外部查询支持
5. `frontend/src/new/Query/ResultPanel/ResultPanel.tsx` - 导入功能
6. `frontend/src/new/Query/ResultPanel/ImportToDuckDBDialog.tsx` - 新建导入对话框
7. `frontend/src/services/apiClient.js` - 外部查询 API

### Phase 2 查询构建器
8. `frontend/src/new/Query/VisualQuery/TableSelector.tsx` - 外部表显示
9. `frontend/src/new/Query/VisualQuery/QueryBuilder.tsx` - SQL 生成适配
10. `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx` - Join 验证
11. `frontend/src/new/Query/SetOperations/SetOperationsPanel.tsx` - Set 操作支持

### Phase 3 高级功能
12. `frontend/src/new/Query/PivotTable/PivotTablePanel.tsx` - Pivot 支持

### Phase 4 用户体验
13. `frontend/src/i18n/locales/zh/common.json` - 中文翻译
14. `frontend/src/i18n/locales/en/common.json` - 英文翻译

## 验收标准

### Phase 1 完成标准
- ✅ 用户可以在数据源面板中看到外部数据库表
- ✅ 用户可以选择外部表并在 SQL 面板中查询
- ✅ 用户可以将外部查询结果导入到 DuckDB
- ✅ 所有操作都有适当的错误处理和用户反馈

### 最终完成标准
- ✅ 支持所有查询类型（SQL、Visual、Join、Set、Pivot）
- ✅ 性能优化到位，大数据集处理流畅
- ✅ 完整的错误处理和用户指导
- ✅ 国际化支持完善
- ✅ 通过所有测试用例
