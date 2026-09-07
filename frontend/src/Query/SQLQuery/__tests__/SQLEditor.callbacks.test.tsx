/**
 * Regression 2026-07-28: CodeMirror kept the first onChange closure forever,
 * so later SQLQueryPanel state such as system LIMIT provenance was invisible.
 */
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

import { SQLEditor } from '../SQLEditor';

describe('SQLEditor callback freshness', () => {
  it('uses the latest onChange callback after rerender', async () => {
    const initialOnChange = vi.fn();
    const latestOnChange = vi.fn();
    const { rerender } = render(
      <SQLEditor value="SELECT 1" onChange={initialOnChange} />
    );

    rerender(<SQLEditor value="SELECT 2" onChange={latestOnChange} />);

    await waitFor(() => expect(latestOnChange).toHaveBeenCalledWith('SELECT 2'));
    expect(initialOnChange).not.toHaveBeenCalled();
  });

  it('renders a CodeMirror error marker from a structured SQL location', async () => {
    const { container } = render(
      <SQLEditor
        value="SELECT * FRM orders"
        diagnostic={{ line: 1, column: 10, endColumn: 11, message: 'syntax error' }}
      />
    );

    await waitFor(() => {
      expect(container.querySelector('.cm-lintRange-error')).not.toBeNull();
    });
  });
});
