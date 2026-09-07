import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageUpgradeSettings } from '../StorageUpgradeSettings';

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), open: vi.fn(), budget: vi.fn(), report: null as null | { completed_at: string; backup_directory: string } }));
vi.mock('@/api', () => ({ inspectStorageBackup: mocks.inspect, openStorageBackup: mocks.open, getResourceBudget: mocks.budget }));
vi.mock('@/desktop/openExternal', () => ({ isTauri: () => true }));
vi.mock('@/hooks/useStorageUpgrade', () => ({ useStorageUpgrade: () => ({
  data: { required: false, target_storage: 'v2.0.0', main: { version: 'v2.0.0+' }, system: { version: 'v2.0.0+' }, last_report: mocks.report }, isPending: false,
}) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'zh-CN' }, t: (key: string, options?: { time?: string }) => options?.time ?? key }) }));
vi.mock('@/utils/toastHelpers', () => ({ showErrorToast: vi.fn() }));

describe('StorageUpgradeSettings recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.report = null;
    mocks.budget.mockResolvedValue({memory_limit_bytes: 1024 ** 3, temp_limit_bytes: 1024 ** 3, max_connections: 4, min_free_disk_bytes: 256 * 1024 ** 2});
    mocks.open.mockResolvedValue(undefined);
  });
  const show = () => render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><StorageUpgradeSettings /></QueryClientProvider>);

  it('keeps actions together and hides long paths until expanded (2026-09-07 regression)', () => {
    const timestamp = '2026-09-04T09:33:02.869569+00:00';
    mocks.report = { completed_at: timestamp, backup_directory: '/a/very/long/backup/path' };
    show();
    const report = screen.getByRole('button', { name: 'settings.storageUpgrade.report' });
    const recovery = screen.getByRole('button', { name: 'settings.storageUpgrade.recovery' });
    expect(report.parentElement).toBe(recovery.parentElement);
    expect(report.parentElement).toHaveClass('justify-end', 'flex-wrap');
    expect(screen.queryByText(mocks.report.backup_directory)).not.toBeInTheDocument();
    expect(screen.getByText(new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }))).toBeInTheDocument();
    fireEvent.click(report);
    expect(screen.getByText(mocks.report.backup_directory)).toBeInTheDocument();
    expect(report).toHaveAttribute('aria-expanded', 'true');
  });

  it('omits an invalid migration timestamp (2026-09-07 boundary)', () => {
    mocks.report = { completed_at: 'invalid', backup_directory: '/backup' };
    show();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });

  it('checks on demand and disables folder opening for an incomplete backup', async () => {
    mocks.inspect.mockResolvedValue({available: false, directory: null, files: []});
    show();
    expect(mocks.inspect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'settings.storageUpgrade.recovery'}));
    expect(await screen.findByText('settings.storageUpgrade.backupUnavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'settings.storageUpgrade.openBackup'})).toBeDisabled();
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('opens a checked backup folder without invoking restore', async () => {
    mocks.inspect.mockResolvedValue({available: true, directory: '/backup', files: []});
    show();
    fireEvent.click(screen.getByRole('button', {name: 'settings.storageUpgrade.recovery'}));
    expect(await screen.findByText('settings.storageUpgrade.backupReady')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'settings.storageUpgrade.openBackup'}));
    await vi.waitFor(() => expect(mocks.open).toHaveBeenCalledOnce());
  });
});
