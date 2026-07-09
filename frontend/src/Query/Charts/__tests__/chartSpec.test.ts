import { describe, it, expect } from 'vitest';
import { isNumericType, isDateType, classifyColumns } from '../chartSpec';

describe('isNumericType', () => {
  it('matches numeric DB types, not text/date', () => {
    ['int(11)', 'BIGINT', 'decimal(11,2)', 'double', 'float', 'tinyint(4)', 'numeric'].forEach((t) =>
      expect(isNumericType(t)).toBe(true),
    );
    ['varchar(191)', 'text', 'datetime', 'date', 'timestamp', 'boolean'].forEach((t) =>
      expect(isNumericType(t)).toBe(false),
    );
  });
});

describe('isDateType', () => {
  it('matches date/datetime/timestamp', () => {
    ['date', 'datetime', 'DATETIME', 'timestamp', 'TIMESTAMP WITH TIME ZONE'].forEach((t) =>
      expect(isDateType(t)).toBe(true),
    );
    ['int(11)', 'varchar(10)', 'time'].forEach((t) => expect(isDateType(t)).toBe(false));
  });
});

describe('classifyColumns', () => {
  it('splits into dims (text+date) / metrics (numeric) / dates', () => {
    const cols = [
      { name: 'category', type: 'varchar(50)' },
      { name: 'created_at', type: 'datetime' },
      { name: 'amount', type: 'decimal(11,2)' },
      { name: 'qty', type: 'int(11)' },
    ];
    const r = classifyColumns(cols);
    expect(r.metrics).toEqual(['amount', 'qty']);
    expect(r.dates).toEqual(['created_at']);
    expect(r.dims).toEqual(['category', 'created_at']);
  });
});

import { defaultSpec, validateSpec } from '../chartSpec';

describe('defaultSpec', () => {
  it('date dim -> line; first numeric as metric', () => {
    const s = defaultSpec([
      { name: 'created_at', type: 'datetime' },
      { name: 'amount', type: 'decimal(11,2)' },
    ]);
    expect(s.type).toBe('line');
    expect(s.x).toBe('created_at');
    expect(s.y).toEqual(['amount']);
    expect(s.agg).toBe('sum');
  });

  it('no date -> bar; no numeric -> count', () => {
    const s = defaultSpec([{ name: 'category', type: 'varchar(20)' }]);
    expect(s.type).toBe('bar');
    expect(s.x).toBe('category');
    expect(s.y).toEqual([]);
    expect(s.agg).toBe('count');
  });
});

describe('validateSpec', () => {
  const cols = [
    { name: 'category', type: 'varchar(20)' },
    { name: 'amount', type: 'decimal(11,2)' },
  ];
  it('keeps a valid spec', () => {
    const spec = { type: 'bar' as const, x: 'category', y: ['amount'], agg: 'sum' as const };
    expect(validateSpec(spec, cols)).toEqual(spec);
  });
  it('falls back to defaultSpec on hallucinated columns', () => {
    const bad = { type: 'bar' as const, x: 'nope', y: ['ghost'], agg: 'sum' as const };
    const r = validateSpec(bad, cols);
    expect(r.x).toBe('category');
  });
  it('falls back on illegal type/agg', () => {
    const bad = { type: 'spiral' as any, x: 'category', y: ['amount'], agg: 'wat' as any };
    const r = validateSpec(bad, cols);
    expect(['bar', 'line', 'area', 'pie', 'donut', 'kpi']).toContain(r.type);
    expect(['sum', 'count', 'avg', 'min', 'max']).toContain(r.agg);
  });
});

import { buildChartSql, stripTrailingLimit } from '../chartSpec';

describe('stripTrailingLimit', () => {
  it('removes trailing LIMIT / LIMIT OFFSET / trailing ;', () => {
    expect(stripTrailingLimit('SELECT * FROM t LIMIT 10000')).toBe('SELECT * FROM t');
    expect(stripTrailingLimit('SELECT * FROM t limit 50 offset 10')).toBe('SELECT * FROM t');
    expect(stripTrailingLimit('SELECT * FROM t;')).toBe('SELECT * FROM t');
    expect(stripTrailingLimit('SELECT * FROM t')).toBe('SELECT * FROM t');
  });
});

