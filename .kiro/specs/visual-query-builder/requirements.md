# Requirements Document

## Introduction

This feature aims to provide a visual, no-code query builder interface for Duck Query platform that allows non-technical users to analyze single table data without writing SQL. The visual query builder will enable users to construct data analysis queries through an intuitive interface with various aggregation, filtering, and transformation options, making data analysis accessible to business users and analysts who may not have SQL expertise.

## Requirements

### Requirement 1

**User Story:** As a business analyst without SQL knowledge, I want to select and analyze single table data using visual controls, so that I can perform data analysis independently without writing SQL.

#### Acceptance Criteria

1. WHEN a user selects a single data table THEN the system SHALL display all available columns with their data types
2. WHEN a user selects no analysis options THEN clicking "Query" SHALL execute a full table query (SELECT * FROM table)
3. WHEN a user selects analysis options THEN the system SHALL generate and display the corresponding SQL query in real-time
4. WHEN a user clicks "Execute Query" THEN the system SHALL run the generated SQL and display results
5. WHEN no analysis options are selected THEN the system SHALL default to the current full table query behavior

### Requirement 2

**User Story:** As a data consumer, I want to apply various aggregation and analysis functions to my data, so that I can create meaningful insights and summaries.

#### Acceptance Criteria

1. WHEN a user wants to aggregate data THEN the system SHALL provide user-friendly aggregation options with Chinese labels: "求和" (SUM), "平均值" (AVG), "计数" (COUNT), "最小值" (MIN), "最大值" (MAX), "去重计数" (COUNT DISTINCT)
2. WHEN a user wants to group data THEN the system SHALL provide "分组统计" functionality with column selection that generates DuckDB GROUP BY syntax
3. WHEN a user wants to remove duplicates THEN the system SHALL provide "去除重复" option that generates SELECT DISTINCT syntax
4. WHEN a user wants to calculate percentages THEN the system SHALL provide "百分比计算" option that generates DuckDB window function syntax (column / SUM(column) OVER() * 100)
5. WHEN a user wants statistical analysis THEN the system SHALL provide statistical options with Chinese labels: "中位数" (MEDIAN), "众数" (MODE), "标准差" (STDDEV_SAMP), "方差" (VAR_SAMP)

### Requirement 3

**User Story:** As a non-technical user, I want to filter and sort my data using intuitive controls, so that I can focus on relevant information without learning SQL syntax.

#### Acceptance Criteria

1. WHEN a user wants to filter data THEN the system SHALL provide user-friendly filter options with Chinese labels: "等于", "不等于", "包含", "不包含", "大于", "小于", "介于...之间", "为空", "不为空"
2. WHEN a user wants to sort results THEN the system SHALL provide "排序" functionality with "升序"/"降序" options that generate ORDER BY ASC/DESC syntax
3. WHEN a user wants to limit results THEN the system SHALL provide "显示条数" input field that generates LIMIT syntax
4. WHEN a user applies multiple filters THEN the system SHALL provide "且"/"或" logic options that generate AND/OR operators
5. WHEN a user wants pattern matching THEN the system SHALL provide text search options: "包含" (LIKE %pattern%), "开头是" (LIKE pattern%), "结尾是" (LIKE %pattern)

### Requirement 4

**User Story:** As a data analyst, I want to perform advanced data transformations and calculations, so that I can derive new insights from existing data columns.

#### Acceptance Criteria

1. WHEN a user wants to create calculated fields THEN the system SHALL provide mathematical operations with Chinese labels: "加法" (+), "减法" (-), "乘法" (*), "除法" (/), "取余" (%), "乘方", "开方", "绝对值", "四舍五入"
2. WHEN a user wants to work with dates THEN the system SHALL provide date functions with Chinese labels: "提取年份", "提取月份", "提取日期", "日期差值", "日期加减"
3. WHEN a user wants to manipulate text THEN the system SHALL provide string functions with Chinese labels: "转大写", "转小写", "字符长度", "截取字符", "连接字符", "去除空格", "替换文本"
4. WHEN a user wants conditional logic THEN the system SHALL provide "条件判断" interface that generates CASE WHEN expressions with simple if-then-else logic
5. WHEN a user wants to categorize data THEN the system SHALL provide "数据分组" options like "年龄段", "价格区间" that generate appropriate CASE WHEN or WIDTH_BUCKET syntax

### Requirement 5

**User Story:** As a business user, I want to analyze data distribution and patterns, so that I can understand my data characteristics without statistical expertise.

#### Acceptance Criteria

1. WHEN a user wants to see data distribution THEN the system SHALL provide "频率分析" option that generates GROUP BY with COUNT(*) for categorical data analysis
2. WHEN a user wants to identify outliers THEN the system SHALL provide "四分位数分析" option that generates PERCENTILE_CONT functions for outlier detection
3. WHEN a user wants to see data completeness THEN the system SHALL provide "数据完整性分析" that shows null value counts and percentages
4. WHEN a user wants to compare values THEN the system SHALL provide ranking options with Chinese labels: "行号" (ROW_NUMBER), "排名" (RANK), "密集排名" (DENSE_RANK)
5. WHEN a user wants to analyze trends THEN the system SHALL provide trend analysis options: "累计求和", "移动平均" that generate appropriate window functions

### Requirement 6

**User Story:** As a platform user, I want the visual query builder to integrate seamlessly with existing Duck Query features, so that I can enhance my current workflow without disruption.

#### Acceptance Criteria

1. WHEN a user builds a visual query THEN the system SHALL generate SQL that displays in the existing query editor area
2. WHEN a user executes a visual query THEN the system SHALL use the same query execution engine and display results in the existing results panel
3. WHEN visual query results are generated THEN the system SHALL integrate with existing export and visualization features
4. WHEN a user switches between tables THEN the system SHALL reset visual options while maintaining the interface state
5. WHEN a user wants to modify generated SQL THEN the system SHALL allow direct editing in the SQL editor

### Requirement 7

**User Story:** As a data analyst, I want real-time feedback and data preview capabilities, so that I can understand the impact of my selections before executing the full query.

#### Acceptance Criteria

1. WHEN a user selects columns or applies filters THEN the system SHALL show an estimated result count and affected columns
2. WHEN a user configures aggregations THEN the system SHALL provide a small sample preview of the aggregated results
3. WHEN a user builds complex queries THEN the system SHALL validate the query logic and show warnings for potential performance issues
4. WHEN a user applies filters THEN the system SHALL show how many rows match the current filter criteria
5. WHEN a user modifies any settings THEN the system SHALL update the SQL preview and estimated execution time in real-time

### Requirement 8

**User Story:** As a new user, I want intuitive interface design and helpful guidance, so that I can start analyzing data immediately without extensive learning.

#### Acceptance Criteria

1. WHEN a user accesses the visual query builder THEN the system SHALL provide clear Chinese section labels: "数据选择", "聚合统计", "筛选条件", "排序设置", "高级分析"
2. WHEN a user hovers over options THEN the system SHALL display helpful Chinese tooltips explaining each function's purpose and usage examples
3. WHEN a user makes incompatible selections THEN the system SHALL provide clear Chinese warning messages with specific suggestions for correction
4. WHEN a user builds a query THEN the system SHALL show a preview of the generated SQL with syntax highlighting and Chinese comments explaining the query logic
5. WHEN a user completes an analysis THEN the system SHALL provide "保存查询" and "导出结果" options with clear Chinese labels