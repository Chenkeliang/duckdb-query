/**
 * Regression 2026-07-29: the cancellation toast rendered the raw
 * `query.cancelled` key because the common locale resources did not define it.
 */
import { describe, expect, it } from 'vitest';

import en from '../locales/en/common.json';
import zh from '../locales/zh/common.json';

describe('query cancellation i18n contract', () => {
  it('provides concise Chinese and English cancellation messages', () => {
    expect(zh.query.cancelled).toBe('查询已取消');
    expect(en.query.cancelled).toBe('Query cancelled');
  });
});
