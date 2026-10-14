/** 2026-10-10: percentage-only sidebar bounds clipped controls at 1087px. */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExplorerPanel } from '../ExplorerPanel';

const state = vi.hoisted(() => ({
  width: 1030,
  resize: () => {},
  observe: vi.fn(),
  disconnect: vi.fn(),
  constraints: {} as { minSize: number; maxSize: number; collapsedSize: number },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-resizable-panels', async () => {
  const React = await import('react');
  return {
    getPanelGroupElement: () => ({ getBoundingClientRect: () => ({ width: state.width }) }),
    Panel: React.forwardRef((props: { children: React.ReactNode; minSize: number; maxSize: number; collapsedSize: number }, _ref) => {
      state.constraints = props;
      return <div>{props.children}</div>;
    }),
  };
});

beforeEach(() => {
  state.width = 1030;
  state.observe.mockClear();
  state.disconnect.mockClear();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { state.resize = callback; }
    observe = state.observe;
    disconnect = state.disconnect;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ExplorerPanel workspace sizing', () => {
  it('keeps desktop minimum, maximum and collapsed widths in pixels when the workspace changes', () => {
    render(<ExplorerPanel collapsed={false} onCollapse={() => {}} onExpand={() => {}} onToggle={() => {}}><input /></ExplorerPanel>);
    for (const width of [1030, 1383, 2500]) {
      act(() => { state.width = width; state.resize(); });
      expect(state.constraints.minSize * width / 100).toBeCloseTo(220);
      expect(state.constraints.maxSize * width / 100).toBeCloseTo(420);
      expect(state.constraints.collapsedSize * width / 100).toBeCloseTo(36);
    }
    expect(state.observe).toHaveBeenCalledTimes(1);
  });

  it('does not replace the last measurable bounds when navigation hides the workspace', () => {
    const view = render(<ExplorerPanel collapsed={false} onCollapse={() => {}} onExpand={() => {}} onToggle={() => {}}>tree</ExplorerPanel>);
    const before = state.constraints;
    act(() => { state.width = 0; state.resize(); });
    expect(state.constraints).toBe(before);
    view.unmount();
    expect(state.disconnect).toHaveBeenCalledTimes(1);
  });
});
