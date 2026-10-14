import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import zh from '@/i18n/locales/zh/common.json';
import { CommandPalette } from '../CommandPalette';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh' },
    t: (key: string, fallback?: string) => key.split('.').reduce<unknown>((value, part) =>
      value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, zh) ?? fallback ?? key,
  }),
}));
vi.mock('@/hooks/useDuckDBTables', () => ({ useDuckDBTables: () => ({ tables: [{ name: '验收订单' }] }) }));
vi.mock('@/hooks/useAiEnabled', () => ({ useAiEnabled: () => false }));
vi.mock('@/Query/hooks/useGlobalHistory', () => ({ useGlobalHistory: () => ({ history: [] }) }));
vi.mock('@/Settings/shortcuts', () => ({
  useShortcuts: () => ({ getShortcutForAction: () => '' }),
  formatShortcutLabel: (value: string) => value,
}));

const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});
afterAll(() => {
  vi.unstubAllGlobals();
  if (originalScroll) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScroll);
  else delete (Element.prototype as Partial<Element>).scrollIntoView;
});

describe('localized command search', () => {
  it.each([
    ['新建 SQL', '新建 SQL 标签', { type: 'workbench', command: 'newSqlTab' }],
    ['连接数据库', '连接数据库', { type: 'connectDatabase' }],
    ['设置', '设置', { type: 'navigate', tab: 'settings' }],
    ['new sql', '新建 SQL 标签', { type: 'workbench', command: 'newSqlTab' }],
    ['验收订单', '验收订单', { type: 'insertTable', name: '验收订单' }],
  ])('finds and runs %s', async (query, label, action) => {
    const onAction = vi.fn();
    const onOpenChange = vi.fn();
    render(<CommandPalette open onAction={onAction} onOpenChange={onOpenChange} isDarkMode />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: query } });
    fireEvent.click(await screen.findByRole('option', { name: label }));
    expect(onAction).toHaveBeenCalledWith(action);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
