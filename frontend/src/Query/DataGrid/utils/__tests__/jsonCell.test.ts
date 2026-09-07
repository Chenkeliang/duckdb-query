import { describe, expect, it } from 'vitest';
import {
  isJsonViewable,
  toFormattedJson,
  toRawJsonText,
  getJsonViewerText,
  listJsonPointerPaths,
  columnMostlyJson,
} from '../jsonCell';

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

  it('preserves JSON number tokens beyond JavaScript number precision', () => {
    const raw =
      '{"id":9007199254740993,"amount":1234567890.123456789,"exponent":1e100,"negativeZero":-0}';

    const formatted = toFormattedJson(raw);

    expect(formatted).toContain('9007199254740993');
    expect(formatted).toContain('1234567890.123456789');
    expect(formatted).toContain('1e100');
    expect(formatted).toContain('-0');
  });

  it('preserves duplicate keys when formatting JSON text', () => {
    const formatted = toFormattedJson('{"value":1,"value":2}');

    expect(formatted.match(/"value"/g)).toHaveLength(2);
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

describe('toRawJsonText', () => {
  it('returns the original JSON text byte-for-byte for copying', () => {
    const raw = ' {"id":9007199254740993,"value":1,"value":2}\n';

    expect(toRawJsonText(raw)).toBe(raw);
  });
});

describe('bounded JSON viewer text', () => {
  it('limits visible work while leaving the raw copy untouched', () => {
    const raw = `{"payload":"${'x'.repeat(100)}"}`;
    const viewer = getJsonViewerText(raw, 20);

    expect(viewer.text).toHaveLength(20);
    expect(viewer.truncated).toBe(true);
    expect(viewer.totalCharacters).toBe(raw.length);
    expect(toRawJsonText(raw)).toBe(raw);
  });
});

describe('JSON Pointer paths', () => {
  it('escapes empty, slash, tilde and array segments without dot ambiguity', () => {
    const paths = listJsonPointerPaths(
      '{"":{"a/b":{"~key":[{"x.y":1}]}}}'
    ).map((entry) => entry.pointer);

    expect(paths).toContain('/');
    expect(paths).toContain('//a~1b/~0key/0/x.y');
  });

  it('preserves duplicate key occurrences and obeys the entry budget', () => {
    const entries = listJsonPointerPaths('{"value":1,"value":2,"other":3}', 3);

    expect(entries).toHaveLength(3);
    expect(entries.filter((entry) => entry.pointer === '/value')).toHaveLength(2);
  });
});
