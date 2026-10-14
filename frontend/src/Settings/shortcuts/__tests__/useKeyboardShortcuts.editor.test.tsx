/** Regression 2026-10-13: the AI shortcut must work while editing SQL, without enabling other input shortcuts. */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
vi.mock('../ShortcutContext', async () => {
  const { createContext } = await import('react');
  return { default: createContext({ isLoading: false,
    shortcuts: { toggleAiPanel: { shortcut: 'Cmd+L' }, navigateDataSource: { shortcut: 'Cmd+D' } },
  }) };
});
function Editor({ ai, navigate }: { ai: () => void; navigate: () => void }) {
  useKeyboardShortcuts({ toggleAiPanel: ai, navigateDataSource: navigate });
  return <><div className="cm-editor"><textarea aria-label="SQL editor" /></div><input aria-label="Connection name" /></>;
}
describe('AI shortcut in the SQL editor', () => {
  beforeEach(() => { vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel'); });
  afterEach(() => vi.restoreAllMocks());
  it('opens AI in the editor but keeps navigation shortcuts suppressed while typing', () => {
    const ai = vi.fn(); const navigate = vi.fn(); render(<Editor ai={ai} navigate={navigate} />);
    const editor = screen.getByLabelText('SQL editor'); editor.focus();
    fireEvent.keyDown(editor, { key: 'l', metaKey: true });
    expect(ai).toHaveBeenCalledOnce();
    fireEvent.keyDown(editor, { key: 'd', metaKey: true });
    expect(navigate).not.toHaveBeenCalled();
  });
  it('does not intercept the shortcut in an ordinary form input', () => {
    const ai = vi.fn(); render(<Editor ai={ai} navigate={vi.fn()} />);
    const input = screen.getByLabelText('Connection name'); input.focus();
    fireEvent.keyDown(input, { key: 'l', metaKey: true });
    expect(ai).not.toHaveBeenCalled();
  });
});
