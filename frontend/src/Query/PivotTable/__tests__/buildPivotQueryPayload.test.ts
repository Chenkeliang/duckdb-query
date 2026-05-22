import { describe, it, expect } from 'vitest';
import {
    buildPivotQueryPayload,
    canUseServerPivotPath,
    shouldUseLocalPivotSql,
} from '../buildPivotQueryPayload';
import { AggregationFunction } from '@/types/visualQuery';

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
});
