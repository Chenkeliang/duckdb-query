/**
 * Regression 2026-07-29: set-operation controls must follow the active locale
 * while generated SQL keeps DuckDB keywords.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import en from '@/i18n/locales/en/common.json';
import zh from '@/i18n/locales/zh/common.json';
import { SetOperationsPanel } from '../SetOperationsPanel';

vi.mock('@/hooks/useAppConfig', () => ({
  useAppConfig: () => ({ maxQueryRows: 10_000 }),
}));

vi.mock('@/hooks/useAiStatus', () => ({
  useAiStatus: () => ({ configured: false }),
}));

vi.mock('@/hooks/useTableColumns', () => ({
  useMultipleTableColumns: (tables: unknown[]) =>
    tables.map(() => ({
      columns: [{ name: 'id', type: 'INTEGER' }],
      isLoading: false,
      isError: false,
      isEmpty: false,
    })),
}));

vi.mock('@/api', () => ({
  generateSetOperation: vi.fn().mockResolvedValue({
    sql: 'SELECT * FROM first_table UNION SELECT * FROM second_table',
  }),
  validateSetOperation: vi.fn().mockResolvedValue({
    is_valid: true,
    errors: [],
    warnings: [],
  }),
  toAttachDatabasesPayload: (databases: unknown[]) => databases,
}));

vi.mock('@/components/SQLHighlight', () => ({
  SQLHighlight: ({ sql }: { sql: string }) => <pre>{sql}</pre>,
}));

vi.mock('@/Query/Bookmarks/SaveQueryDialog', () => ({
  SaveQueryDialog: () => null,
}));

vi.mock('@/Query/AsyncTasks/AsyncTaskDialog', () => ({
  AsyncTaskDialog: () => null,
}));

vi.mock('@/Query/SQLQuery/ai/AiChatDrawer', () => ({
  ChatToggleButton: () => null,
}));

vi.mock('@/Query/SQLQuery/ai/agentChatBus', () => ({
  agentChatBus: { setSql: vi.fn(), toggle: vi.fn() },
  useAgentChatBus: () => ({ open: false }),
}));

const TABLES = [
  { name: 'first_table', source: 'duckdb' as const },
  { name: 'second_table', source: 'duckdb' as const },
];

async function renderPanel(language: 'zh' | 'en', withTables = false) {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    resources: {
      zh: { common: zh },
      en: { common: en },
    },
    lng: language,
    fallbackLng: 'zh',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <I18nextProvider i18n={instance}>
      <QueryClientProvider client={client}>
        <SetOperationsPanel selectedTables={withTables ? TABLES : []} />
      </QueryClientProvider>
    </I18nextProvider>
  );
}

describe('SetOperationsPanel locale copy', () => {
  it('uses Chinese operation names and a precise column-alignment note', async () => {
    await renderPanel('zh', true);

    expect(screen.getByRole('tab', { name: '合并去重' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '合并并保留重复' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '交集' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '差集' })).toBeInTheDocument();

    const byName = screen.getByRole('checkbox', { name: '按列名对齐' });
    expect(
      screen.getByRole('button', {
        name: '合并字段不同的数据：同名列自动对齐，缺失列补 NULL',
      })
    ).toBeInTheDocument();

    fireEvent.click(byName);
    expect(await screen.findByText('合并去重 · 按列名对齐')).toBeInTheDocument();
    expect(
      screen.getByText('已按列名对齐：可合并字段不同的数据，缺失列补 NULL。')
    ).toBeInTheDocument();
  });

  it('uses English operation names and guidance in English mode', async () => {
    await renderPanel('en');

    expect(screen.getByRole('tab', { name: 'Union' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Union all' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Align by column name' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Combine data with different columns: align matching names and fill missing columns with NULL',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Double-click tables in the data source panel to begin. Add multiple tables to combine rows, find intersections, or calculate differences.'
      )
    ).toBeInTheDocument();
  });
});
