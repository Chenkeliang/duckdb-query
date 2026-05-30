import { describe, it, expect } from 'vitest';
import { parseDuckDbErrorSuggestion } from '../sqlErrorHelper';

describe('parseDuckDbErrorSuggestion', () => {
  it('extracts column candidates from a Binder Error', () => {
    const msg =
      'Binder Error: Referenced column "order_idd" not found in FROM clause!\nCandidate bindings: "order_id"';
    expect(parseDuckDbErrorSuggestion(msg)).toEqual({
      kind: 'column',
      wrongName: 'order_idd',
      candidates: ['order_id'],
    });
  });

  it('extracts multiple column candidates', () => {
    const msg =
      'Binder Error: Referenced column "amt" not found in FROM clause!\nCandidate bindings: "amount", "amount_paid"';
    expect(parseDuckDbErrorSuggestion(msg)).toEqual({
      kind: 'column',
      wrongName: 'amt',
      candidates: ['amount', 'amount_paid'],
    });
  });

  it('extracts a table suggestion from a Catalog Error', () => {
    const msg =
      'Catalog Error: Table with name orderss does not exist!\nDid you mean "orders"?';
    expect(parseDuckDbErrorSuggestion(msg)).toEqual({
      kind: 'table',
      wrongName: 'orderss',
      candidates: ['orders'],
    });
  });

  it('returns null when there is no suggestion', () => {
    expect(parseDuckDbErrorSuggestion('Parser Error: syntax error at or near "FRMO"')).toBeNull();
    expect(parseDuckDbErrorSuggestion('')).toBeNull();
  });
});
