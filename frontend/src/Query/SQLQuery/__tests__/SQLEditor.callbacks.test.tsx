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
});
