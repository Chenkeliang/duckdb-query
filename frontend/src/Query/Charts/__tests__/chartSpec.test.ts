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
