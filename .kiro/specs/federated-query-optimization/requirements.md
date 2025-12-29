# Federated Query Optimization: ON Clause Subquery Rewriting

## Problem Statement

When executing federated queries with DuckDB's MySQL/PostgreSQL scanner, filter conditions placed in JOIN ON clauses are **not pushed down** to the remote database. This causes DuckDB to:

1. Fetch the entire remote table (e.g., 90 million rows)
2. Apply the filter locally after data transfer
3. Result in extremely slow query performance

**Benchmark Results:**
| Query Type | Rows Returned | Time |
|------------|---------------|------|
| Full table scan | 90,455,340 | 20.96s |
| WHERE clause filter | 546,071 | 0.54s |
| Subquery with WHERE | 546,071 | 0.51s |

**Conclusion:** WHERE clause conditions ARE pushed down (40x faster), but ON clause conditions are NOT.

## Goal

Automatically rewrite federated JOIN queries to convert ON clause filters into subqueries, enabling predicate pushdown and dramatically improving query performance.

**Before (slow):**
```sql
SELECT *
FROM mysql_sorder.wxsp_order AS wxsp_order
LEFT JOIN mysql_sorting.sorting_info AS sorting_info 
ON wxsp_order.order_id = sorting_info.order_no
AND wxsp_order.create_time >= '2025-12-01'
AND sorting_info.create_time >= '2025-12-01'
LIMIT 10000
```

**After (fast):**
```sql
SELECT *
FROM (
    SELECT * FROM mysql_sorder.wxsp_order 
    WHERE create_time >= '2025-12-01'
) AS wxsp_order
LEFT JOIN (
    SELECT * FROM mysql_sorting.sorting_info 
    WHERE create_time >= '2025-12-01'
) AS sorting_info 
ON wxsp_order.order_id = sorting_info.order_no
LIMIT 10000
```

## Functional Requirements

