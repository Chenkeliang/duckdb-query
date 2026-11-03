import { describe, expect, it } from 'vitest';
import { defaultSpec } from '../chartSpec';
import { chartRecommendations, chartResultSummary, chartSamples, plotAggregation, plotQueryRows } from '../chartRecommendations';

describe('chart defaults regression (2026-11-02)', () => {
  it('does not silently sum an identifier when another numeric field exists', () => {
    const spec = defaultSpec([{ name: 'order_id', type: 'BIGINT' }, { name: 'amount', type: 'DECIMAL(20,4)' }]);
    expect(spec.y).toEqual(['amount']);
    expect(spec.dataMode).toBe('rows');
  });

  it('does not default to constant or low-cardinality integer codes (2026-11-02 screenshot)', () => {
    const columns = [{ name: 'type', type: 'INTEGER' }, { name: 'level', type: 'TINYINT' }, { name: 'showcase_id', type: 'BIGINT' }, { name: 'amount', type: 'DECIMAL(20,4)' }];
    const rows = Array.from({ length: 100 }, (_, i) => ({ type: 3, level: i % 3, showcase_id: 9000 + i, amount: `${i}.2500` }));
    expect(defaultSpec(columns, rows).y).toEqual(['amount']);
    expect(defaultSpec(columns.slice(0, 3), rows).y).toEqual([]);
    expect(defaultSpec([{ name: 'total', type: 'DECIMAL(20,4)' }], [{ total: '3.0000' }]).y).toEqual(['total']);
  });

  it('sorts time points, excludes invalid dates and samples the whole range without changing source rows', () => {
    const spec = { type: 'line' as const, x: 'day', y: ['amount'], agg: 'sum' as const, dataMode: 'rows' as const };
    const valid = Array.from({ length: 300 }, (_, i) => ({ day: new Date(Date.UTC(2023, 0, i + 1)).toISOString(), amount: `${9007199254740993n + BigInt(i)}.0000` })).reverse();
    const rows = [{ day: null, amount: '1' }, ...valid, { day: 'bad-date', amount: '2' }];
    const original = [...rows];
    const plot = plotQueryRows(rows, spec, 'rows', true);
    expect(plot.data).toHaveLength(200);
    expect(plot.data[0].dim).toBe(valid[valid.length - 1].day);
    expect(plot.data[199].dim).toBe(valid[0].day);
    expect(plot.data[199].rawValues).toEqual({ value_0: valid[0].amount });
    expect(plot.excludedDates).toBe(2);
    expect(plot.omitted).toBe(100);
    expect(plot.timeSampled).toBe(true);
    expect(rows).toEqual(original);
  });

  it('does not silently aggregate duplicate timestamps', () => {
    const plot = plotQueryRows([{ day: '2023-10-20', amount: '1.0000' }, { day: '2023-10-20', amount: '2.0000' }],
      { type: 'line', x: 'day', y: ['amount'], agg: 'sum', dataMode: 'rows' }, 'rows', true);
    expect(plot.data).toHaveLength(2);
    expect(plot.duplicateDates).toBe(1);
    expect(plot.data.map((point) => point.rawValues)).toEqual([{ value_0: '1.0000' }, { value_0: '2.0000' }]);
  });

  it('does not reaggregate averages or coerce NULL/empty values to zero', () => {
    const spec = { ...defaultSpec([{ name: 'day', type: 'DATE' }, { name: 'avg_amount', type: 'DECIMAL(20,4)' }]), y: ['avg_amount'] };
    const rows = [{ day: '2026-01-01', avg_amount: '9007199254740993.1234' }, { day: '2026-01-01', avg_amount: null }, { day: '2026-01-02', avg_amount: '' }];
    const plot = plotQueryRows(rows, spec, 'rows');
    expect(plot.data).toHaveLength(3);
    expect(plot.data[0].rawValues).toEqual({ value_0: '9007199254740993.1234' });
    expect(plot.data[1].value_0).toBeNull();
    expect(plot.data[2].value_0).toBeNull();
  });

  it('distributes the five samples across the returned result and marks summaries as truncated', () => {
    const columns = [{ name: 'n', type: 'INTEGER' }];
    const rows = Array.from({ length: 21 }, (_, n) => ({ n }));
    expect(chartSamples(rows, columns).map((row) => row.n)).toEqual([0, 5, 10, 15, 20]);
    expect(chartResultSummary(columns, rows, true)).toMatchObject({ row_count: 21, truncated: true, columns: [{ distinct_count: 21, null_count: 0 }] });
  });

  it('does not recommend share charts for negative values or duplicate categories', () => {
    const columns = [{ name: 'region', type: 'VARCHAR' }, { name: 'amount', type: 'INTEGER' }];
    expect(chartRecommendations(columns, [{ region: 'a', amount: 2 }, { region: 'b', amount: -1 }], 'share')).toEqual([]);
    expect(chartRecommendations(columns, [{ region: 'a', amount: 2 }, { region: 'a', amount: 1 }], 'share')).toEqual([]);
    expect(chartRecommendations(columns, [{ region: 'a', amount: 2 }, { region: 'b', amount: 1 }], 'share')).toHaveLength(3);
  });

  it('retains explicit result-row counting for text-only or identifier-only results', () => {
    const category = chartRecommendations([{ name: 'category', type: 'VARCHAR' }], [{ category: 'a' }, { category: 'a' }], 'compare');
    expect(category[0].spec).toMatchObject({ dataMode: 'aggregate', agg: 'count', y: [] });
    const identifiers = chartRecommendations([{ name: 'order_id', type: 'BIGINT' }], [{ order_id: 1 }], 'metric');
    expect(identifiers[0].spec).toMatchObject({ type: 'kpi', dataMode: 'aggregate', agg: 'count', y: [] });
  });

  it('keeps the exact other bucket visible after the twelve pie categories', () => {
    const spec = { type: 'pie' as const, x: 'region', y: ['amount'], agg: 'sum' as const, dataMode: 'aggregate' as const };
    const plot = plotAggregation(Array.from({ length: 15 }, (_, i) => ({ dim: `r${i}`, m_0: `${i}.0000` })), spec, 'rows');
    expect(plot.data).toHaveLength(13);
    expect(plot.data[12]?.dim).toBe('其它');
    expect(plot.data[12]?.rawValues).toEqual({ value_0: '3.0000' });
  });

  it('keeps a real metric named dim separate from the chart dimension alias', () => {
    const plot = plotAggregation([{ dim: 'category-a', m_0: '9007199254740993.1234' }], { type: 'bar', x: 'category', y: ['dim'], agg: 'sum', dataMode: 'aggregate' }, 'rows');
    expect(plot.data[0].dim).toBe('category-a');
    expect(plot.data[0].rawValues).toEqual({ value_0: '9007199254740993.1234' });
    expect(plot.labels.value_0).toBe('dim');
  });
});
