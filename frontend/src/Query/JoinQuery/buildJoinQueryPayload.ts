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
import { toAttachDatabasesPayload } from '@/api';
import { generateConflictKey } from '@/utils/duckdbTypes';
import {
    cloneTreeWithoutOnConditions,
    generateFilterSQL,
    generateFilterSQLForSubquery,
    getOnConditionsTreeForTable,
    type FilterGroup,
} from './FilterBar';
import {
    buildJoinTableAliasMap,
    collectDuplicateAliases,
    remapFilterTreeTableNames,
} from './joinTableAliasUtils';

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
 * 是否可走服务端 `/api/query`（列模式 ON、无表达式 JOIN；WHERE 经 where_conditions 下发）。
 */
export function canUseServerJoinPath(
    activeTables: SelectedTable[],
    joinConfigs: JoinPanelJoinConfig[],
    _filterTree: FilterGroup,
    _attachDatabases: AttachDatabase[],
    tableAliasOverrides: Record<string, string> = {}
): boolean {
    if (activeTables.length < 2 || joinConfigs.length < activeTables.length - 1) {
        return false;
    }
    const tableNames = activeTables.map(getTableName);
    if (collectDuplicateAliases(tableNames, tableAliasOverrides).length > 0) {
        return false;
    }
    if (usesExpressionConditions(joinConfigs)) {
        return false;
    }
    return joinConfigs.every((config) =>
        config.conditions.some((c) => c.leftColumn?.trim() && c.rightColumn?.trim())
    );
}

function buildPushdownWhere(
    filterTree: FilterGroup,
    tableName: string
): string | undefined {
    const onTree = getOnConditionsTreeForTable(filterTree, tableName);
    if (onTree.children.length === 0) {
        return undefined;
    }
    const sql = generateFilterSQLForSubquery(onTree).trim();
    return sql || undefined;
}

/** Filter WHERE 列前缀：与后端 federated_source_sql_alias / joinTableAliasMap 一致 */
function buildFilterAliasMap(
    activeTables: SelectedTable[],
    tableAliasOverrides: Record<string, string>,
    attachDatabases: AttachDatabase[]
): Record<string, string> {
    const tableNames = activeTables.map(getTableName);
    const joinAliasMap = buildJoinTableAliasMap(tableNames, tableAliasOverrides);
    const attachAliasSet = new Set(attachDatabases.map((db) => db.alias));

    const map: Record<string, string> = {};
    activeTables.forEach((table) => {
        const name = getTableName(table);
        if (isExternalTable(table) && attachDatabases.length > 0) {
            const { qualifiedName } = generateExternalTableReference(table);
            const parts = qualifiedName.split('.').filter(Boolean);
            if (parts.length >= 2 && attachAliasSet.has(parts[0])) {
                map[name] = parts[parts.length - 1];
            } else {
                map[name] = parts[parts.length - 1] ?? name;
            }
        } else {
            map[name] = joinAliasMap[name] ?? name;
        }
    });
    return map;
}

function resolveSourceColumns(
    tableName: string,
    selectedColumns: Record<string, string[]>,
    tableColumnsMap: Record<string, { name: string }[]>
): { name: string }[] | undefined {
    const picked = selectedColumns[tableName];
    // 区分 undefined(该表未管理过列选择，如列信息尚未加载)与 []（用户显式取消全选）。
    // 与预览生成器(buildJoinPreviewSql)一致：空数组代表该表不贡献任何列，
    // 不能回退到全列，否则用户取消勾选的列会在服务端执行结果中原样出现。
    if (picked !== undefined) {
        return picked.map((name) => ({ name }));
    }
    const all = tableColumnsMap[tableName];
    if (all?.length) {
        return all.map((col) => ({ name: col.name }));
    }
    return undefined;
}

export function buildJoinQueryPayload(params: {
    activeTables: SelectedTable[];
    joinConfigs: JoinPanelJoinConfig[];
    filterTree: FilterGroup;
    resolvedTypes: Record<string, string>;
    maxQueryRows: number;
    isPreview?: boolean;
    attachDatabases?: AttachDatabase[];
    tableAliasOverrides?: Record<string, string>;
    selectedColumns?: Record<string, string[]>;
    tableColumnsMap?: Record<string, { name: string }[]>;
}): JoinQueryPerformRequest | null {
    const {
        activeTables,
        joinConfigs,
        filterTree,
        resolvedTypes,
        maxQueryRows,
        isPreview = true,
        attachDatabases = [],
        tableAliasOverrides = {},
        selectedColumns = {},
        tableColumnsMap = {},
    } = params;

    const attachForPayload = toAttachDatabasesPayload(attachDatabases);

    if (!canUseServerJoinPath(activeTables, joinConfigs, filterTree, attachDatabases, tableAliasOverrides)) {
        return null;
    }

    const tableNames = activeTables.map(getTableName);
    const aliasMap = buildJoinTableAliasMap(tableNames, tableAliasOverrides);

    const sources: JoinQueryDataSource[] = activeTables.map((table) => {
        const tableName = getTableName(table);
        const columns = resolveSourceColumns(
            tableName,
            selectedColumns,
            tableColumnsMap
        );
        const pushdownWhere = buildPushdownWhere(filterTree, tableName);
        const baseParams = (name: string) => ({
            table_name: name,
            ...(pushdownWhere ? { pushdown_where: pushdownWhere } : {}),
        });
        if (isExternalTable(table)) {
            const { qualifiedName } = generateExternalTableReference(table);
            return {
                id: qualifiedName,
                type: 'duckdb',
                table_name: qualifiedName,
                params: baseParams(qualifiedName),
                ...(columns ? { columns } : {}),
            };
        }
        return {
            id: tableName,
            type: 'duckdb',
            table_name: tableName,
            params: baseParams(tableName),
            ...(columns ? { columns } : {}),
        };
    });

    const joins: JoinQueryJoin[] = [];
    for (let i = 0; i < activeTables.length - 1; i++) {
        const config = joinConfigs[i];
        if (!config) {
            return null;
        }
        const leftTableName = getTableName(activeTables[i]);
        const rightTableName = getTableName(activeTables[i + 1]);
        const leftName = sources[i]?.id ?? leftTableName;
        const rightName = sources[i + 1]?.id ?? rightTableName;
        const conditions: JoinQueryCondition[] = config.conditions
            .filter((c) => c.leftColumn?.trim() && c.rightColumn?.trim())
            .map((c) => {
                // 冲突键必须与检测端(useTypeConflict,用纯表名)一致:外部表的 source id
                // 带联邦前缀(如 sqlite_alarm_sqlite.alerts),用它查 resolvedTypes 必然落空,
                // 用户在冲突对话框选好的转换会在服务端 payload 路径被静默丢弃
                const conflictKey = generateConflictKey(
                    leftTableName,
                    c.leftColumn,
                    rightTableName,
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
            alias_left: aliasMap[leftTableName] ?? leftTableName,
            alias_right: aliasMap[rightTableName] ?? rightTableName,
        });
    }

    const filterAliasMap = buildFilterAliasMap(
        activeTables,
        tableAliasOverrides,
        attachDatabases
    );
    const whereOnlyTree = cloneTreeWithoutOnConditions(filterTree);
    const whereClause = generateFilterSQL(
        remapFilterTreeTableNames(whereOnlyTree, filterAliasMap)
    );

    return {
        sources,
        joins,
        where_conditions: whereClause?.trim() || undefined,
        limit: maxQueryRows,
        is_preview: isPreview,
        attach_databases: attachForPayload,
    };
}
