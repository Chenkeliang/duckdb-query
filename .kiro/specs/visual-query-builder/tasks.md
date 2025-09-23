# Implementation Plan

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step in a test-driven manner. Prioritize best practices, incremental progress, and early testing, ensuring no big jumps in complexity at any stage. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

## Phase 1: Core Infrastructure Setup

- [x] 1. Create VisualAnalysisPanel component structure
  - Create `frontend/src/components/QueryBuilder/VisualAnalysisPanel.jsx` with basic container structure
  - Implement conditional rendering (only show when single table selected)
  - Add Tailwind CSS styling matching Shadcn/ui design system
  - Create basic state management for analysis configuration
  - _Requirements: 1.1, 1.3, 8.1_

- [x] 2. Integrate VisualAnalysisPanel into QueryBuilder
  - Modify `frontend/src/components/QueryBuilder/QueryBuilder.jsx` to include VisualAnalysisPanel
  - Position panel above "执行查询" button as specified
  - Implement conditional display logic (single table selection detection)
  - Ensure existing multi-table JOIN functionality remains unchanged
  - _Requirements: 1.1, 1.5, 6.4_

- [x] 3. Create visual query configuration data models
  - Create `frontend/src/types/visualQuery.js` with TypeScript interfaces
  - Define VisualQueryConfig, AggregationConfig, FilterConfig, SortConfig types
  - Include Chinese display labels mapping for all functions
  - Create validation utilities for query configuration
  - _Requirements: 2.1, 3.1, 4.1, 8.3_

## Phase 2: Column Selection and Basic Controls

- [x] 4. Implement ColumnSelector component
  - Create `frontend/src/components/QueryBuilder/VisualAnalysis/ColumnSelector.jsx`
  - Build checkbox-based multi-select interface with Tailwind styling
  - Display column names, data types, and metadata
  - Implement column selection state management
  - Add responsive grid layout for mobile/desktop
  - _Requirements: 1.1, 8.1, 8.2_

- [x] 5. Create AggregationControls component
  - Create `frontend/src/components/QueryBuilder/VisualAnalysis/AggregationControls.jsx`
  - Implement chip-style selection for aggregation functions
  - Add Chinese labels: "求和", "平均值", "计数", "最小值", "最大值", "去重计数"
  - Include statistical functions: "中位数", "众数", "标准差", "方差"
  - Implement column-specific aggregation assignment
  - _Requirements: 2.1, 2.2, 2.5_

- [x] 6. Build basic SQL generation engine
  - Create `frontend/src/utils/visualQueryGenerator.js`
  - Implement generateSQL function for basic SELECT with columns
  - Add support for aggregation functions with proper DuckDB syntax
  - Include GROUP BY logic when aggregations are used
  - Generate DISTINCT queries when specified
  - _Requirements: 1.3, 2.1, 2.3_

## Phase 3: Filtering and Sorting Features

- [x] 7. Implement FilterControls component
  - Create `frontend/src/components/QueryBuilder/VisualAnalysis/FilterControls.jsx`
  - Build dynamic filter condition builder interface
  - Add Chinese operators: "等于", "不等于", "包含", "大于", "小于", "介于...之间"
  - Implement AND/OR logic selection with "且"/"或" labels
  - Support multiple filter conditions with add/remove functionality
  - _Requirements: 3.1, 3.4, 3.5_

- [x] 8. Create SortLimitControls component
  - Create `frontend/src/components/QueryBuilder/VisualAnalysis/SortLimitControls.jsx`
  - Implement multi-column sorting with priority ordering
  - Add "升序"/"降序" radio button selection
  - Include "显示条数" input field for LIMIT clause
  - Build intuitive drag-and-drop sorting priority interface
  - _Requirements: 3.2, 3.3_

- [x] 9. Enhance SQL generation with filtering and sorting
  - Extend `visualQueryGenerator.js` with WHERE clause generation
  - Add support for all filter operators with proper DuckDB syntax
  - Implement ORDER BY clause with multiple columns and directions
  - Add LIMIT clause generation
  - Include proper SQL parameter escaping for security
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

## Phase 4: Advanced Analysis Features

- [x] 10. Add statistical analysis functions
  - Extend AggregationControls with advanced statistical functions
  - Implement PERCENTILE_CONT, PERCENTILE_DISC for quartile analysis
  - Add window functions: ROW_NUMBER, RANK, DENSE_RANK with Chinese labels
  - Include trend analysis: running totals, moving averages
  - Generate proper DuckDB window function syntax
  - _Requirements: 5.1, 5.2, 5.4, 5.5_