describe('buildChartSql', () => {
  it('wraps user SQL into a GROUP BY aggregation', () => {
    const sql = buildChartSql('SELECT * FROM orders LIMIT 10000', {
      type: 'bar', x: 'status', y: ['amount'], agg: 'sum',
    });
    expect(sql).toContain('FROM (SELECT * FROM orders) AS _src');
    expect(sql).toContain('"status" AS dim');
    expect(sql).toMatch(/sum\("amount"\) AS m_0/);
    expect(sql).toContain('GROUP BY 1');
    expect(sql).toMatch(/LIMIT 200\s*$/);
  });

  it('date x uses date_trunc bin', () => {
    const sql = buildChartSql('SELECT * FROM t', {
      type: 'line', x: 'created_at', y: ['amount'], agg: 'sum', xBin: 'month',
    });
    expect(sql).toContain(`date_trunc('month', "created_at") AS dim`);
  });

  it('no y -> count(*)', () => {
    const sql = buildChartSql('SELECT * FROM t', { type: 'bar', x: 'status', y: [], agg: 'count' });
    expect(sql).toContain('count(*) AS m_0');
  });

  it('kpi -> single metric, no group by', () => {
    const sql = buildChartSql('SELECT * FROM t', { type: 'kpi', x: null, y: ['amount'], agg: 'sum' });
    expect(sql).toContain('sum("amount") AS metric');
    expect(sql).not.toContain('GROUP BY');
  });

  it('non-numeric y is TRY_CAST to DOUBLE for sum/avg/min/max', () => {
    const columns = [{ name: 'status', type: 'VARCHAR' }, { name: 'price_str', type: 'VARCHAR' }];
    const sql = buildChartSql('SELECT * FROM t', { type: 'bar', x: 'status', y: ['price_str'], agg: 'sum' }, columns);
    expect(sql).toContain('sum(TRY_CAST("price_str" AS DOUBLE)) AS m_0');
  });

  it('count on non-numeric y counts the raw column (no cast)', () => {
    const columns = [{ name: 'status', type: 'VARCHAR' }, { name: 'note', type: 'VARCHAR' }];
    const sql = buildChartSql('SELECT * FROM t', { type: 'bar', x: 'status', y: ['note'], agg: 'count' }, columns);
    expect(sql).toContain('count("note") AS m_0');
    expect(sql).not.toContain('TRY_CAST');
  });

  it('numeric y stays uncast when columns provided', () => {
    const columns = [{ name: 'status', type: 'VARCHAR' }, { name: 'amount', type: 'DOUBLE' }];
    const sql = buildChartSql('SELECT * FROM t', { type: 'bar', x: 'status', y: ['amount'], agg: 'sum' }, columns);
    expect(sql).toContain('sum("amount") AS m_0');
    expect(sql).not.toContain('TRY_CAST');
  });

  it('kpi non-numeric y also casts', () => {
    const columns = [{ name: 'price_str', type: 'VARCHAR' }];
    const sql = buildChartSql('SELECT * FROM t', { type: 'kpi', x: null, y: ['price_str'], agg: 'avg' }, columns);
    expect(sql).toContain('avg(TRY_CAST("price_str" AS DOUBLE)) AS metric');
  });
});

import { aggregateRows } from '../chartSpec';

