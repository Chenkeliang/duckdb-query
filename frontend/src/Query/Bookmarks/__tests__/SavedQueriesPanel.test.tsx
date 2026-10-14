/** Regression 2026-10-13: restyling favorites must preserve search and the original SQL/workspace payload. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SavedQueriesPanel } from '../SavedQueriesPanel';
const state = vi.hoisted(() => ({
  refresh: vi.fn(), deleteQuery: vi.fn(), markQueryUsed: vi.fn(),
  favorites: [
    { id: 'join-fixture', name: 'Join example', type: 'join', description: 'fixture only', sql: 'SELECT 42 AS result', created_at: '2026-10-12T10:00:00', usage_count: 3 },
    { id: 'sql-fixture', name: 'Other query', type: 'duckdb', sql: 'SELECT 1', created_at: '2026-10-11T10:00:00', usage_count: 1 },
  ],
}));
vi.mock('../../hooks/useSavedQueries', () => ({ useSavedQueries: () => ({ ...state, isLoading: false }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
beforeAll(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterAll(() => vi.unstubAllGlobals());
describe('favorites behavior', () => {
  it('loads the exact original SQL and query type, records usage and closes the panel', async () => {
    const load = vi.fn(); const close = vi.fn();
    render(<SavedQueriesPanel open onOpenChange={close} onLoad={load} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'query.bookmark.use' })[0]);
    expect(load).toHaveBeenCalledWith('SELECT 42 AS result', 'join');
    expect(state.markQueryUsed).toHaveBeenCalledWith('join-fixture');
    expect(close).toHaveBeenCalledWith(false);
  });
  it('keeps SQL text searchable while displaying a localized query-type label', async () => {
    render(<SavedQueriesPanel open onOpenChange={vi.fn()} onLoad={vi.fn()} />);
    expect(screen.getByText('query.tabs.join')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'query.bookmark.searchPlaceholder' }), '42');
    expect(screen.getByText('Join example')).toBeInTheDocument();
    expect(screen.queryByText('Other query')).not.toBeInTheDocument();
  });
});
