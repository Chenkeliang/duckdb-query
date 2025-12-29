/**
 * Unit tests for SQL Optimizer - Federated Query ON Clause Optimization
 */

import {
    isRemoteTable,
    getTableSourceInfo,
    extractOnFiltersGroupedByTable,
    checkOptimizationEligibility,
    buildFilteredSubquery,
    generateOptimizationComment,
    generateOptimizationComments,
    getReasonMessage,
    REASON_MESSAGES_ZH,
    REASON_MESSAGES_EN,
    SHOULD_NOTIFY,
    type AttachDatabase,
    type TableSourceInfo,
    type OnFilterGroup,
    type OptimizationReport,
} from '../sqlOptimizer';
import type { FilterGroup, FilterCondition } from '../FilterBar/types';

describe('sqlOptimizer', () => {
    describe('isRemoteTable', () => {
        const attachDatabases: AttachDatabase[] = [
            { alias: 'mysql_orders', type: 'mysql', connectionId: '1' },
            { alias: 'pg_users', type: 'postgresql', connectionId: '2' },
        ];

        it('should return true for remote table with matching prefix', () => {
            expect(isRemoteTable('mysql_orders.users', attachDatabases)).toBe(true);
            expect(isRemoteTable('pg_users.accounts', attachDatabases)).toBe(true);
        });

        it('should handle quoted table references', () => {
            expect(isRemoteTable('"mysql_orders"."users"', attachDatabases)).toBe(true);
            expect(isRemoteTable('"pg_users"."accounts"', attachDatabases)).toBe(true);
        });

        it('should return false for local table', () => {
            expect(isRemoteTable('local_table', attachDatabases)).toBe(false);
            expect(isRemoteTable('"duckdb_table"', attachDatabases)).toBe(false);
        });

        it('should return false when no attach databases', () => {
            expect(isRemoteTable('mysql_orders.users', [])).toBe(false);
        });

        it('should return false for empty table reference', () => {
            expect(isRemoteTable('', attachDatabases)).toBe(false);
        });
    });

    describe('getTableSourceInfo', () => {
        const attachDatabases: AttachDatabase[] = [
            { alias: 'mysql_orders', type: 'mysql', connectionId: '1' },
        ];

        it('should identify remote table correctly', () => {
            const info = getTableSourceInfo(
                'users',
                'users',
                'mysql_orders.users',
                attachDatabases
            );
            expect(info.isRemote).toBe(true);
            expect(info.attachAlias).toBe('mysql_orders');
            expect(info.fullRef).toBe('mysql_orders.users');
        });

        it('should identify local table correctly', () => {
            const info = getTableSourceInfo(
                'local_table',
                'local_table',
                'local_table',
                attachDatabases
            );
            expect(info.isRemote).toBe(false);
            expect(info.attachAlias).toBeUndefined();
        });
    });

    describe('extractOnFiltersGroupedByTable', () => {
        it('should extract ON conditions grouped by table', () => {
            const filterTree: FilterGroup = {
                id: 'root',
                type: 'group',
                logic: 'AND',
                children: [
                    {
                        id: 'cond1',
                        type: 'condition',
                        table: 'orders',
                        column: 'status',
                        operator: '=',
                        value: 'active',
                        placement: 'on',
                    } as FilterCondition,
                    {
                        id: 'cond2',
                        type: 'condition',
                        table: 'orders',
                        column: 'amount',
                        operator: '>',
                        value: '100',
                        placement: 'on',
                    } as FilterCondition,
                ],
            };

            const groups = extractOnFiltersGroupedByTable(filterTree);
            expect(groups.size).toBe(1);
            expect(groups.has('orders')).toBe(true);

            const ordersGroup = groups.get('orders')!;
            expect(ordersGroup.conditions.length).toBe(2);
            expect(ordersGroup.hasOrLogic).toBe(false);
            expect(ordersGroup.canOptimize).toBe(true);
        });

        it('should detect OR logic and set hasOrLogic flag', () => {
            const filterTree: FilterGroup = {
                id: 'root',
                type: 'group',
                logic: 'OR', // OR at top level
                children: [
                    {
                        id: 'cond1',
                        type: 'condition',
                        table: 'orders',
                        column: 'status',
                        operator: '=',
                        value: 'active',
                        placement: 'on',
                    } as FilterCondition,
                    {
                        id: 'cond2',
                        type: 'condition',
                        table: 'orders',
                        column: 'status',
                        operator: '=',
                        value: 'pending',
                        placement: 'on',
                    } as FilterCondition,
                ],
            };

            const groups = extractOnFiltersGroupedByTable(filterTree);
            const ordersGroup = groups.get('orders')!;
            expect(ordersGroup.hasOrLogic).toBe(true);
            expect(ordersGroup.canOptimize).toBe(false);
        });

        it('should ignore WHERE placement conditions', () => {
            const filterTree: FilterGroup = {
                id: 'root',
                type: 'group',
                logic: 'AND',
                children: [
                    {
                        id: 'cond1',
                        type: 'condition',
                        table: 'orders',
                        column: 'status',
                        operator: '=',
                        value: 'active',
                        placement: 'where', // WHERE, not ON
                    } as FilterCondition,
                ],
            };

            const groups = extractOnFiltersGroupedByTable(filterTree);
            expect(groups.size).toBe(0);
        });
    });

    describe('checkOptimizationEligibility', () => {
        it('should return local_table for non-remote tables', () => {
            const tableInfo: TableSourceInfo = {
                tableName: 'local',
                alias: 'local',
                isRemote: false,
                fullRef: 'local',
            };
            const result = checkOptimizationEligibility(tableInfo, undefined);
            expect(result.shouldOptimize).toBe(false);
            expect(result.reason).toBe('local_table');
        });

        it('should return no_filters when no filter group', () => {
            const tableInfo: TableSourceInfo = {
                tableName: 'orders',
                alias: 'orders',
                isRemote: true,
                fullRef: 'mysql_db.orders',
                attachAlias: 'mysql_db',
            };
            const result = checkOptimizationEligibility(tableInfo, undefined);
            expect(result.shouldOptimize).toBe(false);
            expect(result.reason).toBe('no_filters');
        });

        it('should return or_logic when hasOrLogic is true', () => {
            const tableInfo: TableSourceInfo = {
                tableName: 'orders',
                alias: 'orders',
                isRemote: true,
                fullRef: 'mysql_db.orders',
                attachAlias: 'mysql_db',
            };
            const filterGroup: OnFilterGroup = {
                tableName: 'orders',
                tableAlias: 'orders',
                conditions: [{ id: 'c1', type: 'condition' } as FilterCondition],
                combinedSQL: '',
                hasOrLogic: true,
                canOptimize: false,
            };
            const result = checkOptimizationEligibility(tableInfo, filterGroup);
            expect(result.shouldOptimize).toBe(false);
            expect(result.reason).toBe('or_logic');
        });

        it('should return success for optimizable remote table', () => {
            const tableInfo: TableSourceInfo = {
                tableName: 'orders',
                alias: 'orders',
                isRemote: true,
                fullRef: 'mysql_db.orders',
                attachAlias: 'mysql_db',
            };
            const filterGroup: OnFilterGroup = {
                tableName: 'orders',
                tableAlias: 'orders',
                conditions: [{ id: 'c1', type: 'condition' } as FilterCondition],
                combinedSQL: 'status = \'active\'',
                hasOrLogic: false,
                canOptimize: true,
            };
            const result = checkOptimizationEligibility(tableInfo, filterGroup);
            expect(result.shouldOptimize).toBe(true);
            expect(result.reason).toBe('success');
        });
    });

    describe('buildFilteredSubquery', () => {
        it('should build subquery with WHERE clause', () => {
            const tableInfo: TableSourceInfo = {
                tableName: 'orders',
                alias: 'orders',
                isRemote: true,
                fullRef: 'mysql_db.orders',
                attachAlias: 'mysql_db',
            };
            const result = buildFilteredSubquery(tableInfo, "status = 'active'");
            expect(result.subquerySQL).toBe("(SELECT * FROM mysql_db.orders WHERE status = 'active')");
            expect(result.alias).toBe('orders');
        });

        it('should build subquery without WHERE when empty', () => {
            const tableInfo: TableSourceInfo = {
                tableName: 'orders',
                alias: 'orders',
                isRemote: true,
                fullRef: 'mysql_db.orders',
                attachAlias: 'mysql_db',
            };
            const result = buildFilteredSubquery(tableInfo, '');
            // Note: trailing space is expected due to template literal
            expect(result.subquerySQL).toBe('(SELECT * FROM mysql_db.orders )');
        });

        it('should use specific columns when provided', () => {
            const tableInfo: TableSourceInfo = {
                tableName: 'orders',
                alias: 'orders',
                isRemote: true,
                fullRef: 'mysql_db.orders',
                attachAlias: 'mysql_db',
            };
            const result = buildFilteredSubquery(tableInfo, "status = 'active'", ['id', 'name']);
            // Note: quoteIdent only quotes identifiers with special chars, spaces, or dots
            expect(result.subquerySQL).toBe("(SELECT id, name FROM mysql_db.orders WHERE status = 'active')");
        });
    });

    describe('generateOptimizationComment', () => {
        it('should return null for success', () => {
            const report: OptimizationReport = {
                tableName: 'orders',
                wasOptimized: true,
                reason: 'success',
            };
            expect(generateOptimizationComment(report)).toBeNull();
        });

        it('should return null for no_filters', () => {
            const report: OptimizationReport = {
                tableName: 'orders',
                wasOptimized: false,
                reason: 'no_filters',
            };
            expect(generateOptimizationComment(report)).toBeNull();
        });

        it('should return null for local_table', () => {
            const report: OptimizationReport = {
                tableName: 'local',
                wasOptimized: false,
                reason: 'local_table',
            };
            expect(generateOptimizationComment(report)).toBeNull();
        });

        it('should return warning comment for or_logic', () => {
            const report: OptimizationReport = {
                tableName: 'mysql_db.orders',
                wasOptimized: false,
                reason: 'or_logic',
            };
            const comment = generateOptimizationComment(report);
            expect(comment).toContain('⚠');
            expect(comment).toContain('mysql_db.orders');
            expect(comment).toContain('OR');
        });

        it('should return warning comment for fallback_error', () => {
            const report: OptimizationReport = {
                tableName: 'mysql_db.orders',
                wasOptimized: false,
                reason: 'fallback_error',
            };
            const comment = generateOptimizationComment(report);
            expect(comment).toContain('⚠');
            expect(comment).toContain('mysql_db.orders');
        });
    });

    describe('generateOptimizationComments', () => {
        it('should filter out null comments', () => {
            const reports: OptimizationReport[] = [
                { tableName: 'local', wasOptimized: false, reason: 'local_table' },
                { tableName: 'mysql.orders', wasOptimized: false, reason: 'or_logic' },
                { tableName: 'mysql.users', wasOptimized: true, reason: 'success' },
            ];
            const comments = generateOptimizationComments(reports);
            expect(comments.length).toBe(1);
            expect(comments[0]).toContain('mysql.orders');
        });
    });

    describe('getReasonMessage', () => {
        it('should return Chinese message by default', () => {
            const msg = getReasonMessage('or_logic');
            expect(msg).toBe(REASON_MESSAGES_ZH['or_logic']);
        });

        it('should return English message when specified', () => {
            const msg = getReasonMessage('or_logic', 'en');
            expect(msg).toBe(REASON_MESSAGES_EN['or_logic']);
        });
    });

    describe('SHOULD_NOTIFY', () => {
        it('should not notify for success, no_filters, local_table', () => {
            expect(SHOULD_NOTIFY['success']).toBe(false);
            expect(SHOULD_NOTIFY['no_filters']).toBe(false);
            expect(SHOULD_NOTIFY['local_table']).toBe(false);
        });

        it('should notify for or_logic, expression_complex, multi_table_reference, fallback_error', () => {
            expect(SHOULD_NOTIFY['or_logic']).toBe(true);
            expect(SHOULD_NOTIFY['expression_complex']).toBe(true);
            expect(SHOULD_NOTIFY['multi_table_reference']).toBe(true);
            expect(SHOULD_NOTIFY['fallback_error']).toBe(true);
        });
    });
});

