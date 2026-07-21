import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AggregationFunction } from '@/types/pivotQuery';
import { PivotPanel } from '../PivotPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: unknown) =>
      typeof fallback === 'string' ? fallback : _key,
    i18n: { language: 'zh' },
  }),
}));

vi.mock('@/hooks/useTableColumns', () => ({
  useTableColumns: () => ({
    columns: [
      { name: 'region', type: 'VARCHAR' },
      { name: 'amount', type: 'INTEGER' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useAppConfig', () => ({
  useAppConfig: () => ({ maxQueryRows: 10000, pivotMaxColumns: 300 }),
}));

vi.mock('@/hooks/useAiStatus', () => ({
  useAiStatus: () => ({ enabled: false, configured: false }),
}));

vi.mock('@/components/SQLHighlight', () => ({
  SQLHighlight: ({ sql }: { sql: string }) => (
    <pre data-testid="pivot-sql-preview">{sql}</pre>
  ),
}));

vi.mock('../PivotTableDesigner', () => ({
  PivotTableDesigner: (props: {
    onRowsChange: (rows: string[]) => void;
    onValuesChange: (values: unknown[]) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        props.onRowsChange(['region']);
        props.onValuesChange([
          { column: 'amount', aggregation: AggregationFunction.SUM },
        ]);
      }}
    >
      configure pivot
    </button>
  ),
}));

vi.mock('../PivotFilters', () => ({
  PivotFilters: () => null,
  pivotFiltersToApi: () => [],
}));

vi.mock('../../AsyncTasks/AsyncTaskDialog', () => ({ AsyncTaskDialog: () => null }));
vi.mock('@/Query/SQLQuery/ai/AiChatDrawer', () => ({
  AiChatDrawer: () => null,
  ChatToggleButton: () => null,
}));

describe('PivotPanel SQL copy', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('copies the exact SQL displayed in the pivot preview', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <PivotPanel selectedTables={['sales']} onExecute={vi.fn()} />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'configure pivot' }));
    await screen.findByText('SQL 预览');

    const displayedSql = screen.getByTestId('pivot-sql-preview').textContent;
    expect(displayedSql).toContain('LIMIT 10000');

    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(displayedSql));
    expect(await screen.findByRole('button', { name: '已复制' })).toBeInTheDocument();
  });
});
