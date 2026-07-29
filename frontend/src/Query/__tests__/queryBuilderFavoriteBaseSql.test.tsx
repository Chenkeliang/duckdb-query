/**
 * Regression (2026-07): JOIN/SET previews include the visible system LIMIT,
 * while favorites must retain the limit-free business SQL.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateSetOperation: vi.fn(),
  performJoinQuery: vi.fn(),
  validateSetOperation: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : _key,
    i18n: { language: 'zh' },
  }),
}));

vi.mock('@/hooks/useAppConfig', () => ({
  useAppConfig: () => ({ maxQueryRows: 777 }),
}));

vi.mock('@/hooks/useAiStatus', () => ({
  useAiStatus: () => ({ configured: false }),
}));

vi.mock('@/hooks/useTableColumns', () => ({
  useMultipleTableColumns: (tables: unknown[]) =>
    tables.map(() => ({
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'name', type: 'VARCHAR' },
      ],
      isLoading: false,
      isError: false,
      error: null,
      isEmpty: false,
      refetch: vi.fn(),
    })),
}));

vi.mock('@/api', () => ({
  cancelSyncQuery: vi.fn(),
  generateSetOperation: mocks.generateSetOperation,
  inferColumnCast: vi.fn(),
  parseFederatedQueryError: vi.fn(),
  performJoinQuery: mocks.performJoinQuery,
  toAttachDatabasesPayload: (databases: unknown[]) => databases,
  validateSetOperation: mocks.validateSetOperation,
}));

vi.mock('@/components/SQLHighlight', () => ({
  SQLHighlight: ({ sql }: { sql: string }) => <pre data-testid="sql-preview">{sql}</pre>,
}));

vi.mock('@/Query/Bookmarks/SaveQueryDialog', () => ({
  SaveQueryDialog: ({ sql, type }: { sql: string; type?: string }) => (
    <output data-testid="save-query-sql" data-query-type={type ?? 'set'}>
      {sql}
    </output>
  ),
}));

vi.mock('@/Query/AsyncTasks/AsyncTaskDialog', () => ({
  AsyncTaskDialog: () => null,
}));

vi.mock('@/Query/SQLQuery/ai/AiChatDrawer', () => ({
  AiChatDrawer: () => null,
  ChatToggleButton: () => null,
}));

vi.mock('@/Query/components/TypeConflictDialog', () => ({
  TypeConflictDialog: () => null,
}));

import { JoinQueryPanel } from '@/Query/JoinQuery/JoinQueryPanel';
import { SetOperationsPanel } from '@/Query/SetOperations/SetOperationsPanel';

const TABLES = [
  { name: 'orders', source: 'duckdb' as const },
  { name: 'customers', source: 'duckdb' as const },
];

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('query builder favorite SQL', () => {
  beforeEach(() => {
    mocks.generateSetOperation.mockReset();
    mocks.performJoinQuery.mockReset();
    mocks.validateSetOperation.mockReset();
    mocks.validateSetOperation.mockResolvedValue({
      is_valid: true,
      errors: [],
      warnings: [],
    });
  });

  it('passes JOIN base SQL to SaveQueryDialog while preview keeps the visible limit', async () => {
    renderWithQueryClient(<JoinQueryPanel selectedTables={TABLES} />);

    await waitFor(() => {
      expect(screen.getByTestId('sql-preview')).toHaveTextContent('LIMIT 777');
    });

    const favoriteSql = screen.getByTestId('save-query-sql');
    expect(favoriteSql).toHaveAttribute('data-query-type', 'join');
    expect(favoriteSql).toHaveTextContent('FROM orders AS t1');
    expect(favoriteSql).toHaveTextContent('LEFT JOIN customers AS t2');
    expect(favoriteSql).not.toHaveTextContent('LIMIT 777');
  });

  it('passes limit-free JOIN base SQL with a server preview result', async () => {
    const previewSql =
      'SELECT * FROM orders AS t1 LEFT JOIN customers AS t2 ON t1.id = t2.id LIMIT 777';
    mocks.performJoinQuery.mockResolvedValue({
      data: [{ id: 1 }],
      columns: ['id'],
      column_types: [],
      row_count: 1,
      sql: previewSql,
    });
    const onDisplayPreview = vi.fn();

    renderWithQueryClient(
      <JoinQueryPanel selectedTables={TABLES} onDisplayPreview={onDisplayPreview} />
    );

    fireEvent.click(await screen.findByRole('button', { name: '执行' }));

    await waitFor(() => expect(onDisplayPreview).toHaveBeenCalledTimes(1));
    expect(onDisplayPreview.mock.calls[0][1]).toBe(previewSql);
    expect(onDisplayPreview.mock.calls[0][3].baseSql).toContain(
      'LEFT JOIN customers AS t2'
    );
    expect(onDisplayPreview.mock.calls[0][3].baseSql).not.toContain('LIMIT 777');
  });

  it('passes SET base SQL to SaveQueryDialog while preview keeps the visible limit', async () => {
    const baseSql = 'SELECT id, name FROM orders UNION SELECT id, name FROM customers';
    mocks.generateSetOperation.mockResolvedValue({ sql: baseSql });

    renderWithQueryClient(<SetOperationsPanel selectedTables={TABLES} />);

    await waitFor(() => {
      expect(screen.getByTestId('sql-preview')).toHaveTextContent('LIMIT 777');
    });

    expect(screen.getByTestId('save-query-sql')).toHaveTextContent(baseSql);
    expect(screen.getByTestId('save-query-sql')).not.toHaveTextContent('LIMIT 777');
  });
});