- [x] 11. Implement calculated fields functionality
  - Create CalculatedFieldsControls component for mathematical operations
  - Add Chinese labels for operations: "加法", "减法", "乘法", "除法"
  - Include advanced functions: "乘方", "开方", "绝对值", "四舍五入"
  - Support date functions: "提取年份", "提取月份", "提取日期"
  - Implement string functions: "转大写", "转小写", "字符长度"
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 12. Add conditional logic and data categorization
  - Implement CASE WHEN builder with simple if-then-else interface
  - Add "条件判断" functionality with visual condition builder
  - Create data binning options: "年龄段", "价格区间" using WIDTH_BUCKET
  - Support complex conditional expressions with multiple conditions
  - Generate proper DuckDB CASE WHEN and WIDTH_BUCKET syntax
  - _Requirements: 4.4, 4.5_

## Phase 5: Real-time Preview and Validation

- [x] 13. Create SQLPreview component
  - Create `frontend/src/components/QueryBuilder/VisualAnalysis/SQLPreview.jsx`
  - Display generated SQL with syntax highlighting
  - Add Chinese comments explaining query logic
  - Implement real-time SQL updates as user modifies conditions
  - Include copy-to-clipboard functionality
  - _Requirements: 7.4, 8.4_

- [x] 14. Implement real-time data preview and validation
  - Add preview query execution with row count estimation
  - Show sample results when aggregations are configured
  - Implement query validation with performance warnings
  - Display filter match counts in real-time
  - Add estimated execution time calculation
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 15. Add user guidance and help system
  - Implement contextual tooltips with Chinese explanations
  - Add hover help for all analysis functions with usage examples
  - Create validation error messages with specific correction suggestions
  - Include guided tutorial for first-time users
  - Add keyboard shortcuts and accessibility features
  - _Requirements: 8.2, 8.3, 8.5_

## Phase 6: Backend Integration

- [x] 16. Create visual query API endpoints
  - Create `api/models/visual_query_models.py` with Pydantic models
  - Implement VisualQueryConfig, AggregationConfig, FilterConfig models
  - Add validation logic for visual query configurations
  - Create proper error handling and response models
  - _Requirements: 1.3, 8.3_

- [x] 17. Implement visual query generator backend
  - Create `api/core/visual_query_generator.py` with SQL generation logic
  - Implement generate_sql_from_config function with DuckDB syntax
  - Add query validation and performance estimation
  - Include column statistics API for metadata display
  - Ensure proper SQL injection prevention
  - _Requirements: 1.3, 2.1, 3.1, 7.3_

- [x] 18. Add new API routes to query router
  - Extend `api/routers/query.py` with visual query endpoints
  - Add POST /api/visual-query/generate for SQL generation
  - Implement POST /api/visual-query/preview for data preview
  - Add GET /api/visual-query/column-stats/{table}/{column} for metadata
  - Integrate with existing DuckDB engine and error handling
  - _Requirements: 6.1, 6.2, 7.1, 7.2_

## Phase 7: Integration and Query Execution

- [x] 19. Integrate visual query with existing query execution
  - Modify QueryBuilder's handleExecuteQuery to detect visual analysis mode
  - Implement conditional logic: visual SQL vs. existing multi-table logic
  - Ensure seamless integration with existing result display components
  - Maintain backward compatibility with current query behavior
  - Add proper error handling for visual query execution
  - _Requirements: 1.2, 1.4, 1.5, 6.1, 6.2_

- [x] 20. Connect visual query results to existing display system
  - Ensure visual query results integrate with ModernDataDisplay component
  - Maintain compatibility with existing export and visualization features
  - Add query saving functionality with visual configuration preservation
  - Implement result caching for performance optimization
  - Test integration with all existing result processing features
  - _Requirements: 6.2, 6.3, 8.5_

## Phase 8: Testing and Quality Assurance

- [x] 21. Write comprehensive unit tests
  - Create unit tests for all visual query components
  - Test SQL generation with various configuration combinations
  - Add validation logic tests with edge cases
  - Test component rendering and user interaction flows
  - Ensure proper error handling and edge case coverage
  - _Requirements: All requirements validation_

- [x] 22. Implement integration tests
  - Create end-to-end tests for complete visual query workflows
  - Test integration with existing QueryBuilder functionality
  - Verify backward compatibility with multi-table queries
  - Test API integration and error handling scenarios
  - Add performance tests for large datasets
  - _Requirements: 6.1, 6.2, 6.4_

- [x] 23. Conduct user acceptance testing and refinement
  - Test with non-technical users to validate Chinese interface clarity
  - Verify all analysis functions work as expected with real data
  - Test responsive design across different screen sizes
  - Optimize performance and user experience based on feedback
  - Add final polish and accessibility improvements
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_