# Implementation Plan

## 技术方案调研结论

### SQL 解析方案选择：简化 Tokenizer + 状态机

**调研的方案**：

| 方案             | 包大小   | 适用性                   | 结论          |
| ---------------- | -------- | ------------------------ | ------------- |
| 正则表达式       | 0        | 边界情况多，难维护       | ❌ 已验证不可行 |
| node-sql-parser  | ~500KB   | 功能过度，包太大         | ❌ 不推荐       |
| 手写 Tokenizer   | ~3KB     | 可控、够用               | ✅ 推荐         |

**选择理由**：

1. 零依赖，不增加包大小
2. 代码量小（~150 行），易于维护
3. 逻辑清晰，完美处理边界情况（注释、字符串、引号、函数调用）
4. 符合项目"组件选择原则"：不引入过度依赖

**实现思路**：

```typescript
// 1. Tokenizer：逐字符扫描，跳过注释/字符串，生成 token 流
// 2. 状态机：遇到 FROM/JOIN → 期待表名 → 检查是否函数调用
```

---

## Tasks

- [x] 1. Create SQL Table Parser (使用 Tokenizer 方案) ✅ 已完成
  - [x] 1.1 Implement SQL Tokenizer in `frontend/src/new/utils/sqlTokenizer.ts` ✅
    - Tokenize SQL string into token stream
    - Skip single-line comments (`--`)
    - Skip multi-line comments
    - Skip string literals (`'...'`)
    - Handle quoted identifiers (`"..."`, `` `...` ``, `[...]`)
    - Identify keywords (FROM, JOIN, AS, WITH, ON, WHERE, etc.)
    - Identify identifiers and dots
    - Identify parentheses (for function call detection)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x] 1.2 Rewrite `parseSQLTableReferences` using Tokenizer in `frontend/src/new/utils/sqlUtils.ts` ✅
    - Use state machine to extract table references
    - Handle FROM clause table references
    - Handle JOIN clause table references
    - Handle table aliases (AS keyword)
    - Exclude CTE names (WITH clause)
    - Exclude function calls (identifier followed by `(`)
    - _Requirements: 1.1, 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x] 1.3 Write unit tests for Tokenizer ✅ (已有测试覆盖)
    - Test comment skipping (single-line and multi-line)
    - Test string literal skipping
    - Test quoted identifier handling (double quotes, backticks, brackets)
    - Test keyword identification
  - [x] 1.4 Write property tests for SQL parser ✅ (41 tests all passing)
    - **Property 1: SQL Parser Extracts All Table References**
    - **Property 8: Quoted Identifier Parsing**
    - **Property 9: Table Alias Handling**
    - **Property 10: CTE Exclusion**
    - **Property 11: Function Call Exclusion**
    - **Validates: Requirements 1.1, 4.1, 4.2, 4.4, 4.5, 13.2, 13.3, 13.4, 13.5**

- [x] 2. Create Prefix Matcher ✅ 已完成（函数已存在）
  - [x] 2.1 Implement `matchPrefixToConnection` function in `frontend/src/new/utils/sqlUtils.ts` ✅
    - Match prefix against connection name
    - Match prefix against generated alias
    - Handle multiple matches (use first, log warning)
    - _Requirements: 1.2, 1.3, 13.1_
  - [x] 2.2 Write property test for prefix matcher ✅ (7 tests passing)
    - **Property 2: Prefix Matching Returns Correct Connection**
    - **Validates: Requirements 1.2, 1.3**

- [x] 3. Create AttachDatabases Merger ✅ 已完成（函数已存在）
  - [x] 3.1 Implement `mergeAttachDatabases` function in `frontend/src/new/utils/sqlUtils.ts` ✅
    - Merge from selectedTables and SQL parsing
    - Deduplicate by connectionId
    - Prioritize selectedTables over SQL parsing
    - Support manual additions
    - Return unrecognized prefixes
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 3.2 Write property tests for merger ✅ (6 tests passing)
    - **Property 3: AttachDatabases Merge Deduplicates**
    - **Property 4: SelectedTables Priority Over SQL Parsing**
    - **Validates: Requirements 2.2, 2.3**

- [x] 4. Checkpoint - Ensure all tests pass ✅
  - All 41 tests passing in sqlParser.test.ts

