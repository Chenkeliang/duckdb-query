import { describe, it, expect } from 'vitest';
import {
    buildPivotQueryPayload,
    canUseServerPivotPath,
    getPivotQueryKey,
    hasPendingValueCast,
    shouldUseLocalPivotSql,
} from '../buildPivotQueryPayload';
import { AggregationFunction } from '@/types/pivotQuery';

describe('pending value cast blocks generation', () => {
    const duckdbTable = { name: 'sales', source: 'duckdb' as const };

    it('hasPendingValueCast flags pending/unsafe values', () => {
        expect(hasPendingValueCast([{ column: 'a', aggregation: AggregationFunction.SUM }])).toBe(false);
        expect(hasPendingValueCast([{ column: 'a', aggregation: AggregationFunction.SUM, castStatus: 'pending' }])).toBe(true);
        expect(hasPendingValueCast([{ column: 'a', aggregation: AggregationFunction.SUM, castStatus: 'unsafe' }])).toBe(true);
    });

    it('canUseServerPivotPath is false while a value cast is pending/unsafe', () => {
        expect(canUseServerPivotPath(duckdbTable, ['region'], [
            { column: 'amt', aggregation: AggregationFunction.SUM, castStatus: 'pending' },
        ])).toBe(false);
    });

    it('buildPivotQueryPayload returns null while a value cast is pending', () => {
        expect(buildPivotQueryPayload({
            table: duckdbTable,
            rows: ['region'],
            columns: ['year'],
            values: [{ column: 'amt', aggregation: AggregationFunction.SUM, castStatus: 'unsafe' }],
            maxQueryRows: 500,
            pivotMaxColumns: 300,
        })).toBeNull();
    });
});

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
        // pivotMaxColumns(=column_value_limit)不同 → 键不同(影响请求体/生成 SQL)
        expect(getPivotQueryKey(duckdbTable, base, cols, plainVals, [], 500, 300))
            .not.toEqual(getPivotQueryKey(duckdbTable, base, cols, plainVals, [], 500, 500));
    });
});
