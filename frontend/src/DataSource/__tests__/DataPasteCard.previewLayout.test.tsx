import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DataPasteCard from '../DataPasteCard';

vi.mock('react-i18next', () => {
  const t = (key: string, options?: { index?: number }) => {
    if (key === 'page.datasource.paste.columnName') {
      return `列 ${options?.index} 名称`;
    }
    return key;
  };
  return { useTranslation: () => ({ t }) };
});

vi.mock('@/hooks/useSmartParse', () => {
  const previewRow = Array.from(
    { length: 11 },
    (_, index) => `value-${index + 1}`
  );
  const result = {
    results: [],
    selectedIndex: 0,
    currentResult: {
      strategy: 'tab',
      confidence: 100,
      rows: [previewRow],
      columns: previewRow.length,
      preview: [previewRow],
      hasHeader: false,
      delimiter: '\t',
    },
    parse: vi.fn(),
    selectResult: vi.fn(),
    isLoading: false,
    error: null,
  };
  return { useSmartParse: () => result };
});

describe('DataPasteCard preview layout', () => {
  it('keeps wide column controls readable and scrolls horizontally', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <DataPasteCard />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('列 11 名称')).toBeInTheDocument();
    });

    const table = screen.getByRole('table');
    expect(table.parentElement).toHaveClass('overflow-x-auto');
    expect(table).toHaveClass('w-max', 'min-w-full', 'table-fixed');

    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(11);
    headers.forEach((header) => {
      expect(header).toHaveClass('w-40', 'min-w-40', 'max-w-40');
    });

    within(table).getAllByRole('cell').forEach((cell) => {
      expect(cell).toHaveClass('w-40', 'max-w-40', 'truncate', 'whitespace-nowrap');
    });
  });
});
