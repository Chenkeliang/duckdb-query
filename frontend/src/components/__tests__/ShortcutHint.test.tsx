/** Regression 2026-10-13: platform modifiers and Return must remain readable in both toolbar hints. */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShortcutHint } from '../ShortcutHint';
afterEach(() => vi.restoreAllMocks());
describe('toolbar shortcut hints', () => {
  it('separates macOS modifiers and names the Return key, including customized shortcuts', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    render(<><ShortcutHint shortcut="Cmd+Enter" /><ShortcutHint shortcut="Cmd+L" /><ShortcutHint shortcut="Cmd+Shift+K" /></>);
    expect(screen.getByText('⌘ Return')).toBeInTheDocument();
    expect(screen.getByText('⌘ L')).toBeInTheDocument();
    expect(screen.getByText('⌘ ⇧ K')).toBeInTheDocument();
  });
  it('preserves Ctrl key labels on non-Mac platforms', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    render(<ShortcutHint shortcut="Cmd+Enter" />);
    expect(screen.getByText('Ctrl+Enter')).toBeInTheDocument();
  });
});
