import { describe, expect, it } from 'vitest';
import { combineChartValues, formatChartValue } from '../chartNumbers';
import { capCategories } from '../chartSpec';

describe('exact chart labels regression (2026-11-02)', () => {
  it('preserves huge integers, decimal scale and negative zero without Number conversion', () => {
    expect(formatChartValue('9007199254740993.123400', 'en')).toBe('9,007,199,254,740,993.123400');
    expect(formatChartValue('-0.0010', 'zh')).toBe('-0.0010');
    expect(formatChartValue(null)).toBe('—');
  });
  it('combines exact decimal other buckets and ignores NULL rather than treating it as zero', () => {
    expect(combineChartValues(['9007199254740993.1234', '0.0001', null], 'sum')).toBe('9007199254740993.1235');
    expect(combineChartValues(['9007199254740993', '9007199254740992'], 'min')).toBe('9007199254740992');
    expect(combineChartValues([null], 'min')).toBeNull();
    const points = [{ dim: 'first', v: '9999999999999999.0000' }, { dim: 'second', v: '9007199254740993.1234' }, { dim: 'third', v: '0.0001' }];
    expect(capCategories(points, ['v'], 'sum', 1)[1]?.v).toBe('9007199254740993.1235');
  });
});
