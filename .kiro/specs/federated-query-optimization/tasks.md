# Federated Query Optimization: Implementation Tasks

## Overview

This document tracks the implementation tasks for the federated query ON clause optimization feature.

---

## Phase 1: Infrastructure & Utilities

### Task 1.1: Create SQL Optimizer Utility Module
- [ ] Create new file: `frontend/src/new/Query/JoinQuery/sqlOptimizer.ts`
- [ ] Define TypeScript interfaces:
  - `TableSourceInfo`
  - `OnFilterGroup`
  - `SubqueryBuildResult`
- [ ] Export utility functions

**Estimated: 1 hour**

---

### Task 1.2: Implement Remote Table Detection
- [ ] Implement `isRemoteTable(table, attachDatabases)` function
- [ ] Implement `getTableSourceInfo(table, attachDatabases)` function
- [ ] Handle edge cases:
  - Tables with dot notation
  - Tables from local uploads
  - Tables with connectionId
- [ ] Unit tests for detection logic

**Estimated: 2 hours**

---

### Task 1.3: Implement ON Filter Extraction & Grouping
- [ ] Extend `filterUtils.ts` with `extractOnFiltersGroupedByTable(filterTree)`
- [ ] Walk filter tree to collect ON conditions by table
- [ ] Generate combined SQL for each group
- [ ] **NEW: Detect OR logic in filter groups**
- [ ] **NEW: Set `hasOrLogic` and `canOptimize` flags**
- [ ] Preserve AND/OR logic within groups
- [ ] Unit tests for extraction

**Estimated: 2.5 hours**

---

## Phase 2: Subquery Generation

### Task 2.1: Implement Subquery Builder
- [ ] Implement `buildFilteredSubquery(tableInfo, onFilters, columns, dialect)`
- [ ] Handle SELECT * vs specific columns
- [ ] Handle NULL filter groups (no optimization needed)
- [ ] Proper escaping and quoting
- [ ] Unit tests

**Estimated: 2 hours**

---

### Task 2.2: Implement Filter Classification
- [ ] Implement `classifyCondition(condition, leftTable, rightTable)`
- [ ] Categories: `join_key`, `left_filter`, `right_filter`, `where`
- [ ] Handle expression-based conditions (best effort)
- [ ] **NEW: Detect multi-table references in expressions → skip optimization**
- [ ] Unit tests with various condition types

**Estimated: 2 hours**

---

### Task 2.3: NEW - Implement Optimization Eligibility Checker
- [ ] Implement `checkOptimizationEligibility(tableInfo, filterGroup)`
- [ ] Check rules in order:
  1. Is remote table?
  2. Has ON filters?
  3. Contains OR logic? → Bailout
  4. All filters single-table?
- [ ] Return `OptimizationDecision` with reason for logging
- [ ] Unit tests for all bailout scenarios

**Estimated: 1.5 hours**

---

### Task 2.4: NEW - Implement Try-Catch Fallback Wrapper
- [ ] Create `generateOptimizedSQLWithFallback()` wrapper
- [ ] Catch all exceptions during optimization
- [ ] Log warnings with full context
- [ ] Fall back to original `generateSQL()` on error
- [ ] Unit tests for fallback behavior

**Estimated: 1 hour**


---

## Phase 3: Integration with generateSQL

### Task 3.1: Refactor generateSQL for Optimized FROM Clause
- [ ] Extract remote table detection at start of generateSQL
- [ ] Extract ON filter groups at start of generateSQL
- [ ] Modify FROM clause generation for first table:
  - Check if remote + has ON filters
  - If yes, use subquery
  - If no, use original reference
- [ ] Preserve existing alias handling

**Estimated: 2 hours**

---

### Task 3.2: Refactor generateSQL for Optimized JOIN Clauses
- [ ] For each JOIN table:
  - Check if remote + has ON filters
  - If yes, use subquery as JOIN source
  - If no, use original reference
- [ ] Separate join key conditions from single-table filters
- [ ] Generate ON clause with only join keys
- [ ] Remove single-table filters from ON clause (now in subquery)

**Estimated: 3 hours**

---