- [x] 5. Create Federated Query Detection Hook ✅ 已完成
  - [x] 5.1 Implement `useFederatedQueryDetection` hook in `frontend/src/new/hooks/useFederatedQueryDetection.ts` ✅
    - Combine SQL parsing and selectedTables
    - Use debounced SQL parsing (300ms)
    - Build TableSource based on detection results
    - Provide manual add/remove functions
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 5.2 Write unit tests for the hook ✅ (16 tests all passing)
    - Test with DuckDB-only SQL
    - Test with external table SQL
    - Test with mixed sources
    - Test manual override
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 6. Create UI Components ✅ 已完成
  - [x] 6.1 Enhance `AttachedDatabasesIndicator` component ✅
    - Add expandable panel for managing databases
    - Show connection details on hover
    - Add manual add/remove functionality
    - Added new `expandable` variant with Popover
    - _Requirements: 3.1, 3.2, 3.3, 9.1, 9.2_
  - [x] 6.2 Create `UnrecognizedPrefixWarning` component in `frontend/src/new/Query/components/` ✅
    - Display list of unrecognized prefixes
    - Provide "Configure Connection" action for each
    - Provide "Ignore and Execute" action
    - _Requirements: 5.1, 6.1, 6.2, 6.4, 6.5_
  - [x] 6.3 Create `FederatedQueryStatusBar` component ✅
    - Show query type (DuckDB / External / Federated)
    - Show connected databases
    - Show execution status and time
    - _Requirements: 3.1_
  - [x] 6.4 Write unit tests for UI components ✅ (17 tests all passing)
    - Test indicator visibility
    - Test warning display
    - Test action callbacks
    - _Requirements: 3.1, 3.2, 3.3, 5.1_

- [x] 7. Checkpoint - Ensure all tests pass ✅
  - All tests passing (useFederatedQueryDetection: 16 tests, UI components: 17 tests)

- [x] 8. Update SQLQueryPanel for Federated Query Support ✅ 已完成
  - [x] 8.1 Integrate `useFederatedQueryDetection` hook ✅
    - Replace mixed source warning with federated query detection
    - Build TableSource from detection results
    - _Requirements: 10.2, 14.2_
  - [x] 8.2 Update query execution logic ✅
    - Use federated API when attachDatabases is non-empty
    - Handle unrecognized prefix confirmation
    - _Requirements: 1.4, 1.5, 10.5, 11.5_
  - [x] 8.3 Add UI components to SQLQueryPanel ✅
    - Add AttachedDatabasesIndicator to toolbar (expandable variant)
    - Add UnrecognizedPrefixWarning above editor
    - Add FederatedQueryStatusBar below toolbar
    - _Requirements: 3.1, 5.1_
  - [x] 8.4 Write property tests for API selection ✅ (20 tests passing)
    - **Property 5: Federated Query API Selection**
    - **Property 6: Standard Query API for DuckDB-Only**
    - File: `frontend/src/new/Query/SQLQuery/__tests__/federatedQueryExecution.test.ts`
    - **Validates: Requirements 1.4, 1.5, 10.2, 10.5**
  - [x] 8.5 Write property test for backward compatibility ✅
    - **Property 12: Backward Compatibility**
    - Tests legacy queries (simple SELECT, JOIN, aggregate, subquery, UNION, window functions)
    - Property-based test for any DuckDB-only query pattern
    - **Validates: Requirements 14.1**

- [x] 9. Enhance SQL Editor Autocomplete ✅ 已完成
  - [x] 9.1 Create `useEnhancedAutocomplete` hook ✅
    - Fetch DuckDB tables via `useDuckDBTables`
    - Fetch external tables from all connections via `useDataSources` and `useDatabaseConnections`
    - Build grouped autocomplete schema with qualified names (e.g., `mysql_prod.users`)
    - Support prefix filtering via `getTablesForPrefix`
    - File: `frontend/src/new/hooks/useEnhancedAutocomplete.ts`
    - _Requirements: 12.1, 12.2_
  - [x] 9.2 Update SQLQueryPanel to use enhanced autocomplete ✅
    - Integrated `useEnhancedAutocomplete` hook
    - In federated query mode, shows all tables including external tables with qualified names
    - External tables displayed with full prefix (e.g., `mysql_prod.users`)
    - _Requirements: 12.3, 12.4, 12.5_
  - [x] 9.3 Write unit tests for autocomplete ✅ (8 tests passing)
    - Test DuckDB table suggestions
    - Test external table suggestions with qualified names
    - Test prefix filtering
    - Test loading state
    - File: `frontend/src/new/hooks/__tests__/useEnhancedAutocomplete.test.ts`
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 10. Checkpoint - Ensure all tests pass ✅
  - All 624+ tests in `src/new/` directory passing
  - New tests added:
    - `useEnhancedAutocomplete.test.ts`: 8 tests
    - `federatedQueryExecution.test.ts`: 20 tests
    - `panelFederatedIntegration.test.ts`: 15 tests
  - Build successful

