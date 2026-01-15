/**
 * SQL Optimizer - Federated Query ON Clause Subquery Optimization
 * 
 * This module provides utilities to automatically rewrite federated JOIN queries
 * by converting ON clause filters into subqueries, enabling predicate pushdown
 * to remote databases (MySQL, PostgreSQL).
 * 
 * Key Features:
 * - Remote table detection
 * - ON filter extraction and grouping
 * - Subquery generation with WHERE clauses
 * - Optimization eligibility checking with bailout rules
 * - Passive notification via SQL comments
 */

import { FilterGroup, FilterCondition, FilterNode } from './FilterBar/types';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Reason why optimization was applied or skipped
 */
export type OptimizationSkipReason =
    | 'success'              // Optimization applied
    | 'no_filters'           // No filters to push
    | 'local_table'          // Local table - no benefit
    | 'or_logic'             // Contains OR logic - bailout
    | 'expression_complex'   // Complex expression - bailout
    | 'multi_table_reference' // Multi-table reference - bailout
    | 'fallback_error';      // Exception occurred - bailout

/**
 * Result of optimization eligibility check
 */
export interface OptimizationDecision {
    shouldOptimize: boolean;
    reason: OptimizationSkipReason;
}

/**
 * Information about a table's source (remote vs local)
 */
export interface TableSourceInfo {
    tableName: string;
    alias: string;
    isRemote: boolean;
    fullRef: string;       // e.g., "mysql_db.table_name"
    attachAlias?: string;  // e.g., "mysql_db"
}

/**
 * Group of ON conditions for a single table
 */
export interface OnFilterGroup {
    tableName: string;
    tableAlias: string;
    conditions: FilterCondition[];
    combinedSQL: string;
    hasOrLogic: boolean;
    canOptimize: boolean;
}

/**
 * Result of subquery building
 */
export interface SubqueryBuildResult {
    subquerySQL: string;
    alias: string;
}

/**
 * Report of optimization decision for a table
 */
export interface OptimizationReport {
    tableName: string;
    wasOptimized: boolean;
    reason: OptimizationSkipReason;
}

/**
 * Attach database configuration
 */
export interface AttachDatabase {
    alias: string;
    type: string;
    connectionId?: string;
}

// =============================================================================
// i18n Message Mappings
// =============================================================================

import i18next from 'i18next';

/**
 * Get localized message for an optimization reason
 */
export function getReasonMessage(
    reason: OptimizationSkipReason,
    _locale: 'zh' | 'en' = 'zh'
): string {
    // Rely on i18next globally initialized instance
    // We use the 'common' namespace where we added the keys
    return i18next.t(`optimizer.${reason}`, { ns: 'common' });
}

/**
 * Which reasons should trigger a SQL comment notification?
 */
export const SHOULD_NOTIFY: Record<OptimizationSkipReason, boolean> = {
    'success': false,
    'no_filters': false,
    'local_table': false,
    'or_logic': true,
    'expression_complex': true,
    'multi_table_reference': true,
    'fallback_error': true
};

/**
 * Strip quotes from an identifier
 */
function stripQuotes(str: string): string {
    if (str.startsWith('"') && str.endsWith('"')) {
        return str.slice(1, -1).replace(/""/g, '"');
    }
    return str;
}

// =============================================================================
// Remote Table Detection
// =============================================================================

/**
 * Check if a table is from a remote database (attached via ATTACH)
 */
export function isRemoteTable(
    tableRef: string,
    attachDatabases: AttachDatabase[]
): boolean {
    if (!tableRef || attachDatabases.length === 0) return false;

    // Check if table reference starts with an attach alias
    // Handle quoted identifiers (e.g., "mysql_db"."users")
    let prefix = tableRef.split('.')[0];
    prefix = stripQuotes(prefix);

    return attachDatabases.some(db => db.alias === prefix);
}

/**
 * Get detailed information about a table's source
 */
