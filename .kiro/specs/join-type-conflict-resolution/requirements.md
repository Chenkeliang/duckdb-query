# Requirements Document

## Introduction

本功能为新 UI 的 JoinQueryPanel 添加 JOIN 类型冲突检测和解决方案。当用户在 JOIN 查询中选择类型不兼容的列时，系统应检测冲突并提供 TRY_CAST 类型转换选项，避免 DuckDB 执行时的类型转换错误。

核心原则：
- 类型系统必须与 DuckDB 原生类型保持一致
- 不使用自定义类型分类，直接使用 DuckDB 类型名
- 页面显示的类型名称与 DuckDB 返回的类型名称统一
- TRY_CAST 目标类型仅使用 DuckDB 支持的类型

交互设计目标：
- 非侵入式提示：不打断用户操作流程
- 智能推荐：根据类型组合自动推荐最佳转换类型
- 一键解决：支持批量应用推荐类型
- 实时反馈：类型选择后立即预览生成的 SQL

## Glossary

- **DuckDB 类型**: DuckDB 数据库原生支持的数据类型（如 VARCHAR、BIGINT、TIMESTAMP 等）
- **类型冲突**: JOIN 条件中左右两列的数据类型不兼容，无法直接比较
- **TRY_CAST**: DuckDB 的安全类型转换函数，转换失败时返回 NULL 而非报错
- **类型兼容性**: 两个类型是否可以直接进行比较操作而无需显式转换
- **JoinQueryPanel**: 新 UI 中的 JOIN 查询面板组件

## Requirements

### Requirement 1

**User Story:** As a user, I want the system to detect type conflicts in JOIN conditions, so that I can be aware of potential issues before executing the query.

#### Acceptance Criteria

1. WHEN a user selects JOIN columns with incompatible types THEN the JoinQueryPanel SHALL display a warning indicator on the affected JOIN condition
2. WHEN the system detects type conflicts THEN the JoinQueryPanel SHALL show the original DuckDB type names for both left and right columns
3. WHEN comparing column types THEN the system SHALL use DuckDB native type names without custom categorization
4. WHEN normalizing type names for comparison THEN the system SHALL strip precision/length parameters (e.g., DECIMAL(18,4) → DECIMAL, VARCHAR(255) → VARCHAR)

### Requirement 2

**User Story:** As a user, I want to resolve type conflicts by selecting a unified target type, so that I can execute JOIN queries without type conversion errors.

#### Acceptance Criteria

1. WHEN a user clicks on a type conflict warning THEN the system SHALL display a type conflict resolution dialog
2. WHEN displaying the dialog THEN the system SHALL show a table with columns: JOIN condition, left type, right type, and target type selector
3. WHEN providing target type options THEN the system SHALL only offer DuckDB native types (VARCHAR, BIGINT, DOUBLE, DECIMAL(18,4), TIMESTAMP, DATE, BOOLEAN)
4. WHEN a user selects a target type THEN the system SHALL store the resolution for the specific JOIN condition
5. WHEN a user confirms the resolution THEN the dialog SHALL close and the warning indicator SHALL update to show resolved status

### Requirement 3

**User Story:** As a user, I want the system to apply TRY_CAST to resolved type conflicts in the generated SQL, so that the query executes without type errors.

#### Acceptance Criteria

1. WHEN generating SQL for a JOIN with resolved type conflicts THEN the system SHALL wrap both columns in TRY_CAST with the selected target type
2. WHEN applying TRY_CAST THEN the generated SQL SHALL follow the format: TRY_CAST(column AS target_type)
3. WHEN a JOIN condition has no type conflict or is already resolved THEN the system SHALL generate the condition without TRY_CAST
4. WHEN serializing the SQL THEN the system SHALL use the exact DuckDB type name selected by the user

### Requirement 4

**User Story:** As a user, I want the system to prevent query execution when there are unresolved type conflicts, so that I don't encounter runtime errors.

#### Acceptance Criteria

1. WHEN a user attempts to execute a query with unresolved type conflicts THEN the system SHALL block execution and display the type conflict dialog
2. WHEN all type conflicts are resolved THEN the system SHALL allow query execution
3. WHEN the user cancels the type conflict dialog THEN the system SHALL not execute the query
4. WHEN the user resolves conflicts and confirms THEN the system SHALL proceed with query execution