describe('aggregateRows', () => {
  const rows = [
    { status: 'paid', amount: 10 },
    { status: 'paid', amount: 30 },
    { status: 'new', amount: 5 },
  ];
  it('groups by x and sums each metric -> recharts data', () => {
    const r = aggregateRows(rows, { type: 'bar', x: 'status', y: ['amount'], agg: 'sum' });
    expect(r.metricKeys).toEqual(['amount']);
    const paid = r.data.find((d) => d.dim === 'paid');
    expect(paid?.amount).toBe(40);
  });
  it('no y -> count', () => {
    const r = aggregateRows(rows, { type: 'bar', x: 'status', y: [], agg: 'count' });
    expect(r.metricKeys).toEqual(['count']);
    expect(r.data.find((d) => d.dim === 'paid')?.count).toBe(2);
  });
  it('kpi -> single value', () => {
    const r = aggregateRows(rows, { type: 'kpi', x: null, y: ['amount'], agg: 'sum' });
    expect(r.kpi).toBe(45);
  });
  it('caps to Top-200 by total metric, merging the rest into 其它', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ status: `s${i}`, amount: i }));
    const r = aggregateRows(many, { type: 'bar', x: 'status', y: ['amount'], agg: 'sum' });
    expect(r.data.length).toBeLessThanOrEqual(201);
    expect(r.data.some((d) => d.dim === '其它')).toBe(true);
  });
});

describe('hardening fixes (review)', () => {
  it('isNumericType matches DuckDB unsigned/hugeint/intN', () => {
    ['ubigint', 'hugeint', 'utinyint', 'uinteger', 'int4', 'int8'].forEach((t) =>
      expect(isNumericType(t)).toBe(true),
    );
    expect(isNumericType('interval')).toBe(false);
  });

  it('buildChartSql escapes double-quotes in column names (no injection)', () => {
    const sql = buildChartSql('SELECT * FROM t', { type: 'bar', x: 'a"b', y: ['c"--'], agg: 'sum' });
    expect(sql).toContain('"a""b"');
    expect(sql).toContain('sum("c""--")');
  });

  it('buildChartSql with null x (non-kpi) uses a constant bucket, not "null"', () => {
    const sql = buildChartSql('SELECT * FROM t', { type: 'bar', x: null, y: ['amount'], agg: 'sum' });
    expect(sql).toContain(`'全部' AS dim`);
    expect(sql).not.toContain('"null"');
  });

  it('validateSpec rejects illegal xBin -> fallback', () => {
    const cols = [{ name: 'd', type: 'datetime' }, { name: 'amount', type: 'int' }];
    const r = validateSpec({ type: 'line', x: 'd', y: ['amount'], agg: 'sum', xBin: 'week' as any }, cols);
    expect(['day', 'month', null, undefined]).toContain(r.xBin ?? null);
  });

  it('coerces pie/donut on a date dimension to line (no pie of dates)', () => {
    const cols = [{ name: 'create_time', type: 'datetime' }, { name: 'payment', type: 'decimal(11,2)' }];
    const r = validateSpec({ type: 'pie', x: 'create_time', y: ['payment'], agg: 'sum', xBin: 'day' }, cols);
    expect(r.type).toBe('line');
    const r2 = validateSpec({ type: 'donut', x: 'create_time', y: ['payment'], agg: 'sum' }, cols);
    expect(r2.type).toBe('line');
    // 非日期维度的饼图保留
    const r3 = validateSpec({ type: 'pie', x: 'payment', y: ['payment'], agg: 'sum' } as any, [{ name: 'payment', type: 'varchar(10)' }]);
    expect(r3.type).toBe('pie');
  });

  it('其它 bucket uses correct combiner: min -> min of rest, avg -> dropped', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ status: `s${i}`, amount: i }));
    const rmin = aggregateRows(many, { type: 'bar', x: 'status', y: ['amount'], agg: 'min' });
    const other = rmin.data.find((d) => d.dim === '其它');
    // rest = 行尾的小值组,min 应是它们里的最小(而非求和)
    expect(other && Number(other.amount)).toBeLessThan(50);
    const ravg = aggregateRows(many, { type: 'bar', x: 'status', y: ['amount'], agg: 'avg' });
    expect(ravg.data.some((d) => d.dim === '其它')).toBe(false); // avg 不合并其它
  });

  it('pie/donut caps categories to 12 + 其它 (date-many unusable fix)', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ d: `c${i}`, v: i + 1 }));
    const r = aggregateRows(many, { type: 'pie', x: 'd', y: ['v'], agg: 'sum' });
    expect(r.data.length).toBeLessThanOrEqual(13);
    expect(r.data.some((x) => x.dim === '其它')).toBe(true);
    // 柱状仍用 200 上限(40 个不触顶)
    const rbar = aggregateRows(many, { type: 'bar', x: 'd', y: ['v'], agg: 'sum' });
    expect(rbar.data.length).toBe(40);
  });
});