export function getTableSourceInfo(
    tableName: string,
    tableAlias: string,
    fullTableRef: string,
    attachDatabases: AttachDatabase[]
): TableSourceInfo {
    const isRemote = isRemoteTable(fullTableRef, attachDatabases);

    let prefix = fullTableRef.split('.')[0];
    prefix = stripQuotes(prefix);

    const attachAlias = isRemote ? prefix : undefined;

    return {
        tableName,
        alias: tableAlias,
        isRemote,
        fullRef: fullTableRef,
        attachAlias
    };
}

// =============================================================================
// ON Filter Extraction
// =============================================================================

/**
 * Walk the filter tree and call callback for each node
 */
function walkFilterTree(
    node: FilterNode,
    callback: (node: FilterNode, parent: FilterGroup | null, parentLogic: 'AND' | 'OR' | null) => void,
    parent: FilterGroup | null = null,
    parentLogic: 'AND' | 'OR' | null = null
): void {
    callback(node, parent, parentLogic);

    if (node.type === 'group') {
        const group = node as FilterGroup;
        for (const child of group.children) {
            walkFilterTree(child, callback, group, group.logic);
        }
    }
}

/**
 * Extract ON conditions grouped by table name
 * Also detects OR logic for bailout decisions
 */
export function extractOnFiltersGroupedByTable(
    filterTree: FilterGroup
): Map<string, OnFilterGroup> {
    const groups = new Map<string, OnFilterGroup>();

    // Walk the filter tree
    walkFilterTree(filterTree, (node, _parent, parentLogic) => {
        if (node.type === 'condition') {
            const cond = node as FilterCondition;
            if (cond.placement === 'on' && cond.table) {
                const tableName = cond.table;

                if (!groups.has(tableName)) {
                    groups.set(tableName, {
                        tableName,
                        tableAlias: tableName,
                        conditions: [],
                        combinedSQL: '',
                        hasOrLogic: false,
                        canOptimize: true
                    });
                }

                const group = groups.get(tableName)!;
                group.conditions.push(cond);

                // Check if parent uses OR logic
                if (parentLogic === 'OR') {
                    group.hasOrLogic = true;
                }
            }
        }
    });

    // Analyze each group for optimization eligibility
    for (const [tableName, group] of groups) {
        if (group.hasOrLogic) {
            console.warn(`[SQL Optimizer] Skipping optimization for table '${tableName}' due to OR logic`);
            group.canOptimize = false;
        }
        // Note: combinedSQL will be generated later when we know the filter format
    }

    return groups;
}

// =============================================================================
// Optimization Eligibility Checker
// =============================================================================

/**
 * Check if a table should be optimized with subquery wrapping
 */
export function checkOptimizationEligibility(
    tableInfo: TableSourceInfo,
    filterGroup: OnFilterGroup | undefined
): OptimizationDecision {
    // Rule 1: Must be remote table
    if (!tableInfo.isRemote) {
        return { shouldOptimize: false, reason: 'local_table' };
    }

    // Rule 2: Must have filters
    if (!filterGroup || filterGroup.conditions.length === 0) {
        return { shouldOptimize: false, reason: 'no_filters' };
    }

    // Rule 3: Check OR logic bailout
    if (filterGroup.hasOrLogic || !filterGroup.canOptimize) {
        return { shouldOptimize: false, reason: 'or_logic' };
    }

    // All checks passed - proceed with optimization
    return { shouldOptimize: true, reason: 'success' };
}

// =============================================================================
// Subquery Builder
// =============================================================================

/**
 * Quote an identifier for SQL
 */
function quoteIdent(name: string, _dialect: 'duckdb' | 'mysql' | 'postgres' = 'duckdb'): string {
    // DuckDB uses double quotes, but we'll keep it simple for now
    if (name.includes('"') || name.includes(' ') || name.includes('.')) {
        return `"${name.replace(/"/g, '""')}"`;
    }
    return name;
}

/**
 * Build a filtered subquery for a remote table
 */
