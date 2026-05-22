import { describe, it, expect } from 'vitest';
import {
    buildJoinQueryPayload,
    canUseServerJoinPath,
} from '../buildJoinQueryPayload';
import { createEmptyGroup } from '../FilterBar';

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

    it('rejects federated attach path', () => {
        expect(
            canUseServerJoinPath(tables, joinConfigs, createEmptyGroup(), [
                { alias: 'mysql_db', connectionId: '1' },
            ])
        ).toBe(false);
    });
});
