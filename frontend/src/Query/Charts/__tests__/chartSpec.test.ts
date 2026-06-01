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
