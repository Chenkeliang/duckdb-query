/**
 * 回归(2026-07-10): 单槽模式(retainQueryResults 默认关)下没有 activeResultTabId,
 * getActiveGridApi() 曾直接返回 undefined —— 工具栏全部列操作(显隐/自适应列宽)与
 * 客户端导出(CSV/Excel/JSON)被 `?.` 静默吞掉,表现为"点了没反应"(Windows 新装
 * 默认单槽必现;mac 上开过多页签结果模式则被掩盖)。修复 = 单槽时回退 dataGridRef。
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { gridApi } = vi.hoisted(() => ({
  gridApi: {
    toggleColumnVisibility: vi.fn(),
    showAllColumns: vi.fn(),
    resetColumns: vi.fn(),
    autoFitAllColumns: vi.fn(),
    fitToWidth: vi.fn(),
    exportDataAsCsv: vi.fn(),
    exportDataAsExcel: vi.fn(),
    exportDataAsJson: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string | Record<string, unknown>) =>
      typeof defaultValue === 'string' ? defaultValue : key,
    i18n: { language: 'zh', changeLanguage: vi.fn() },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// 挂上 ref:单槽模式下 grid API 只存在于 dataGridRef —— 正是回归点
vi.mock('../DataGridWrapper', () => ({
  DataGridWrapper: React.forwardRef(function MockGrid(_props, ref) {
    React.useImperativeHandle(ref, () => gridApi);
    return <div data-testid="data-grid-mock" />;
  }),
}));

// 工具栏只暴露被测的回调按钮
vi.mock('../ResultToolbar', () => ({
  ResultToolbar: (props: {
    onAutoFitColumns?: () => void;
    onToggleColumn?: (field: string) => void;
    onExportCsv?: () => void;
  }) => (
    <div data-testid="toolbar-mock">
      <button data-testid="btn-autofit" onClick={() => props.onAutoFitColumns?.()} />
      <button data-testid="btn-toggle" onClick={() => props.onToggleColumn?.('name')} />
      <button data-testid="btn-csv" onClick={() => props.onExportCsv?.()} />
    </div>
  ),
}));

vi.mock('../ImportToDuckDBDialog', () => ({
  ImportToDuckDBDialog: () => null,
}));

import { ResultPanel } from '../ResultPanel';

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const mockData = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];

describe('ResultPanel 单槽模式列操作(getActiveGridApi 回退)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('自适应列宽/列显隐/CSV 导出必须到达 grid API,不得被静默吞掉', () => {
    render(
      <TestWrapper>
        <ResultPanel data={mockData} />
      </TestWrapper>
    );

    fireEvent.click(screen.getAllByTestId('btn-autofit')[0]);
    expect(gridApi.autoFitAllColumns).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByTestId('btn-toggle')[0]);
    expect(gridApi.toggleColumnVisibility).toHaveBeenCalledWith('name');

    fireEvent.click(screen.getAllByTestId('btn-csv')[0]);
    expect(gridApi.exportDataAsCsv).toHaveBeenCalledTimes(1);
  });
});
