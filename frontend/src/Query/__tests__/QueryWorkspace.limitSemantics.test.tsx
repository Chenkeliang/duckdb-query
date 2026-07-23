/**
 * Regression 2026-07: datasource preview/import keeps the visible preview LIMIT
 * and separately retains limit-free business SQL for full export/persistence.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(async (
    _sql: string,
    _source?: unknown,
    _options?: { baseSql?: string }
  ) => undefined),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));
vi.mock('react-resizable-panels', () => ({
  Panel: React.forwardRef(({ children }: { children: React.ReactNode }, _ref) => (
    <div>{children}</div>
  )),
  PanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: () => null,
}));
vi.mock('@/hooks/useAppConfig', () => ({
  useAppConfig: () => ({ maxQueryRows: 777 }),
}));
vi.mock('@/hooks/useQueryRunner', () => ({
  useQueryRunner: () => ({
    selectedTables: { sql: [] },
    currentTab: 'sql',
    queryResults: null,
    lastQuery: null,
    lastFailure: null,
    retryLastFailure: vi.fn(),
    isResultLoading: false,
    retainQueryResults: false,
    resultTabs: [],
    activeResultTabId: null,
    singleResultSlotLabel: '',
    handleTableSelect: vi.fn(),
    handleRemoveTable: vi.fn(),
    handleTabChange: vi.fn(),
    execute: mocks.execute,
    refreshResultTab: vi.fn(),
    selectResultTab: vi.fn(),
    closeResultTabById: vi.fn(),
    closeOtherResultTabsById: vi.fn(),
    closeResultTabsToLeftOf: vi.fn(),
    closeResultTabsToRightOf: vi.fn(),
    toggleResultTabPinById: vi.fn(),
    displayPreview: vi.fn(),
    cancel: vi.fn(),
    isCancelling: false,
    joinRestoreRequest: null,
    restoreJoinWorkspace: vi.fn(),
    clearJoinRestoreRequest: vi.fn(),
  }),
}));
vi.mock('@/utils/sqlUtils', () => ({
  generateExternalTableReference: () => ({
    qualifiedName: '"remote"."orders"',
    attachDatabase: { alias: 'remote', connectionId: 'connection-1' },
  }),
}));
vi.mock('@/utils/tableUtils', () => ({
  normalizeSelectedTable: (table: unknown) => table,
}));
vi.mock('../DataSourcePanel', () => ({
  DataSourcePanel: ({
    onPreview,
    onImport,
  }: {
    onPreview: (table: unknown) => void;
    onImport: (table: unknown) => void;
  }) => (
    <>
      <button type="button" onClick={() => onPreview({ name: 'orders', source: 'external' })}>
        preview
      </button>
      <button
        type="button"
        onClick={() => onImport({
          name: 'orders',
          source: 'external',
          connection: { id: 'connection-1' },
        })}
      >
        import
      </button>
    </>
  ),
}));
vi.mock('../QueryTabs', () => ({ QueryTabs: React.forwardRef(() => null) }));
vi.mock('../ResultPanel', () => ({ ResultPanel: () => null }));
vi.mock('@/utils/toastHelpers', () => ({
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
}));
vi.mock('@/utils/cacheInvalidation', () => ({ invalidateAfterTableDelete: vi.fn() }));
vi.mock('@/api', () => ({ deleteDuckDBTable: vi.fn() }));

import { QueryWorkspace } from '../QueryWorkspace';

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QueryWorkspace />
    </QueryClientProvider>
  );
}

describe('QueryWorkspace datasource limit semantics', () => {
  beforeEach(() => mocks.execute.mockClear());

  it('previews with a visible LIMIT and retains limit-free baseSql', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'preview' }));

    await waitFor(() => expect(mocks.execute).toHaveBeenCalled());
    expect(mocks.execute.mock.calls[0][0]).toBe(
      'SELECT * FROM "remote"."orders" LIMIT 777'
    );
    expect(mocks.execute.mock.calls[0][2]).toEqual({
      baseSql: 'SELECT * FROM "remote"."orders"',
    });
  });

  it('opens import with limit-free baseSql retained behind the preview SQL', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'import' }));

    await waitFor(() => expect(mocks.execute).toHaveBeenCalled());
    expect(mocks.execute.mock.calls[0][0]).toBe(
      'SELECT * FROM "remote"."orders" LIMIT 777'
    );
    expect(mocks.execute.mock.calls[0][2]).toEqual({
      baseSql: 'SELECT * FROM "remote"."orders"',
    });
  });
});