### Requirement 5

**User Story:** As a user, I want the type conflict state to persist during my session, so that I don't have to re-resolve the same conflicts repeatedly.

#### Acceptance Criteria

1. WHEN a user resolves a type conflict THEN the resolution SHALL persist until the JOIN condition is modified
2. WHEN a user changes the JOIN column selection THEN the system SHALL re-evaluate type compatibility and clear outdated resolutions
3. WHEN a user removes a table from the JOIN THEN the system SHALL clear all resolutions related to that table
4. WHEN the component unmounts THEN the system SHALL clear all type conflict state

### Requirement 6

**User Story:** As a user, I want the type conflict dialog to use shadcn/ui components, so that it matches the new UI design system.

#### Acceptance Criteria

1. WHEN rendering the type conflict dialog THEN the system SHALL use shadcn/ui Dialog component
2. WHEN rendering the conflict table THEN the system SHALL use shadcn/ui Table components
3. WHEN rendering the type selector THEN the system SHALL use shadcn/ui Select component with Combobox functionality for custom input
4. WHEN styling the dialog THEN the system SHALL use Tailwind CSS classes consistent with the new UI design
5. WHEN displaying icons THEN the system SHALL use lucide-react icons (AlertTriangle for warnings)

### Requirement 7

**User Story:** As a user, I want inline type conflict indicators on JOIN connectors, so that I can see conflicts at a glance without opening a dialog.

#### Acceptance Criteria

1. WHEN a JOIN condition has a type conflict THEN the JoinConnector component SHALL display a warning badge with AlertTriangle icon
2. WHEN hovering over the warning badge THEN the system SHALL show a tooltip with conflict details (left type vs right type)
3. WHEN clicking the warning badge THEN the system SHALL open the type conflict dialog focused on that specific conflict
4. WHEN a conflict is resolved THEN the warning badge SHALL change to a success indicator (CheckCircle icon)
5. WHEN all conflicts in a JOIN are resolved THEN the JoinConnector SHALL display normally without warning indicators

### Requirement 8

**User Story:** As a user, I want smart type recommendations based on the column types, so that I can quickly resolve conflicts with optimal choices.

#### Acceptance Criteria

1. WHEN detecting a conflict between numeric and string types THEN the system SHALL recommend VARCHAR as the primary option
2. WHEN detecting a conflict between different numeric types THEN the system SHALL recommend the larger numeric type (e.g., BIGINT over INTEGER)
3. WHEN detecting a conflict between date/time types THEN the system SHALL recommend TIMESTAMP as the primary option
4. WHEN displaying recommendations THEN the system SHALL highlight the recommended option in the type selector
5. WHEN the user has not made a selection THEN the system SHALL pre-select the recommended type

### Requirement 9

**User Story:** As a user, I want to apply all recommended types with one click, so that I can quickly resolve multiple conflicts.

#### Acceptance Criteria

1. WHEN the dialog shows multiple conflicts THEN the system SHALL display an "Apply All Recommendations" button
2. WHEN the user clicks "Apply All Recommendations" THEN the system SHALL set all conflicts to their recommended types
3. WHEN applying recommendations THEN the system SHALL provide visual feedback showing which types were applied
4. WHEN all conflicts are resolved THEN the "Apply" button SHALL become enabled

### Requirement 10

**User Story:** As a user, I want to preview the generated SQL with TRY_CAST applied, so that I can verify the query before execution.

#### Acceptance Criteria

1. WHEN the type conflict dialog is open THEN the system SHALL display a SQL preview section at the bottom
2. WHEN the user changes type selections THEN the SQL preview SHALL update in real-time
3. WHEN displaying the SQL preview THEN the system SHALL highlight the TRY_CAST expressions
4. WHEN the SQL is too long THEN the preview SHALL be scrollable with a maximum height

### Requirement 11

**User Story:** As a user, I want clear visual distinction between resolved and unresolved conflicts, so that I can track my progress.

#### Acceptance Criteria

1. WHEN a conflict is unresolved THEN the row SHALL have a warning background color (amber/yellow tint)
2. WHEN a conflict is resolved THEN the row SHALL have a success background color (green tint)
3. WHEN all conflicts are resolved THEN the dialog header SHALL show a success message
4. WHEN there are unresolved conflicts THEN the dialog header SHALL show the count of remaining conflicts
