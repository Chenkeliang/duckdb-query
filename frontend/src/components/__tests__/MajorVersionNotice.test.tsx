import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openExternal = vi.fn();
const mutateAsync = vi.fn();
const status = {
  target_storage: 'v2.0.0', required: true, pending_restart: false,
  main: { version: 'v1.5.0+', size_bytes: 100, wal_size_bytes: 0 },
  system: { version: 'v1.5.0+', size_bytes: 50, wal_size_bytes: 0 },
  required_bytes: 1024, free_bytes: 4096, active_queries: 0,
  backup_directory: null, last_report: null,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));
vi.mock('@/demo/isDemo', () => ({ IS_DEMO: false }));
vi.mock('@/desktop/openExternal', () => ({
  isTauri: () => false,
  openExternal: (...args: unknown[]) => openExternal(...args),
}));
vi.mock('@/utils/toastHelpers', () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));
vi.mock('@/hooks/useStorageUpgrade', () => ({
  useStorageUpgrade: () => ({
    data: status, isPending: false, isError: false,
    schedule: { mutateAsync, isPending: false },
  }),
}));

import { MajorVersionNotice, OPEN_STORAGE_UPGRADE_EVENT } from '../MajorVersionNotice';

describe('MajorVersionNotice', () => {
  beforeEach(() => {
    openExternal.mockClear();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ ...status, pending_restart: true });
    status.required = true;
    status.pending_restart = false;
    status.active_queries = 0;
  });

  it('shows actual legacy versions and the irreversible boundary', async () => {
    render(<MajorVersionNotice />);
    expect(await screen.findByText('升级数据库存储')).toBeInTheDocument();
    const legacyVersions = screen.getAllByText('v1.5.0+');
    expect(legacyVersions).toHaveLength(2);
    expect(legacyVersions[0].parentElement).toHaveClass('text-foreground');
    expect(legacyVersions[0].closest('section')).toHaveClass('border-border');
    expect(screen.getByText('完成迁移后')).toHaveClass('text-foreground');
    expect(screen.getByText('现在不升级').parentElement?.parentElement).toHaveClass('border-border');
    expect(screen.getByText('可稍后处理')).toBeInTheDocument();
  });

  it('defers without a persistent banner and can be reopened from Settings', async () => {
    const first = render(<MajorVersionNotice />);
    fireEvent.click(await screen.findByRole('button', { name: '稍后处理' }));
    expect(screen.queryByText('升级数据库存储')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '升级到 v2 storage' })).not.toBeInTheDocument();
    fireEvent(window, new Event(OPEN_STORAGE_UPGRADE_EVENT));
    expect(await screen.findByText('升级数据库存储')).toBeInTheDocument();

    first.unmount();
    render(<MajorVersionNotice />);
    expect(await screen.findByText('升级数据库存储')).toBeInTheDocument();
  });

  it('requires two confirmations before scheduling migration', async () => {
    render(<MajorVersionNotice />);
    fireEvent.click(await screen.findByRole('button', { name: '备份并升级' }));
    const submit = screen.getByRole('button', { name: /登记迁移并重启/ });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByText('我确认迁移会先创建完整备份。'));
    fireEvent.click(screen.getByText('我确认迁移后不能直接使用 DuckQuery 1.x。'));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
  });

  it('shows bundled compatibility notes and opens only the official source', async () => {
    render(<MajorVersionNotice />);
    fireEvent.click(await screen.findByRole('button', { name: '查看迁移影响' }));
    expect(await screen.findByText('迁移影响')).toBeInTheDocument();
    expect(screen.getByText('迁移不是必选项')).toBeInTheDocument();
    expect(screen.getByText('旧库可以直接用')).toBeInTheDocument();
    expect(screen.getByText('迁移会先备份')).toBeInTheDocument();
    expect(screen.getByText('检查 SQL 与扩展')).toBeInTheDocument();
    expect(openExternal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'DuckDB 官方说明' }));
    expect(openExternal).toHaveBeenCalledWith('https://duckdb.org/2026/09/02/try-duckdb-20-alpha');
  });
});
