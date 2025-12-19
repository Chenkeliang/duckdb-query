# Implementation Plan

- [x] 1. 创建 DuckDB 类型工具模块
  - [x] 1.1 创建 `frontend/src/new/utils/duckdbTypes.ts`
    - 定义 `DUCKDB_CAST_TYPES` 常量数组
    - 定义类型家族常量（INTEGER_TYPES, FLOAT_TYPES, STRING_TYPES, DATETIME_TYPES, COMPLEX_TYPES）
    - 实现 `normalizeTypeName()` 函数
    - 实现 `areTypesCompatible()` 函数（包含复杂类型和 DECIMAL 处理）
    - 实现 `getRecommendedCastType()` 函数
    - 实现 `generateConflictKey()` 函数（基于内容生成稳定 key）
    - _Requirements: 1.3, 1.4, 8.1, 8.2, 8.3_

  - [x] 1.2 编写 duckdbTypes 属性测试
    - **Property 1: Type normalization strips precision/length parameters**
    - **Validates: Requirements 1.4**

  - [x] 1.3 编写 duckdbTypes 属性测试
    - **Property 2: Compatible types do not trigger conflicts**
    - **Validates: Requirements 1.1, 1.3**

  - [x] 1.4 编写 duckdbTypes 属性测试
    - **Property 7: Recommended type follows type combination rules**
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 2. 创建类型冲突检测 Hook
  - [x] 2.1 创建 `frontend/src/new/hooks/useTypeConflict.ts`
    - 定义 `ColumnPair` 接口
    - 定义 `TypeConflict` 接口
    - 定义 `UseTypeConflictReturn` 接口
    - 实现 `useTypeConflict` Hook
    - 使用 `useMemo` 计算冲突列表
    - 使用 `useState` 管理解决方案状态
    - 实现 `resolveConflict`, `resolveAllWithRecommendations`, `clearResolutions` 方法
    - 使用基于内容的 key（`generateConflictKey`）而非索引
    - 跳过同列 JOIN（同表同列名）
    - _Requirements: 1.1, 1.2, 2.4, 5.1, 5.2, 5.3_

  - [x] 2.2 编写 useTypeConflict 属性测试
    - **Property 3: Incompatible types trigger conflicts with correct type names**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 2.3 编写 useTypeConflict 属性测试
    - **Property 6: Resolution state persists until condition changes**
    - **Validates: Requirements 5.1, 5.2**

  - [x] 2.4 编写 useTypeConflict 属性测试
    - **Property 8: Apply all recommendations sets all conflicts to recommended types**
    - **Validates: Requirements 9.2**

- [x] 3. Checkpoint - 确保所有测试通过
  - All 69 tests pass for duckdbTypes and useTypeConflict.

- [x] 4. 创建类型冲突指示器组件
  - [x] 4.1 创建 `frontend/src/new/Query/components/TypeConflictIndicator.tsx`
    - 使用 shadcn/ui Tooltip 组件
    - 使用 lucide-react AlertTriangle 和 CheckCircle 图标
    - 实现无冲突、未解决、已解决三种状态
    - 支持点击回调
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 4.2 编写 TypeConflictIndicator 属性测试
    - **Property 9: Conflict badge state reflects resolution status**
    - **Validates: Requirements 7.4, 7.5, 11.1, 11.2**

- [x] 5. 创建类型冲突对话框组件
  - [x] 5.1 创建 `frontend/src/new/Query/components/TypeConflictDialog.tsx`
    - 使用 shadcn/ui Dialog, Table, Select, Button, Alert 组件
    - 实现冲突列表表格
    - 实现类型选择器（支持推荐标签）
    - 实现"应用所有推荐"按钮
    - 实现 SQL 预览区域
    - 实现确认/取消按钮
    - 添加 TRY_CAST NULL 值警告提示
    - 实现快捷键支持（Enter 确认, Escape 取消, Ctrl+A 应用所有推荐）
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 6.1, 6.2, 6.3, 6.4, 6.5, 9.1, 9.3, 10.1, 10.2, 10.3_

  - [x] 5.2 编写 TypeConflictDialog 属性测试
    - **Property 10: Dialog header shows correct conflict count**
    - **Validates: Requirements 11.3, 11.4**

- [x] 6. 集成到 JoinQueryPanel
  - [x] 6.1 更新 `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx`
    - 导入并使用 `useTypeConflict` Hook
    - 构建 `columnPairs` 数组传递给 Hook
    - 在 SQL 预览区域添加类型冲突指示器 Badge
    - 添加 TypeConflictDialog 组件
    - 更新执行逻辑：有未解决冲突时打开对话框
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 6.2 编写 JoinQueryPanel 集成测试
    - **Property 5: Unresolved conflicts block execution**
    - **Validates: Requirements 4.1, 4.2**

- [x] 7. 实现 SQL TRY_CAST 生成
  - [x] 7.1 更新 JoinQueryPanel 的 `generateSQL` 函数
    - 根据 `resolvedTypes` 映射生成 TRY_CAST 表达式
    - 格式：`TRY_CAST(table.column AS type) = TRY_CAST(table.column AS type)`
    - 未解决的冲突保持原样
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 7.2 编写 SQL 生成属性测试
    - **Property 4: Resolved conflicts generate TRY_CAST in SQL**
    - **Validates: Requirements 3.1, 3.2, 3.4**

- [x] 8. 添加国际化支持
  - [x] 8.1 更新 `frontend/src/i18n/locales/zh/common.json`
    - 添加类型冲突相关的中文翻译
    - _Requirements: 6.4_

  - [x] 8.2 更新 `frontend/src/i18n/locales/en/common.json`
    - 添加类型冲突相关的英文翻译
    - _Requirements: 6.4_

- [x] 9. Final Checkpoint - 确保所有测试通过
  - All 522 tests in src/new/ pass.
  - Type conflict specific tests: 125 tests pass.
