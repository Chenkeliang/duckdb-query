import { describe, expect, it } from 'vitest';

import { mapArrowType } from './wasmEngine';

describe('DuckDB-Wasm Arrow type mapping', () => {
  it.each([
    ['List<Float64>', 'ARRAY'],
    ['FixedSizeList[3]<Float32>', 'ARRAY'],
    ['Struct<{name: Utf8}>', 'STRUCT'],
    ['Struct<{tags: List<Utf8>}>', 'STRUCT'],
    ['Map<Utf8, Int32>', 'MAP'],
    ['Binary', 'BLOB'],
    ['Decimal[38, 2]', 'DECIMAL'],
  ])('maps %s to %s', (arrowType, expected) => {
    expect(mapArrowType(arrowType)).toBe(expected);
  });
});
