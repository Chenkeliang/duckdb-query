import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  blockHeaderSortBriefly,
  shouldBlockHeaderSort,
} from '../columnResizeSortGuard';

describe('columnResizeSortGuard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks sort briefly after resize', () => {
    vi.useFakeTimers();
    expect(shouldBlockHeaderSort()).toBe(false);
    blockHeaderSortBriefly(200);
    expect(shouldBlockHeaderSort()).toBe(true);
    vi.advanceTimersByTime(199);
    expect(shouldBlockHeaderSort()).toBe(true);
    vi.advanceTimersByTime(2);
    expect(shouldBlockHeaderSort()).toBe(false);
  });
});
