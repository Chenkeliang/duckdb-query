/**
 * 将 Join 工作台状态映射为 POST /api/query 请求体（DuckDB 本地表场景）。
 */

import type {
    JoinQueryCondition,
    JoinQueryDataSource,
    JoinQueryJoin,
    JoinQueryPerformRequest,
} from '@/api';
import type { AttachDatabase } from '@/utils/sqlUtils';
import type { SelectedTable } from '@/types/SelectedTable';
import { getTableName, isExternalTable } from '@/utils/tableUtils';
import { generateExternalTableReference } from '@/utils/sqlUtils';
import { generateConflictKey } from '@/utils/duckdbTypes';
import {
    cloneTreeWithoutOnConditions,
    generateFilterSQL,
    type FilterGroup,
} from './FilterBar';

export type JoinPanelJoinType =
    | 'INNER JOIN'
    | 'LEFT JOIN'
    | 'RIGHT JOIN'
    | 'FULL JOIN';

export interface JoinPanelCondition {
    leftColumn: string;
    rightColumn: string;
    leftMode?: 'column' | 'expression';
    rightMode?: 'column' | 'expression';
    leftExpression?: string;
    rightExpression?: string;
    operator: '=' | '!=' | '<' | '>' | '<=' | '>=';
}

export interface JoinPanelJoinConfig {
    joinType: JoinPanelJoinType;
    conditions: JoinPanelCondition[];
}

const JOIN_TYPE_MAP: Record<JoinPanelJoinType, string> = {
    'INNER JOIN': 'inner',
    'LEFT JOIN': 'left',
    'RIGHT JOIN': 'right',
    'FULL JOIN': 'full_outer',
};

function mapJoinType(joinType: JoinPanelJoinType): string {
    return JOIN_TYPE_MAP[joinType] ?? 'inner';
}

function hasWhereFilters(filterTree: FilterGroup): boolean {
    const whereOnly = cloneTreeWithoutOnConditions(filterTree);
    const clause = generateFilterSQL(whereOnly);
    return Boolean(clause?.trim());
}

function usesExpressionConditions(configs: JoinPanelJoinConfig[]): boolean {
    return configs.some((config) =>
        config.conditions.some(
            (c) =>
                c.leftMode === 'expression' ||
                c.rightMode === 'expression' ||
                Boolean(c.leftExpression?.trim()) ||
                Boolean(c.rightExpression?.trim())
        )
    );
}

/**
 * 是否可走服务端 `/api/query`（仅 DuckDB 已注册表、列模式 ON、无 WHERE 筛选树）。
 */
export function canUseServerJoinPath(
    activeTables: SelectedTable[],
    joinConfigs: JoinPanelJoinConfig[],
    filterTree: FilterGroup,
    _attachDatabases: AttachDatabase[]
): boolean {
    if (activeTables.length < 2 || joinConfigs.length < activeTables.length - 1) {
        return false;
    }
    if (hasWhereFilters(filterTree)) {
        return false;
    }
    if (usesExpressionConditions(joinConfigs)) {
        return false;
    }
    return joinConfigs.every((config) =>
        config.conditions.some((c) => c.leftColumn?.trim() && c.rightColumn?.trim())
    );
}

export function buildJoinQueryPayload(params: {
    activeTables: SelectedTable[];
    joinConfigs: JoinPanelJoinConfig[];
    filterTree: FilterGroup;
    resolvedTypes: Record<string, string>;
    maxQueryRows: number;
    isPreview?: boolean;
    attachDatabases?: AttachDatabase[];
}): JoinQueryPerformRequest | null {
    const {
        activeTables,
        joinConfigs,
        filterTree,
        resolvedTypes,
        maxQueryRows,
        isPreview = true,
        attachDatabases = [],
    } = params;

    const attachForPayload = attachDatabases.map((db) => ({
        alias: db.alias,
        connection_id: db.connectionId,
    }));

    if (!canUseServerJoinPath(activeTables, joinConfigs, filterTree, attachDatabases)) {
        return null;
    }

    const sources: JoinQueryDataSource[] = activeTables.map((table) => {
        if (isExternalTable(table)) {
            const { qualifiedName } = generateExternalTableReference(table);
            return {
                id: qualifiedName,
                type: 'duckdb',
                table_name: qualifiedName,
                params: { table_name: qualifiedName },
            };
        }
        const tableName = getTableName(table);
        return {
            id: tableName,
            type: 'duckdb',
            table_name: tableName,
            params: { table_name: tableName },
        };
    });

    const joins: JoinQueryJoin[] = [];
    for (let i = 0; i < activeTables.length - 1; i++) {
        const config = joinConfigs[i];
        if (!config) {
            return null;
        }
        const leftName = sources[i]?.id ?? getTableName(activeTables[i]);
        const rightName = sources[i + 1]?.id ?? getTableName(activeTables[i + 1]);
        const conditions: JoinQueryCondition[] = config.conditions
            .filter((c) => c.leftColumn?.trim() && c.rightColumn?.trim())
            .map((c) => {
                const conflictKey = generateConflictKey(
                    leftName,
                    c.leftColumn,
                    rightName,
                    c.rightColumn
                );
                const cast = resolvedTypes[conflictKey];
                return {
                    left_column: c.leftColumn,
                    right_column: c.rightColumn,
                    operator: c.operator,
                    ...(cast ? { left_cast: cast, right_cast: cast } : {}),
                };
            });
        if (conditions.length === 0) {
            return null;
        }
        joins.push({
            left_source_id: leftName,
            right_source_id: rightName,
            join_type: mapJoinType(config.joinType),
            conditions,
        });
    }

    const whereOnlyTree = cloneTreeWithoutOnConditions(filterTree);
    const whereClause = generateFilterSQL(whereOnlyTree);

    return {
        sources,
        joins,
        where_conditions: whereClause?.trim() || undefined,
        limit: maxQueryRows,
        is_preview: isPreview,
        attach_databases: attachForPayload.length > 0 ? attachForPayload : undefined,
    };
}