### FR-1: Automatic ON Filter Detection
- Detect filter conditions in ON clauses that reference only one table
- Support common filter operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE`, `IN`, `NOT IN`, `BETWEEN`, `IS NULL`, `IS NOT NULL`
- Preserve JOIN key conditions (conditions referencing both left and right tables)

### FR-2: Remote Table Identification
- Only apply subquery rewriting to tables from **remote databases** (MySQL, PostgreSQL via ATTACH)
- Do NOT rewrite conditions for DuckDB local tables (no benefit)
- Support mixed scenarios: local + remote table joins

### FR-3: Subquery Generation
- Convert single-table ON filters to WHERE clauses inside subqueries
- Group multiple filters for the same table into a single subquery
- Support different JOIN types: LEFT JOIN, RIGHT JOIN, INNER JOIN, FULL JOIN, CROSS JOIN
- Preserve semantic equivalence for all JOIN types

### FR-4: Column Selection Optimization (Optional)
- If only specific columns are needed from a remote table, include only those columns in the subquery
- Reduces data transfer volume over the network

### FR-5: Multi-Table Support
- Handle queries with 3+ tables correctly
- Each remote table gets its own subquery
- Preserve correct JOIN order and aliasing

### FR-6: Passive Optimization Status Notification
- When optimization is **skipped or rolled back**, add SQL comment at the top of generated SQL
- Comment format: `-- ⚠ [table_name]: 未优化 (reason)`
- **NO notification when optimization succeeds** (silent success principle)
- Reason mapping:
  - `or_logic` → "ON 条件包含 OR 逻辑，已回退"
  - `expression_complex` → "ON 条件包含复杂表达式，已回退"
  - `multi_table_reference` → "ON 条件引用多表，无法拆分"
  - `no_filters` → No comment (normal case, no optimization needed)
  - `local_table` → No comment (local tables don't need optimization)
- Users see the reason in SQL preview, can understand why query might be slower
- Non-intrusive: no popups, toasts, or modal dialogs


## Non-Functional Requirements

### NFR-1: Performance
- SQL generation should complete in < 10ms
- No noticeable delay in the UI when generating SQL

### NFR-2: Correctness
- Generated SQL must be semantically equivalent to original intent
- All test cases must pass

### NFR-3: Maintainability
- Clear separation between filter extraction and SQL generation
- Well-documented transformation rules
- Easy to extend with new operators or patterns

## User Stories

### US-1: Federated Query User
As a user running federated queries across MySQL databases,
I want my ON clause filters to be automatically optimized,
So that my queries run in seconds instead of minutes.

### US-2: Mixed Source Query User
As a user joining local CSV data with remote MySQL tables,
I want only the remote table accesses to be optimized,
So that I get the best performance without unnecessary complexity.

### US-3: Complex Filter User
As a user with multiple filter conditions on different tables,
I want all my filters to be correctly converted to subqueries,
So that each remote table benefits from predicate pushdown.

## Acceptance Criteria

### AC-1: Basic Optimization
- [ ] Single ON filter on remote table is converted to subquery
- [ ] Query performance improves by at least 10x for large tables with selective filters

### AC-2: Multiple Filters
- [ ] Multiple filters on same table are combined in one subquery
- [ ] Multiple filters on different tables each get their own subquery
- [ ] AND/OR logic is preserved correctly

### AC-3: JOIN Types
- [ ] LEFT JOIN semantic equivalence maintained
- [ ] RIGHT JOIN semantic equivalence maintained
- [ ] INNER JOIN semantic equivalence maintained
- [ ] FULL JOIN semantic equivalence maintained

### AC-4: Mixed Tables
- [ ] Local tables are NOT wrapped in subqueries
- [ ] Only remote tables receive optimization
- [ ] JOIN keys between local and remote tables work correctly

### AC-5: Edge Cases
- [ ] Empty filter sets (no ON filters) work correctly
- [ ] Queries with only JOIN key conditions (no filters) work correctly
- [ ] NULL handling is correct

## Edge Cases & Bailout Rules

### EC-1: JOIN Semantics Preservation
**Risk:** Moving filters into subqueries could change JOIN behavior, especially for LEFT/RIGHT/FULL JOIN.

**Validation Requirements:**
- LEFT JOIN: When right table subquery returns 0 rows after filtering, left table rows must still be preserved with NULLs
- RIGHT JOIN: When left table subquery returns 0 rows after filtering, right table rows must still be preserved with NULLs  
- FULL JOIN: Both sides must be preserved correctly with NULLs for non-matching rows
- NULL handling: Rows with NULL in filter columns must be handled correctly

**Testing:** For each JOIN type, prepare snapshot tests + manual SQL comparison with real data.

---

### EC-2: AND/OR Logic Handling
**Risk:** Complex logic with OR or nested parentheses could be incorrectly split.

**Examples:**
```sql
-- MUST be kept together, not split
ON r.id = l.id AND (r.status = 'A' OR r.status = 'B')
```

**Bailout Rule:**
- **V1 Implementation:** Only optimize **pure AND** logic conditions
- If **OR is detected** within an ON filter group, skip optimization for that table entirely
- Log warning: "Skipping optimization for table X due to OR logic"
- Future: Handle OR by moving entire OR group into subquery WHERE

---

### EC-3: Expressions & Multi-Table References
**Risk:** Expressions referencing multiple tables or complex functions cannot be moved to a single-table subquery.

**Examples:**
```sql
-- Cannot optimize: references both tables
ON r.id = l.id AND r.amount * l.rate > 100