export function buildFilteredSubquery(
    tableSourceInfo: TableSourceInfo,
    whereSQL: string,
    selectedColumns: string[] | null = null,
    dialect: 'duckdb' | 'mysql' | 'postgres' = 'duckdb'
): SubqueryBuildResult {
    const { fullRef, alias } = tableSourceInfo;

    // Column selection
    const selectClause = selectedColumns && selectedColumns.length > 0
        ? selectedColumns.map(c => quoteIdent(c, dialect)).join(', ')
        : '*';

    // WHERE clause
    const whereClause = whereSQL ? `WHERE ${whereSQL}` : '';

    const subquerySQL = `(SELECT ${selectClause} FROM ${fullRef} ${whereClause})`.trim();

    return { subquerySQL, alias };
}

// =============================================================================
// Passive Notification System
// =============================================================================

/**
 * Generate a SQL comment for an optimization report
 * Returns null if no notification should be shown
 */
export function generateOptimizationComment(report: OptimizationReport): string | null {
    if (!SHOULD_NOTIFY[report.reason]) return null;

    const message = getReasonMessage(report.reason, 'zh');
    return `-- ⚠ ${report.tableName}: ${message}`;
}

/**
 * Generate SQL comment header for multiple optimization reports
 */
export function generateOptimizationComments(reports: OptimizationReport[]): string[] {
    return reports
        .map(r => generateOptimizationComment(r))
        .filter((c): c is string => c !== null);
}

// =============================================================================
// Main Optimization Function (to be integrated with generateSQL)
// =============================================================================

/**
 * Result of SQL optimization
 */
export interface OptimizationResult {
    optimizedTableRefs: Map<string, SubqueryBuildResult>;
    reports: OptimizationReport[];
    warnings: string[];
}

/**
 * Analyze tables and determine which should be optimized
 * This is a preparation step before SQL generation
 */
export function analyzeTablesForOptimization(
    tables: Array<{ name: string; alias: string; fullRef: string }>,
    filterTree: FilterGroup,
    attachDatabases: AttachDatabase[],
    generateConditionSQL: (conditions: FilterCondition[]) => string
): OptimizationResult {
    const optimizedTableRefs = new Map<string, SubqueryBuildResult>();
    const reports: OptimizationReport[] = [];
    const warnings: string[] = [];

    try {
        // Extract ON filters grouped by table
        const onFilterGroups = extractOnFiltersGroupedByTable(filterTree);

        // Analyze each table
        for (const table of tables) {
            const tableInfo = getTableSourceInfo(
                table.name,
                table.alias,
                table.fullRef,
                attachDatabases
            );

            const filterGroup = onFilterGroups.get(table.name) || onFilterGroups.get(table.alias);
            const decision = checkOptimizationEligibility(tableInfo, filterGroup);

            reports.push({
                tableName: table.fullRef,
                wasOptimized: decision.shouldOptimize,
                reason: decision.reason
            });

            if (decision.shouldOptimize && filterGroup) {
                // Generate WHERE SQL for the subquery
                const whereSQL = generateConditionSQL(filterGroup.conditions);

                if (whereSQL) {
                    const subqueryResult = buildFilteredSubquery(tableInfo, whereSQL);
                    optimizedTableRefs.set(table.name, subqueryResult);
                    optimizedTableRefs.set(table.alias, subqueryResult);
                }
            }
        }

        // Generate warning comments
        warnings.push(...generateOptimizationComments(reports));

    } catch (error) {
        console.error('[SQL Optimizer] Error during optimization analysis:', error);
        // Add fallback report
        reports.push({
            tableName: 'unknown',
            wasOptimized: false,
            reason: 'fallback_error'
        });
        warnings.push(generateOptimizationComment({
            tableName: 'optimization',
            wasOptimized: false,
            reason: 'fallback_error'
        }) || '');
    }

    return { optimizedTableRefs, reports, warnings };
}
