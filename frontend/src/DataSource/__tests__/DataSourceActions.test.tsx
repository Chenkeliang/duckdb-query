/** Regression 2026-10-13: imports and connections must open directly from either source surface. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSourceActions } from '../DataSourceActions';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/desktop/openExternal', () => ({ isTauri: () => true }));
const environment = vi.hoisted(() => ({ demo: false }));
vi.mock('@/demo/isDemo', () => ({ get IS_DEMO() { return environment.demo; } }));
describe('source entry points', () => {
  beforeEach(() => { environment.demo = false; });
  it('opens a local import and new connection without a method selection step', async () => {
    const open = vi.fn(); render(<DataSourceActions onAddData={open} />);
    await userEvent.click(screen.getByRole('button', { name: 'page.datasource.flow.importData' }));
    expect(open).toHaveBeenLastCalledWith('local');
    await userEvent.click(screen.getByRole('button', { name: 'page.datasource.list.newConnection' }));
    expect(open).toHaveBeenLastCalledWith('database');
  });
  it('opens pasted data directly and hides server browsing on desktop', async () => {
    const open = vi.fn(); render(<DataSourceActions onAddData={open} />);
    await userEvent.click(screen.getByRole('button', { name: 'page.datasource.flow.importOther' }));
    expect(screen.queryByRole('menuitem', { name: 'page.datasource.cardServerTitle' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'page.datasource.tabPaste' }));
    expect(open).toHaveBeenLastCalledWith('paste');
  });
  it('keeps imports available but hides database connections in the browser demo', async () => {
    environment.demo = true;
    render(<DataSourceActions onAddData={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'page.datasource.list.newConnection' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'page.datasource.flow.importOther' }));
    expect(screen.queryByRole('menuitem', { name: 'page.datasource.cardRemoteTitle' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'page.datasource.tabPaste' })).toBeInTheDocument();
  });
});