-- Can optimize: single table + constant
ON r.id = l.id AND DATE(r.create_time) = '2025-01-01'
```

**Bailout Rule:**
- Only optimize conditions matching pattern: `single_table.column OPERATOR constant`
- Skip conditions with:
  - References to multiple tables
  - Arithmetic expressions between columns from different tables
  - Complex function calls with multiple table references
- Log warning when skipping

---

### EC-4: Duplicate/Overlapping Filters
**Risk:** User may have same condition in both ON clause and WHERE clause.

**Example:**
```sql
-- ON and WHERE have duplicate condition
ON ... AND sorting_info.create_time >= '2025-12-01'
WHERE sorting_info.create_time >= '2025-12-01'
```

**Handling:**
- **V1:** Allow duplicates (semantically correct, just slightly redundant SQL)
- **Future:** Deduplicate conditions during optimization (optional enhancement)
- No bailout needed - redundant filters don't affect correctness

---

### EC-5: Column Projection
**Risk:** Using `SELECT *` in subqueries transfers all columns even if only a few are needed.

**Current Approach:**
- **V1:** Default to `SELECT *` for simplicity and correctness
- **Future Enhancement:** Analyze SELECT clause and JOIN keys to determine required columns

**Note in generated SQL:**
```sql
-- Future: column pruning could optimize to SELECT id, name, create_time
SELECT * FROM mysql_db.table WHERE ...
```

---

### EC-6: Empty Filter Sets
**Risk:** Generating subquery without WHERE clause adds overhead without benefit.

**Example:**
```sql
-- No optimization needed - no filters to push down
LEFT JOIN mysql_db.orders AS orders ON l.id = orders.local_id
```

**Bailout Rule:**
- If a remote table has **no single-table ON filters**, do NOT wrap in subquery
- Keep original table reference as-is
- Optimization applies only when there are filters to push down

---

### EC-7: Execution Failure Fallback
**Risk:** If subquery generation fails (parsing error, edge case), entire query would fail.

**Fallback Strategy:**
1. Wrap optimization logic in try-catch
2. On any error: fall back to original SQL generation (no optimization)
3. Log error with full context for debugging
4. User sees query execute (slower, but working) rather than error

**Implementation:**
```typescript
try {
  return generateOptimizedSQL(tables, filters, attachDatabases);
} catch (error) {
  console.warn('[SQL Optimizer] Fallback to unoptimized SQL:', error);
  return generateOriginalSQL(tables, filters);
}
```

---

## Optimization Decision Matrix

| Condition | Optimize? | Reason |
|-----------|-----------|--------|
| Remote table + AND-only single-table filters | ✅ Yes | Best case for optimization |
| Remote table + OR logic in filters | ❌ No | V1 limitation, skip |
| Remote table + no filters | ❌ No | No benefit from subquery |
| Local table + any filters | ❌ No | No predicate pushdown benefit |
| Filter references multiple tables | ❌ No | Cannot move to single-table subquery |
| Complex expression in filter | ⚠️ Depends | Simple functions OK, multi-table expressions skip |

---

## Pre-Launch Validation Checklist

### Regression Testing
- [ ] Original SQL vs Optimized SQL: Output results must be identical
- [ ] Performance comparison: Optimized must be faster for large remote tables
- [ ] Cancel functionality: `X-Request-ID` still works with subquery mode

### JOIN Type Verification
| JOIN Type | Test Case | Expected Behavior |
|-----------|-----------|-------------------|
| LEFT JOIN | Right subquery returns 0 rows | Left rows preserved with NULLs |
| RIGHT JOIN | Left subquery returns 0 rows | Right rows preserved with NULLs |
| INNER JOIN | Either subquery returns 0 rows | Empty result set |
| FULL JOIN | Mixed NULL scenarios | Both sides preserved correctly |

### Edge Case Verification
- [ ] Query with only JOIN keys (no filters): No optimization applied
- [ ] Query with OR logic: Falls back to original SQL
- [ ] Query with multi-table expression: Falls back for that condition
- [ ] Query with local + remote tables: Only remote tables optimized
- [ ] Query execution error: Graceful fallback, query still executes

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Semantic change in edge cases | Query returns wrong results | Comprehensive test suite with SQL snapshots; manual verification |
| Performance regression for small tables | Slower queries | Only optimize remote tables; future: skip tables < 10k rows |
| Complex OR logic breaks | Incorrect SQL | Bailout: skip optimization when OR detected |
| Expression parsing failure | Query generation crash | Try-catch fallback to original SQL |
| Column projection overhead | More data than needed | V1: accept overhead; V2: implement column pruning |
| Duplicate filter redundancy | Verbose SQL | V1: accept; V2: deduplicate (optional) |

---

## Out of Scope

- Automatic index recommendations for remote databases
- Query plan caching or materialization
- Correlated subqueries
- Window functions in filter conditions
- OR logic optimization (V1 - will be added in future version)
- Column pruning based on SELECT clause (V1 - optional future enhancement)
- Deduplication of overlapping ON/WHERE filters (V1)

## Dependencies

- Existing FilterBar and filter tree data structure
- JoinQueryPanel's generateSQL function
- Knowledge of which tables are remote (via attachDatabases)

