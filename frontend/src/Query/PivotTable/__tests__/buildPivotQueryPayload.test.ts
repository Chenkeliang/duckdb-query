import { describe, it, expect } from 'vitest';
import {
    buildPivotQueryPayload,
    canUseServerPivotPath,
    getPivotQueryKey,
    shouldUseLocalPivotSql,
} from '../buildPivotQueryPayload';
import { AggregationFunction } from '@/types/pivotQuery';

describe('buildPivotQueryPayload', () => {
    const duckdbTable = { name: 'sales', source: 'duckdb' as const };

    it('canUseServerPivotPath requires rows and values', () => {
        expect(canUseServerPivotPath(duckdbTable, ['region'], [])).toBe(false);
        expect(
            canUseServerPivotPath(duckdbTable, ['region'], [
                { column: 'amount', aggregation: AggregationFunction.SUM },
            ])
        ).toBe(true);
    });

    it('builds payload for duckdb table', () => {
        const payload = buildPivotQueryPayload({
            table: duckdbTable,
            rows: ['region'],
            columns: ['year'],
            values: [{ column: 'amount', aggregation: AggregationFunction.SUM }],
            maxQueryRows: 500,
        });
        expect(payload?.config.table_name).toBe('sales');
        expect(payload?.pivotConfig.rows).toEqual(['region']);
    });

    it('shouldUseLocalPivotSql when multiple column dimensions', () => {
        expect(shouldUseLocalPivotSql(['a', 'b'])).toBe(true);
        expect(buildPivotQueryPayload({
            table: duckdbTable,
            rows: ['region'],
            columns: ['a', 'b'],
            values: [{ column: 'amount', aggregation: AggregationFunction.SUM }],
            maxQueryRows: 100,
        })).toBeNull();
    });

    it('includes filters in config and query key', () => {
        const filters = [{ column: 'region', operator: '=', value: 'APAC' }];
        const payload = buildPivotQueryPayload({
            table: duckdbTable,
            rows: ['region'],
            columns: ['year'],
            values: [{ column: 'amount', aggregation: AggregationFunction.SUM }],
            maxQueryRows: 500,
            filters,
        });
        expect(payload?.config.filters).toEqual(filters);

        const keyWithout = getPivotQueryKey(duckdbTable, ['region'], ['year'], [
            { column: 'amount', aggregation: AggregationFunction.SUM },
        ]);
        const keyWith = getPivotQueryKey(
            duckdbTable,
            ['region'],
            ['year'],
            [{ column: 'amount', aggregation: AggregationFunction.SUM }],
            filters
        );
        expect(keyWith).not.toEqual(keyWithout);
        expect(keyWith[keyWith.length - 1]).toContain('region:=:APAC');
    });
});