### Task 3.3: Handle Mixed Table Scenarios
- [ ] Local table with ON filter: keep in ON clause (no optimization)
- [ ] Remote table without ON filter: no subquery needed
- [ ] Test with 2-table, 3-table, and 4-table joins
- [ ] Verify correct table ordering

**Estimated: 2 hours**

---

## Phase 4: Testing

### Task 4.1: Unit Test Suite
- [ ] `sqlOptimizer.test.ts`
  - isRemoteTable tests
  - getTableSourceInfo tests
  - buildFilteredSubquery tests
- [ ] `filterUtils.test.ts` additions
  - extractOnFiltersGroupedByTable tests
- [ ] Run: `npm test -- --grep sqlOptimizer`

**Estimated: 3 hours**

---

### Task 4.2: Integration Tests (SQL Snapshots)
- [ ] Create test file: `JoinQueryPanel.optimization.test.tsx`
- [ ] Test cases:
  - [ ] single_remote_no_filter
  - [ ] single_remote_one_filter
  - [ ] single_remote_multi_filter
  - [ ] two_remote_mixed_filters
  - [ ] local_and_remote
  - [ ] no_on_filters_only_keys
  - [ ] inner_join_optimization
  - [ ] right_join_optimization
  - [ ] three_table_join
  - [ ] or_logic_preservation
  - [ ] between_and_in_operators
- [ ] Snapshot comparison for each generated SQL

**Estimated: 4 hours**

---

### Task 4.3: Manual E2E Testing
- [ ] Setup: Two MySQL databases with large tables
- [ ] Test: Create join query with ON filters
- [ ] Verify: SQL preview shows subquery
- [ ] Verify: Query executes faster
- [ ] Verify: Cancel functionality works
- [ ] Verify: Results are correct

**Estimated: 2 hours**

---

## Phase 5: Polish & Documentation

### Task 5.1: Performance Optimization
- [ ] Ensure SQL generation < 10ms
- [ ] Minimize DOM updates during SQL preview
- [ ] No unnecessary re-renders

**Estimated: 1 hour**

---

### Task 5.2: Error Handling
- [ ] Add try-catch around optimization logic
- [ ] Fallback to original behavior on error
- [ ] Log warnings for edge cases
- [ ] User-friendly error messages

**Estimated: 1 hour**

---

### Task 5.3: Feature Flag (Optional)
- [ ] Add config option: `enableFederatedQueryOptimization`
- [ ] Read from settings or environment
- [ ] Easy toggle for rollback

**Estimated: 0.5 hours**

---

### Task 5.4: Documentation
- [ ] Update README or docs with optimization behavior
- [ ] Add code comments explaining transformation
- [ ] Document known limitations

**Estimated: 1 hour**

---

### Task 5.5: NEW - Passive Notification System
- [ ] Define `OptimizationReport` interface
- [ ] Define `OptimizationSkipReason` type
- [ ] Implement `SKIP_REASON_MESSAGES` mapping
- [ ] Implement `generateOptimizationComment(report)` function
- [ ] Integrate notification generation into `generateSQL()`
- [ ] Return both `sql` and `reports` from `generateSQL()`
- [ ] Prepend warning comments to generated SQL when optimization skipped
- [ ] Unit tests for comment generation
- [ ] Integration test: verify comments appear for OR logic
- [ ] Integration test: verify no comments for successful optimization

**Estimated: 2 hours**

---

## Summary

| Phase | Tasks | Estimated Hours |
|-------|-------|-----------------|
| Phase 1: Infrastructure | 3 tasks | 5.5 hours |
| Phase 2: Subquery Gen + Bailout | 4 tasks | 6.5 hours |
| Phase 3: Integration | 3 tasks | 7 hours |
| Phase 4: Testing | 3 tasks | 9 hours |
| Phase 5: Polish + Notification | 5 tasks | 5.5 hours |
| **Total** | **18 tasks** | **33.5 hours** |

---

## Definition of Done

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] SQL preview shows optimized queries for remote tables
- [ ] Query performance improved for federated joins with filters
- [ ] Cancel functionality works with optimized queries
- [ ] No regressions in existing functionality
- [ ] Code reviewed and merged
