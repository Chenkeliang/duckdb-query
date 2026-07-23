/**
 * TableItem 复制表名按钮：点击复制表名到剪贴板，且不触发行选中。
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

// 右键菜单带 @/api 等依赖,此处只测 TableItem 自身,整体 mock 掉
vi.mock('../ContextMenu', () => ({
  TableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { TableItem } from '../TableItem';
import type { SelectedTableObject } from '@/types/SelectedTable';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

const table: SelectedTableObject = { name: '粘贴数据_1784710187248', source: 'duckdb' };

describe('TableItem copy table name', () => {
  it('copies the table name without selecting the row', async () => {
    const onSelect = vi.fn();
    render(<TableItem table={table} isSelected={false} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: '复制表名' }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('粘贴数据_1784710187248')
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clicking the row still selects it', () => {
    const onSelect = vi.fn();
    render(<TableItem table={table} isSelected={false} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('粘贴数据_1784710187248'));

    expect(onSelect).toHaveBeenCalledWith(table);
  });
});
