import { describe, it, expect } from 'vitest';
import {
    buildJoinQueryPayload,
    canUseServerJoinPath,
} from '../buildJoinQueryPayload';
import { createEmptyGroup, createCondition } from '../FilterBar';

describe('buildJoinQueryPayload', () => {
    const tables = [
        { name: 'users', source: 'duckdb' as const },
        { name: 'orders', source: 'duckdb' as const },
    ];

    const joinConfigs = [
        {
            joinType: 'INNER JOIN' as const,
            conditions: [
                {
                    leftColumn: 'id',
                    rightColumn: 'user_id',
                    operator: '=' as const,
                },
            ],
        },
    ];

    it('canUseServerJoinPath returns true for simple duckdb join', () => {
        expect(
            canUseServerJoinPath(tables, joinConfigs, createEmptyGroup(), [])
        ).toBe(true);
    });

    it('buildJoinQueryPayload maps sources and joins', () => {
        const payload = buildJoinQueryPayload({
            activeTables: tables,
            joinConfigs,
            filterTree: createEmptyGroup(),
            resolvedTypes: {},
            maxQueryRows: 1000,
        });
        expect(payload).not.toBeNull();
        expect(payload?.sources).toHaveLength(2);
        expect(payload?.joins[0].join_type).toBe('inner');
        expect(payload?.joins[0].conditions[0].left_column).toBe('id');
    });

    it('includes pushdown_where for ON filters on federated sources', () => {
        const filterTree = createEmptyGroup();
        filterTree.children.push(
            createCondition(
                'orders',
                'update_time',
                '>=',
                '2026-05-20 00:00:00',
                undefined,
                'on'
            )
        );
        const externalTables = [
            {
                name: 'orders',
                source: 'external' as const,
                connection: { id: '1', name: 'prod', type: 'mysql' as const },
            },
            {
                name: 'users',
                source: 'external' as const,
                connection: { id: '1', name: 'prod', type: 'mysql' as const },
            },
        ];
        const payload = buildJoinQueryPayload({
            activeTables: externalTables,
            joinConfigs,
            filterTree,
            resolvedTypes: {},
            maxQueryRows: 100,
            attachDatabases: [{ alias: 'mysql_prod', connectionId: '1' }],
        });
        expect(payload?.sources[0].params?.pushdown_where).toBe(
            '"update_time" >= \'2026-05-20 00:00:00\''
        );
    });

    it('includes selected columns on sources when provided', () => {
        const payload = buildJoinQueryPayload({
            activeTables: tables,
            joinConfigs,
            filterTree: createEmptyGroup(),
            resolvedTypes: {},
            maxQueryRows: 1000,
            selectedColumns: { users: ['id', 'name'], orders: ['user_id'] },
        });
        expect(payload?.sources[0].columns).toEqual([{ name: 'id' }, { name: 'name' }]);
        expect(payload?.sources[1].columns).toEqual([{ name: 'user_id' }]);
    });

    it('allows federated attach path with qualified source ids', () => {
        const externalTables = [
            {
                name: 'orders',
                source: 'external' as const,
                connection: { id: '1', name: 'prod', type: 'mysql' as const },
            },
            {
                name: 'users',
                source: 'external' as const,
                connection: { id: '1', name: 'prod', type: 'mysql' as const },
            },
        ];
        const attach = [{ alias: 'mysql_prod', connectionId: '1' }];
        expect(
            canUseServerJoinPath(externalTables, joinConfigs, createEmptyGroup(), attach)
        ).toBe(true);
        const payload = buildJoinQueryPayload({
            activeTables: externalTables,
            joinConfigs,
            filterTree: createEmptyGroup(),
            resolvedTypes: {},
            maxQueryRows: 100,
            attachDatabases: attach,
        });
        expect(payload?.attach_databases?.length).toBe(1);
        expect(payload?.sources[0].id).toContain('.');
        expect(payload?.joins[0].alias_left).toBe('t1');
        expect(payload?.joins[0].alias_right).toBe('t2');
        expect(payload?.joins[0].alias_left).not.toContain('.');
    });
});

describe('resolvedTypes 键一致性(外部表回归)', () => {
    // 回归背景(2026-07): 冲突检测端用纯表名做键,payload 端曾用 source id
    // (外部表形如 sqlite_alarm_sqlite.alerts) —— 键不一致导致用户在冲突
    // 对话框选好的 TRY_CAST 在服务端路径被静默丢弃,执行时报 Conversion Error。
    it('external table cast resolved by plain table-name key reaches conditions', () => {
        const externalTables = [
            {
                name: 'alerts',
                source: 'external' as const,
                connection: { id: 'ALARM-SQLITE', name: 'ALARM-SQLITE', type: 'sqlite' as const },
            },
            { name: '粘贴数据_demo', source: 'duckdb' as const },
        ];
        const configs = [
            {
                joinType: 'LEFT JOIN' as const,
                conditions: [
                    { leftColumn: 'record_id', rightColumn: '列1名称', operator: '=' as const },
                ],
            },
        ];
        const payload = buildJoinQueryPayload({
            activeTables: externalTables,
            joinConfigs: configs,
            filterTree: createEmptyGroup(),
            // 检测端(useTypeConflict)保存的键:纯表名,小写
            resolvedTypes: { 'alerts.record_id::粘贴数据_demo.列1名称': 'VARCHAR' },
            maxQueryRows: 1000,
        });
        expect(payload).not.toBeNull();
        const cond = payload?.joins[0].conditions[0];
        expect(cond?.left_cast).toBe('VARCHAR');
        expect(cond?.right_cast).toBe('VARCHAR');
    });
});
