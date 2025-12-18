import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const virtualizers = vi.hoisted(() => {
  const rowVirtualizer = {
    getVirtualItems: vi.fn(() => []),
    getTotalSize: vi.fn(() => 0),
    scrollToIndex: vi.fn(),
  };

  const columnVirtualizer = {
    getVirtualItems: vi.fn(() => []),
    getTotalSize: vi.fn(() => 0),
    scrollToIndex: vi.fn(),
    measure: vi.fn(),
  };

  return { rowVirtualizer, columnVirtualizer };
});

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: any) =>
    options?.horizontal ? virtualizers.columnVirtualizer : virtualizers.rowVirtualizer,
}));

import { useVirtualScroll } from '../useVirtualScroll';

describe('useVirtualScroll', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    virtualizers.columnVirtualizer.measure.mockClear();
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as any;
    globalThis.cancelAnimationFrame = vi.fn() as any;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
  });

  it('re-measures column virtualizer when column widths change', () => {
    const scrollEl = document.createElement('div');
    const scrollContainerRef = { current: scrollEl };

    const initialWidths = Array.from({ length: 60 }, () => 120);
    const { rerender } = renderHook(
      ({ columnWidths }) =>
        useVirtualScroll({
          rowCount: 0,
          columnCount: columnWidths.length,
          rowHeight: 32,
          columnWidths,
          enableColumnVirtualization: true,
          scrollContainerRef,
        }),
      { initialProps: { columnWidths: initialWidths } }
    );

    expect(virtualizers.columnVirtualizer.measure).toHaveBeenCalledTimes(1);

    const nextWidths = [...initialWidths];
    nextWidths[0] = 240;
    rerender({ columnWidths: nextWidths });

    expect(virtualizers.columnVirtualizer.measure).toHaveBeenCalledTimes(2);
  });
});

