import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n/config.js';
import { ExplainButton } from '../ExplainButton';

describe('ExplainButton', () => {
  it('ready mode click triggers onExplain (not onOpenSettings)', () => {
    const onExplain = vi.fn();
    const onOpenSettings = vi.fn();
    render(<ExplainButton mode="ready" onExplain={onExplain} onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onExplain).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('guide mode click routes to settings (not explain)', () => {
    const onExplain = vi.fn();
    const onOpenSettings = vi.fn();
    render(<ExplainButton mode="guide" onExplain={onExplain} onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onExplain).not.toHaveBeenCalled();
  });

  it('loading disables the button', () => {
    render(<ExplainButton mode="ready" loading onExplain={vi.fn()} onOpenSettings={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
