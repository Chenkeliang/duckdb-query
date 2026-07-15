import { describe, expect, it } from 'vitest';
import {
  averagePlainDecimals,
  sumPlainDecimals,
  toPlainDecimalText,
} from '../decimalMath';

describe('toPlainDecimalText', () => {
  it('accepts plain decimal strings and finite numbers', () => {
    expect(toPlainDecimalText('-0.30')).toBe('-0.30');
    expect(toPlainDecimalText('1,234.56')).toBe('1234.56');
    expect(toPlainDecimalText(42)).toBe('42');
  });

  it('rejects exponent floats, non-numeric text and non-finite values', () => {
    expect(toPlainDecimalText(1e21)).toBeNull();
    expect(toPlainDecimalText('1.38E12')).toBeNull();
    expect(toPlainDecimalText('abc')).toBeNull();
    expect(toPlainDecimalText(Infinity)).toBeNull();
    expect(toPlainDecimalText(null)).toBeNull();
  });
});

describe('sumPlainDecimals', () => {
  it('sums exactly beyond 2^53 where float fails', () => {
    expect(sumPlainDecimals(['9007199254740993', '1'])).toBe('9007199254740994');
    expect(sumPlainDecimals(['202407150000000001', '202407150000000002'])).toBe(
      '404814300000000003',
    );
  });

  it('sums mixed scales without float artifacts and keeps column scale', () => {
    expect(sumPlainDecimals(['0.1', '0.2'])).toBe('0.3');
    expect(sumPlainDecimals(['1.5', '2.25', '-0.30'])).toBe('3.45');
    expect(sumPlainDecimals(['9999.99', '0.10'])).toBe('10000.09');
  });

  it('sums high-precision decimals exactly', () => {
    expect(
      sumPlainDecimals(['0.1234567890123456789', '0.0000000000000000001']),
    ).toBe('0.1234567890123456790');
  });

  it('handles negatives crossing zero', () => {
    expect(sumPlainDecimals(['-1.50', '1.50'])).toBe('0.00');
  });
});

describe('averagePlainDecimals', () => {
  it('divides exactly terminating cases', () => {
    expect(averagePlainDecimals(['1', '2'])).toBe('1.5');
    expect(averagePlainDecimals(['0.1', '0.2'])).toBe('0.15');
  });

  it('rounds half-up at a controlled position for repeating fractions', () => {
    expect(averagePlainDecimals(['10', '0', '0'])).toBe('3.333333');
    expect(averagePlainDecimals(['0.2', '0.2', '0.2'], 4)).toBe('0.2');
  });

  it('handles negative averages', () => {
    expect(averagePlainDecimals(['-1', '-2'])).toBe('-1.5');
  });
});