import { buildDrilldownSql } from '../chartSpec';

describe('buildDrilldownSql', () => {
  const catSpec = { type: 'bar' as const, x: 'region', y: ['amount'], agg: 'sum' as const };

  it('categorical value -> equality filter, wraps source and strips trailing LIMIT', () => {
    const sql = buildDrilldownSql(catSpec, '华东', 'SELECT * FROM demo_sales LIMIT 10000');
    expect(sql).toBe(`SELECT * FROM (SELECT * FROM demo_sales) AS _src WHERE "region" = '华东' LIMIT 500`);
  });

  it('escapes single quotes in the clicked value', () => {
    const sql = buildDrilldownSql(catSpec, "O'Brien", 'SELECT * FROM t');
    expect(sql).toContain(`"region" = 'O''Brien'`);
  });

  it('month bin: server date_trunc form (e.g. "2026-03-01 00:00:00")', () => {
    const spec = { type: 'line' as const, x: 'order_date', y: ['amount'], agg: 'sum' as const, xBin: 'month' as const };
    const sql = buildDrilldownSql(spec, '2026-03-01 00:00:00', 'SELECT * FROM t');
    expect(sql).toContain(`"order_date" >= DATE '2026-03-01' AND "order_date" < DATE '2026-04-01'`);
  });

  it('month bin: client binDim truncated form (e.g. "2025-12"), handles year rollover', () => {
    const spec = { type: 'line' as const, x: 'order_date', y: ['amount'], agg: 'sum' as const, xBin: 'month' as const };
    const sql = buildDrilldownSql(spec, '2025-12', 'SELECT * FROM t');
    expect(sql).toContain(`"order_date" >= DATE '2025-12-01' AND "order_date" < DATE '2026-01-01'`);
  });

  it('day bin: half-open range from a plain date string', () => {
    const spec = { type: 'bar' as const, x: 'order_date', y: ['amount'], agg: 'sum' as const, xBin: 'day' as const };
    const sql = buildDrilldownSql(spec, '2026-03-15', 'SELECT * FROM t');
    expect(sql).toContain(`"order_date" >= DATE '2026-03-15' AND "order_date" < DATE '2026-03-16'`);
  });

  it("'∅' bucket -> IS NULL", () => {
    const sql = buildDrilldownSql(catSpec, '∅', 'SELECT * FROM t');
    expect(sql).toContain(`"region" IS NULL`);
  });

  it("'其它' and '全部' buckets are not drillable", () => {
    expect(buildDrilldownSql(catSpec, '其它', 'SELECT * FROM t')).toBeNull();
    expect(buildDrilldownSql(catSpec, '全部', 'SELECT * FROM t')).toBeNull();
  });

  it('kpi type is not drillable', () => {
    const spec = { type: 'kpi' as const, x: null, y: ['amount'], agg: 'sum' as const };
    expect(buildDrilldownSql(spec, 'anything', 'SELECT * FROM t')).toBeNull();
  });

  it('null sourceSql is not drillable', () => {
    expect(buildDrilldownSql(catSpec, '华东', null)).toBeNull();
  });

  it('no x dimension is not drillable', () => {
    const spec = { type: 'bar' as const, x: null, y: ['amount'], agg: 'sum' as const };
    expect(buildDrilldownSql(spec, '全部', 'SELECT * FROM t')).toBeNull();
  });

  it('re-drilling the same bucket on an already-drilled source does not nest again', () => {
    const first = buildDrilldownSql(catSpec, '华东', 'SELECT * FROM t')!;
    const second = buildDrilldownSql(catSpec, '华东', first);
    expect(second).toBe(first);
    // 不同条件仍然正常嵌套(继续缩小范围)
    const third = buildDrilldownSql(catSpec, '华南', first)!;
    expect(third).toContain(`WHERE "region" = '华南' LIMIT 500`);
    expect(third).toContain(`"region" = '华东'`);
  });
});
