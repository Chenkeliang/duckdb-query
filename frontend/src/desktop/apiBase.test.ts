import { describe, it, expect, beforeEach } from 'vitest';
import { resolveBaseUrl } from './apiBase';

describe('resolveBaseUrl', () => {
  beforeEach(() => {
    delete (window as any).__API_BASE__;
  });

  it('returns injected __API_BASE__ when it starts with http', () => {
    (window as any).__API_BASE__ = 'http://127.0.0.1:51234';
    expect(resolveBaseUrl('')).toBe('http://127.0.0.1:51234');
  });

  it('injected value wins over env value', () => {
    (window as any).__API_BASE__ = 'http://127.0.0.1:51234';
    expect(resolveBaseUrl('http://localhost:8000')).toBe('http://127.0.0.1:51234');
  });

  it('falls back to env value when __API_BASE__ is absent', () => {
    expect(resolveBaseUrl('http://localhost:8000')).toBe('http://localhost:8000');
  });

  it('returns empty string when neither is set', () => {
    expect(resolveBaseUrl('')).toBe('');
  });

  it('ignores __API_BASE__ that does not start with http', () => {
    (window as any).__API_BASE__ = 'ftp://bad-value';
    expect(resolveBaseUrl('http://localhost:8000')).toBe('http://localhost:8000');
  });

  it('ignores __API_BASE__ when it is not a string', () => {
    (window as any).__API_BASE__ = 42;
    expect(resolveBaseUrl('http://localhost:8000')).toBe('http://localhost:8000');
  });
});
