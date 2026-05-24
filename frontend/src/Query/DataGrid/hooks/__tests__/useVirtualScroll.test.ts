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

const useVirtualizerMock = vi.fn((options: { horizontal?: boolean }) =>
  options?.horizontal ? virtualizers.columnVirtualizer : virtualizers.rowVirtualizer
);

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { horizontal?: boolean }) => useVirtualizerMock(options),
}));

import { useVirtualScroll } from '../useVirtualScroll';

describe('useVirtualScroll', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    useVirtualizerMock.mockClear();
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

  it('always invokes column useVirtualizer even when below threshold (hooks stability)', () => {
    const scrollEl = document.createElement('div');
    const scrollContainerRef = { current: scrollEl };

    renderHook(() =>
      useVirtualScroll({
        rowCount: 1,
        columnCount: 10,
        rowHeight: 32,
        enableColumnVirtualization: false,
        scrollContainerRef,
      })
    );

    expect(useVirtualizerMock).toHaveBeenCalledTimes(2);
    expect(useVirtualizerMock.mock.calls.some((call) => call[0]?.horizontal === true)).toBe(
      true
    );
  });

  it('survives rerender when column count crosses virtualization threshold', () => {
    const scrollEl = document.createElement('div');
    const scrollContainerRef = { current: scrollEl };

    const { rerender } = renderHook(
      ({ columnCount }: { columnCount: number }) =>
        useVirtualScroll({
          rowCount: 5,
          columnCount,
          rowHeight: 32,
          scrollContainerRef,
        }),
      { initialProps: { columnCount: 10 } }
    );

    rerender({ columnCount: 60 });

    const horizontalCalls = useVirtualizerMock.mock.calls.filter(
      (call) => call[0]?.horizontal === true
    );
    expect(horizontalCalls.length).toBeGreaterThanOrEqual(2);
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

