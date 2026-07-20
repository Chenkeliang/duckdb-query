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
            pivotMaxColumns: 300,
        });
        expect(payload?.config.table_name).toBe('sales');
        expect(payload?.pivotConfig.rows).toEqual(['region']);
    });

    it('passes typeConversion through so text columns can sum as numbers', () => {
        const payload = buildPivotQueryPayload({
            table: duckdbTable,
            rows: ['region'],
            columns: ['year'],
            values: [
                { column: 'amount_text', aggregation: AggregationFunction.SUM, typeConversion: 'DOUBLE' },
            ],
            maxQueryRows: 500,
            pivotMaxColumns: 300,
        });
        expect(payload?.pivotConfig.values[0].typeConversion).toBe('DOUBLE');
    });

    it('omits typeConversion when not set (numeric columns)', () => {
        const payload = buildPivotQueryPayload({
            table: duckdbTable,
            rows: ['region'],
            columns: ['year'],
            values: [{ column: 'amount', aggregation: AggregationFunction.SUM }],
            maxQueryRows: 500,
            pivotMaxColumns: 300,
        });
        expect(payload?.pivotConfig.values[0].typeConversion).toBeUndefined();
    });

    it('shouldUseLocalPivotSql when multiple column dimensions', () => {
        expect(shouldUseLocalPivotSql(['a', 'b'])).toBe(true);
        expect(buildPivotQueryPayload({
            table: duckdbTable,
            rows: ['region'],
            columns: ['a', 'b'],
            values: [{ column: 'amount', aggregation: AggregationFunction.SUM }],
            maxQueryRows: 100,
            pivotMaxColumns: 300,
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
            pivotMaxColumns: 300,
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
        // filterKey 现为倒数第二位(末位是 maxQueryRows)
        expect(keyWith.some((seg) => String(seg).includes('region:=:APAC'))).toBe(true);
    });

    it('query key covers typeConversion, connection and maxQueryRows', () => {
        const base = ['region'];
        const cols = ['year'];
        const plainVals = [{ column: 'amt', aggregation: AggregationFunction.SUM }];
        const castVals = [
            { column: 'amt', aggregation: AggregationFunction.SUM, typeConversion: 'DECIMAL(38,6)' },
        ];
        // typeConversion 不同 → 键不同(否则 staleTime 内返回未转换的旧 SQL)
        expect(getPivotQueryKey(duckdbTable, base, cols, plainVals, [], 500))
            .not.toEqual(getPivotQueryKey(duckdbTable, base, cols, castVals, [], 500));
        // maxQueryRows 不同 → 键不同(LIMIT 变了,SQL 不同)
        expect(getPivotQueryKey(duckdbTable, base, cols, plainVals, [], 500))
            .not.toEqual(getPivotQueryKey(duckdbTable, base, cols, plainVals, [], 1000));
    });
});
