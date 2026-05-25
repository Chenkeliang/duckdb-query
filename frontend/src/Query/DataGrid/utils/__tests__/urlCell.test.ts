import { describe, expect, it } from 'vitest';
import { columnMostlyHttpUrls, looksLikeHttpUrl } from '../urlCell';

describe('urlCell', () => {
  it('detects http(s) URLs', () => {
    expect(looksLikeHttpUrl('https://example.com/a')).toBe(true);
    expect(looksLikeHttpUrl('http://foo.bar')).toBe(true);
    expect(looksLikeHttpUrl('not-a-url')).toBe(false);
  });

  it('marks column as URL when majority of values are links', () => {
    const data = [
      { link: 'https://a.com/1' },
      { link: 'https://b.com/2' },
      { link: 'plain text' },
    ];
    expect(columnMostlyHttpUrls(data, 'link', 3, 0.5)).toBe(true);
  });
});
