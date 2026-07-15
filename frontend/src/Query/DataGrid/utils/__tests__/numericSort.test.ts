import { describe, expect, it } from 'vitest';
import { compareNumericValues } from '../numericSort';

describe('compareNumericValues', () => {
  it('orders plain decimal strings numerically, not lexicographically', () => {
    expect(compareNumericValues('10.5', '9.2')).toBeGreaterThan(0);
    expect(compareNumericValues('0.1', '0.12')).toBeLessThan(0);
  });

  it('distinguishes adjacent integers beyond 2^53 where Number() ties', () => {
    expect(Number('9007199254740993')).toBe(Number('9007199254740992')); // 前提：Number 已失真
    expect(compareNumericValues('9007199254740993', '9007199254740992')).toBeGreaterThan(0);
    expect(compareNumericValues('202407150000000002', '202407150000000001')).toBeGreaterThan(0);
  });

  it('distinguishes high-precision decimals where float64 ties', () => {
    expect(compareNumericValues('0.1234567890123456789', '0.1234567890123456788')).toBeGreaterThan(0);
  });

  it('handles negatives, scale zeros, and signed zero', () => {
    expect(compareNumericValues('-0.30', '0.29')).toBeLessThan(0);
    expect(compareNumericValues('-10', '-9')).toBeLessThan(0);
    expect(compareNumericValues('1.50', '1.5')).toBe(0);
    expect(compareNumericValues('-0', '0')).toBe(0);
  });

  it('handles leading-zero codes from literal columns', () => {
    expect(compareNumericValues('007', '8')).toBeLessThan(0);
    expect(compareNumericValues('007', '7')).toBe(0);
  });

  it('mixes JS numbers and strings', () => {
    expect(compareNumericValues(13800138000, '202407150000000001')).toBeLessThan(0);
    expect(compareNumericValues('2.5e-3', '0.0026')).toBeLessThan(0); // 科学计数法回退 Number()
  });

  it('sorts empty values first and keeps them stable', () => {
    expect(compareNumericValues(null, '1')).toBeLessThan(0);
    expect(compareNumericValues('1', undefined)).toBeGreaterThan(0);
    expect(compareNumericValues(null, undefined)).toBe(0);
  });
});
