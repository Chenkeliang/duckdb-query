import { describe, it, expect } from 'vitest';
import {
    buildPivotQueryPayload,
    canUseServerPivotPath,
    getPivotQueryKey,
    getInferenceContextKey,
    hasPendingValueCast,
    normalizeFiltersKey,
    shouldUseLocalPivotSql,
} from '../buildPivotQueryPayload';
import { AggregationFunction } from '@/types/pivotQuery';
import type { FilterConfig } from '@/types/pivotQuery';

describe('normalizeFiltersKey (cast 推断上下文键 / 缓存键共用口径)', () => {
    const f = (over: Partial<FilterConfig>): FilterConfig => ({
        column: 'grp', operator: '=', value: 'a', ...over,
    });

    it('值/算子不同 → 键不同(驱动重推 + 缓存失效;算子用后端真实支持的 = / >)', () => {
        expect(normalizeFiltersKey([f({ value: 'a' })]))
            .not.toEqual(normalizeFiltersKey([f({ value: 'b' })]));
        expect(normalizeFiltersKey([f({ operator: '=' })]))
            .not.toEqual(normalizeFiltersKey([f({ operator: '>' })]));
    });

    it('P1 回归:值含 ;:=: 分隔符时,单筛选 ≠ 两个筛选(旧 : / ; 拼接会碰撞)', () => {
        // 旧口径:单筛选 a="x;b:=:y" 与 两筛选 a="x" AND b="y" 同为 "a:=:x;b:=:y" → 碰撞
        const single = normalizeFiltersKey([{ column: 'a', operator: '=', value: 'x;b:=:y' }]);
        const doubled = normalizeFiltersKey([
            { column: 'a', operator: '=', value: 'x' },
            { column: 'b', operator: '=', value: 'y' },
        ]);
        expect(single).not.toEqual(doubled);
    });

    it('值类型不同(数字 1 vs 字符串 "1")→ 键不同(JSON 保类型)', () => {
        expect(normalizeFiltersKey([f({ value: 1 })]))
            .not.toEqual(normalizeFiltersKey([f({ value: '1' })]));
    });

    it('相同筛选 → 键稳定(不会无谓重推)', () => {
        expect(normalizeFiltersKey([f({})])).toEqual(normalizeFiltersKey([f({})]));
    });
});

describe('getInferenceContextKey (含表身份,防切同名异连接表沿用旧 cast)', () => {
    const duckdbTable = { name: 'orders', source: 'duckdb' as const };

    it('同表:筛选不同 → 键不同;筛选相同 → 键稳定', () => {
        const f1 = [{ column: 'region', operator: '=', value: 'A' }];
        const f2 = [{ column: 'region', operator: '=', value: 'B' }];
        expect(getInferenceContextKey(duckdbTable, f1))
            .not.toEqual(getInferenceContextKey(duckdbTable, f2));
        expect(getInferenceContextKey(duckdbTable, f1))
            .toEqual(getInferenceContextKey(duckdbTable, f1));
    });

    it('无表 → 空身份键仍稳定可比', () => {
        expect(getInferenceContextKey(null, [])).toEqual(getInferenceContextKey(null, []));
    });
});

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
        // 默认不带小计/总计/手选列值
        expect(payload?.pivotConfig.include_subtotals).toBeUndefined();
        expect(payload?.pivotConfig.include_grand_totals).toBeUndefined();
        expect(payload?.pivotConfig.manual_column_values).toBeUndefined();
    });

    it('threads subtotals / grand-totals / manual column values into pivotConfig', () => {
        const payload = buildPivotQueryPayload({
            table: duckdbTable,
            rows: ['region', 'city'],
            columns: ['year'],
            values: [{ column: 'amount', aggregation: AggregationFunction.SUM }],
            maxQueryRows: 500,
            pivotMaxColumns: 300,
            includeSubtotals: true,
            includeGrandTotals: true,
            manualColumnValues: ['2022', '2023'],
        });
        expect(payload?.pivotConfig.include_subtotals).toBe(true);
        expect(payload?.pivotConfig.include_grand_totals).toBe(true);
        expect(payload?.pivotConfig.manual_column_values).toEqual(['2022', '2023']);
    });

    it('omits empty manual column values (auto expansion)', () => {
        const payload = buildPivotQueryPayload({
            table: duckdbTable, rows: ['region'], columns: ['year'],
            values: [{ column: 'amount', aggregation: AggregationFunction.SUM }],
            maxQueryRows: 500, pivotMaxColumns: 300, manualColumnValues: [],
        });
        expect(payload?.pivotConfig.manual_column_values).toBeUndefined();
    });

    it('query key covers subtotals / grand-totals / manual values (else stale cache)', () => {
        const base = ['region']; const cols = ['year'];
        const vals = [{ column: 'amt', aggregation: AggregationFunction.SUM }];
        const k = (st?: boolean, gt?: boolean, mv?: string[]) =>
            getPivotQueryKey(duckdbTable, base, cols, vals, [], 500, 300, st, gt, mv);
        expect(k()).not.toEqual(k(true));
        expect(k()).not.toEqual(k(false, true));
        expect(k()).not.toEqual(k(false, false, ['2022']));
        expect(k(false, false, ['2022'])).not.toEqual(k(false, false, ['2022', '2023']));
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

    it('复审 P1:零透视列(普通聚合模式)走本地 GROUP BY,不发服务端(否则 Native PIVOT 报错)', () => {
        // 服务端只支持恰好 1 个透视列;0 列必须走本地,否则删了 local 回退后该模式彻底不可用
        expect(shouldUseLocalPivotSql([])).toBe(true);
        expect(shouldUseLocalPivotSql(['year'])).toBe(false); // 恰好 1 列才走服务端
        expect(buildPivotQueryPayload({
            table: duckdbTable,
            rows: ['region'],
            columns: [],
            values: [{ column: 'amount', aggregation: AggregationFunction.SUM }],
            maxQueryRows: 500,
            pivotMaxColumns: 300,
        })).toBeNull(); // 返回 null → PivotPanel 用 generateLocalSQL 出 GROUP BY
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
        // filterKey 现为 JSON 编码(防分隔符碰撞),含结构化的 region/=/APAC
        expect(keyWith.some((seg) => String(seg).includes('"region","=","APAC"'))).toBe(true);
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
