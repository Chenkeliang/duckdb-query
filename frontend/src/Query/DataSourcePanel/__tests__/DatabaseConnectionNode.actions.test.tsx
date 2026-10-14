/** Regression 2026-10-13: edit in-place and reveal a connection without resetting the query workspace. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseConnectionNode } from '../DatabaseConnectionNode';
import { TreeSection } from '../TreeSection';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useSchemas', () => ({ useSchemas: () => ({ schemas: [], isLoading: false }) }));
vi.mock('@/hooks/useSchemaTables', () => ({ useSchemaTables: () => ({ tables: [], isLoading: false }) }));
const connection = { id: 'orders', name: 'Orders', type: 'mysql' as const, status: 'active' as const, params: {} };
describe('connection actions', () => {
  it('edits the exact connection without expanding its table tree', async () => {
    const edit = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><DatabaseConnectionNode connection={connection} onEdit={edit} selectedTables={[]} onTableSelect={vi.fn()} /></QueryClientProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'page.datasource.flow.editNamed' }));
    expect(edit).toHaveBeenCalledWith(connection);
    expect(screen.queryByText('common.noData')).not.toBeInTheDocument();
  });
  it('reveals a connection again after its group was collapsed', async () => {
    localStorage.setItem('treeSection-database-connections', 'false');
    const scroll = vi.fn(); Element.prototype.scrollIntoView = scroll;
    const view = (token: number) => <QueryClientProvider client={new QueryClient()}><TreeSection id="database-connections" title="Connections" count={1} expandToken={token}><DatabaseConnectionNode connection={connection} focusToken={token} selectedTables={[]} onTableSelect={vi.fn()} /></TreeSection></QueryClientProvider>;
    const { rerender } = render(view(1));
    expect(await screen.findByText('common.noData')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.queryByText('Orders')).not.toBeInTheDocument();
    rerender(view(2));
    await waitFor(() => expect(screen.getByText('Orders')).toBeInTheDocument());
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
  });
});
