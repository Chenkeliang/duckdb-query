/**
 * Regression (2026-07): DuckDB table deletion must remain reachable both
 * through a parent callback and through TableContextMenu's default API path.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteDuckDBTable: vi.fn(),
  invalidateAfterTableDelete: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/api', () => ({
  deleteDuckDBTable: mocks.deleteDuckDBTable,
  executeDuckDBSQL: vi.fn(),
  exportQueryResults: vi.fn(),
  getExternalTableDetail: vi.fn(),
  getQueryExportDownloadUrl: vi.fn(),
}));

vi.mock('@/utils/cacheInvalidation', () => ({
  invalidateAfterTableDelete: mocks.invalidateAfterTableDelete,
}));

vi.mock('@/hooks/useDuckDBTables', () => ({
  invalidateDuckDBTables: vi.fn(),
}));

vi.mock('@/hooks/useDataSources', () => ({
  invalidateDataSources: vi.fn(),
}));

vi.mock('@/utils/toastHelpers', () => ({
  showDownloadStartedToast: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock('@/desktop/openExternal', () => ({ openExternal: vi.fn() }));
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: React.PropsWithChildren) => <>{children}</>,
  ContextMenuTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
  ContextMenuContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ContextMenuItem: ({
    children,
    disabled,
    onClick,
  }: React.PropsWithChildren<{ disabled?: boolean; onClick?: () => void }>) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  ContextMenuSeparator: () => null,
  ContextMenuSub: ({ children }: React.PropsWithChildren) => <>{children}</>,
  ContextMenuSubContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
  ContextMenuSubTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: React.PropsWithChildren<{ open?: boolean }>) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  DialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TabsContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TabsList: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TabsTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import { TableContextMenu } from '../ContextMenu';

const TABLE = { name: 'orders', source: 'duckdb' as const };

function renderMenu(onDelete?: (tableName: string) => Promise<void> | void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TableContextMenu table={TABLE} onDelete={onDelete}>
        <span>orders</span>
      </TableContextMenu>
    </QueryClientProvider>
  );
}

async function confirmDelete() {
  fireEvent.click(screen.getByRole('button', { name: 'dataSource.deleteTable' }));
  fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
}

describe('TableContextMenu delete wiring', () => {
  beforeEach(() => {
    mocks.deleteDuckDBTable.mockReset();
    mocks.invalidateAfterTableDelete.mockReset();
    mocks.deleteDuckDBTable.mockResolvedValue({});
    mocks.invalidateAfterTableDelete.mockResolvedValue(undefined);
  });

  it('uses the parent delete callback when one is provided', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderMenu(onDelete);

    await confirmDelete();

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('orders'));
    expect(mocks.deleteDuckDBTable).not.toHaveBeenCalled();
  });

  it('uses deleteDuckDBTable and invalidates caches when no callback is provided', async () => {
    renderMenu();

    await confirmDelete();

    await waitFor(() => expect(mocks.deleteDuckDBTable).toHaveBeenCalledWith('orders'));
    expect(mocks.invalidateAfterTableDelete).toHaveBeenCalledTimes(1);
  });
});
