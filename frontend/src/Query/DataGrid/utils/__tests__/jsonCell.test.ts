import { describe, expect, it } from 'vitest';
import { isJsonViewable, toFormattedJson, columnMostlyJson } from '../jsonCell';

describe('isJsonViewable', () => {
  it('returns true for plain objects', () => {
    expect(isJsonViewable({ a: 1 })).toBe(true);
  });

  it('returns true for arrays', () => {
    expect(isJsonViewable([1, 2, 3])).toBe(true);
  });

  it('returns true for JSON object strings', () => {
    expect(isJsonViewable('{"key":"value"}')).toBe(true);
  });

  it('returns true for JSON array strings', () => {
    expect(isJsonViewable('[1, 2, 3]')).toBe(true);
  });

  it('returns false for plain strings', () => {
    expect(isJsonViewable('hello world')).toBe(false);
  });

  it('returns false for numeric strings', () => {
    expect(isJsonViewable('42')).toBe(false);
  });

  it('returns false for boolean strings', () => {
    expect(isJsonViewable('true')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isJsonViewable(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isJsonViewable(undefined)).toBe(false);
  });

  it('returns false for invalid JSON-like strings', () => {
    expect(isJsonViewable('{bad json}')).toBe(false);
  });

  it('returns false for numbers', () => {
    expect(isJsonViewable(42)).toBe(false);
  });
});

describe('toFormattedJson', () => {
  it('formats an object with indentation', () => {
    const result = toFormattedJson({ a: 1 });
    expect(result).toBe('{\n  "a": 1\n}');
  });

  it('parses and formats a JSON string', () => {
    const result = toFormattedJson('{"a":1}');
    expect(result).toBe('{\n  "a": 1\n}');
  });

  it('returns raw string for non-JSON strings', () => {
    expect(toFormattedJson('hello')).toBe('hello');
  });
});

describe('columnMostlyJson', () => {
  it('returns true when most values are JSON', () => {
    const data = [
      { col: '{"x":1}' },
      { col: '{"y":2}' },
      { col: 'plain text' },
    ];
    expect(columnMostlyJson(data, 'col', 3, 0.4)).toBe(true);
  });

  it('returns false when few values are JSON', () => {
    const data = [
      { col: 'plain' },
      { col: 'text' },
      { col: '{"x":1}' },
      { col: 'words' },
      { col: 'more' },
    ];
    expect(columnMostlyJson(data, 'col', 5, 0.4)).toBe(false);
  });

  it('returns false for empty data', () => {
    expect(columnMostlyJson([], 'col')).toBe(false);
  });
});