- [x] 11. Update Other Query Panels ✅ 已完成（部分）
  - [x] 11.1 PivotTablePanel - 保持现状 ✅
    - 透视表面板不需要 SQL 解析，因为它使用表选择器
    - 外部表已显示警告提示用户先导入到 DuckDB
    - _Requirements: 8.1 - N/A for this panel_
  - [x] 11.2 SetOperationsPanel - 保持现状 ✅
    - 集合操作面板不需要 SQL 解析，因为它使用表选择器
    - 外部表已显示警告提示用户先导入到 DuckDB
    - _Requirements: 8.2 - N/A for this panel_
  - [x] 11.3 Verify JoinQueryPanel already uses federated query correctly ✅
    - JoinQueryPanel 已经有完整的联邦查询支持
    - 使用 `extractAttachDatabases` 提取外部数据库
    - 使用 `AttachedDatabasesIndicator` 显示连接状态
    - 支持跨数据库 JOIN 查询
    - _Requirements: 8.3 - Already implemented_
  - [x] 11.4 Write integration tests for all panels ✅ (15 tests passing)
    - SQLQueryPanel: Full federated query support with SQL parsing
    - JoinQueryPanel: Federated JOIN support via extractAttachDatabases
    - PivotTablePanel: External table warning detection
    - SetOperationsPanel: External table warning detection
    - Cross-panel consistency tests
    - File: `frontend/src/new/Query/__tests__/panelFederatedIntegration.test.ts`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 12. Add i18n Translations ✅ 已完成
  - [x] 12.1 Add Chinese translations ✅
    - Added keys for all new UI text in `frontend/src/i18n/locales/zh/common.json`
    - _Requirements: All UI requirements_
  - [x] 12.2 Add English translations ✅
    - Added keys for all new UI text in `frontend/src/i18n/locales/en/common.json`
    - _Requirements: All UI requirements_

- [x] 13. Final Checkpoint - Ensure all tests pass ✅
  - All 639 tests in `src/new/` directory passing
  - Build successful
  - i18n translations complete (Chinese and English)
  - SQLQueryPanel integrated with federated query detection
  - JoinQueryPanel already has federated query support
  - PivotTablePanel and SetOperationsPanel show appropriate warnings for external tables
  - Enhanced autocomplete with external table support
  - Property tests for API selection and backward compatibility
  - Integration tests for all panels

## Bug Fixes

- [x] 14. Bug Fixes ✅
  - [x] 14.1 Fixed React ref warning for Badge components ✅
    - Badge components wrapped in `<span>` or changed to `<button>` for Tooltip/Popover triggers
    - Files: `FederatedQueryStatusBar.tsx`, `AttachedDatabasesIndicator.tsx`
  - [x] 14.2 Fixed TypeConflictDialog Select not working ✅
    - Added `position="popper"` and `className="z-[100]"` to SelectContent
    - File: `TypeConflictDialog.tsx`
  - [x] 14.3 Fixed SQL preview font color ✅
    - Changed `bg-muted/30` to `bg-muted` and added `text-foreground`
    - File: `FederatedQueryStatusBar.tsx`
  - [x] 14.4 Fixed federated query execution ✅
    - Changed `type: 'external'` to `type: 'federated'` in SQLQueryPanel's executeSource
    - File: `SQLQueryPanel.tsx`
  - [x] 14.5 Fixed Tooltip not showing for "X个连接" ✅
    - Changed `<span>` to `<button>` element
    - File: `FederatedQueryStatusBar.tsx`
  - [x] 14.6 Fixed SQL formatting incorrectly formatting keywords inside comments ✅
    - Rewrote `formatSQL` function in `useSQLEditor.ts` to use smart tokenization
    - New function `formatSQLSmart` properly skips comments and string literals
    - Added 18 unit tests for the new formatting logic
    - File: `frontend/src/new/Query/SQLQuery/hooks/useSQLEditor.ts`
    - Test file: `frontend/src/new/Query/SQLQuery/hooks/__tests__/formatSQLSmart.test.ts`
  - [x] 14.7 Added SQL syntax highlighting to preview sections ✅
    - Created `SQLHighlight` component using CodeMirror 6 in read-only mode
    - Applied to JoinQueryPanel, PivotTablePanel, and SetOperationsPanel SQL previews
    - Provides consistent syntax highlighting across all SQL preview areas
    - Matched theme configuration with SQL editor (font, size, colors)
    - File: `frontend/src/new/components/SQLHighlight.tsx`
  - [x] 14.8 Fixed AG Grid boolean cell renderer showing HTML tags ✅
    - Changed `booleanRenderer` to return DOM element instead of HTML string
    - Prevents AG Grid from escaping HTML and showing raw tags
    - Boolean values now correctly display as checkmark/cross icons
    - File: `frontend/src/new/Query/ResultPanel/hooks/useAGGridConfig.ts`
