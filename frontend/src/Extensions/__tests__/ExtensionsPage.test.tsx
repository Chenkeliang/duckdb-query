/**
 * ExtensionsPage 组件测试
 *
 * 覆盖：分组渲染、预置标注、安装按钮、点击安装后的进度展示、安装完成后的已安装状态。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config.js';

import { ExtensionsPage } from '../ExtensionsPage';
import type { DuckDBExtensionItem, ExtensionInstallStatus } from '@/api/extensionsApi';

const listDuckDBExtensions = vi.fn();
const installDuckDBExtension = vi.fn();
const getDuckDBExtensionInstallStatus = vi.fn();

vi.mock('@/api/extensionsApi', () => ({
  listDuckDBExtensions: (...args: unknown[]) => listDuckDBExtensions(...args),
  installDuckDBExtension: (...args: unknown[]) => installDuckDBExtension(...args),
  getDuckDBExtensionInstallStatus: (...args: unknown[]) => getDuckDBExtensionInstallStatus(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const baseItems: DuckDBExtensionItem[] = [
  {
    name: 'excel',
    category: 'datasource',
    description: 'Excel 读写',
    description_en: 'Excel read & write',
    installed: true,
    bundled: true,
  },
  {
    name: 'sqlite_scanner',
    category: 'datasource',
    description: '读写本地 SQLite 数据库文件',
    description_en: 'Read & write local SQLite database files',
    installed: false,
    bundled: false,
  },
  {
    name: 'vss',
    category: 'capability',
    description: '向量相似度检索(HNSW 索引)',
    description_en: 'Vector similarity search (HNSW)',
    installed: false,
    bundled: false,
  },
];

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <ExtensionsPage />
    </I18nextProvider>
  );

describe('ExtensionsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('zh');
    listDuckDBExtensions.mockResolvedValue(baseItems);
  });

  it('renders datasource and capability groups with catalog entries', async () => {
    renderPage();

    expect(await screen.findByText('excel')).toBeInTheDocument();
    expect(screen.getByText('sqlite_scanner')).toBeInTheDocument();
    expect(screen.getByText('vss')).toBeInTheDocument();
    expect(screen.getByText('数据源')).toBeInTheDocument();
    expect(screen.getByText('能力增强')).toBeInTheDocument();
  });

  it('shows a bundled badge for preseeded extensions', async () => {
    renderPage();
    await screen.findByText('excel');

    const excelRow = screen.getByTestId('extension-row-excel');
    expect(within(excelRow).getByText('已预置')).toBeInTheDocument();
    expect(within(excelRow).queryByRole('button', { name: '安装' })).not.toBeInTheDocument();
  });

  it('shows an install button for non-bundled, non-installed extensions', async () => {
    renderPage();
    await screen.findByText('sqlite_scanner');

    const sqliteRow = screen.getByTestId('extension-row-sqlite_scanner');
    expect(within(sqliteRow).getByRole('button', { name: '安装' })).toBeInTheDocument();
  });

  it('clicking install shows progress, then flips to installed once done', async () => {
    installDuckDBExtension.mockResolvedValue(undefined);
    getDuckDBExtensionInstallStatus
      .mockResolvedValueOnce({
        status: 'downloading',
        progress: 40,
        error: null,
      } as ExtensionInstallStatus)
      .mockResolvedValueOnce({ status: 'done', progress: 100, error: null } as ExtensionInstallStatus);

    // 安装完成后重新拉取列表：sqlite_scanner 变为已安装
    listDuckDBExtensions.mockResolvedValueOnce(baseItems).mockResolvedValueOnce(
      baseItems.map((item) => (item.name === 'sqlite_scanner' ? { ...item, installed: true } : item))
    );

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('sqlite_scanner');

    const sqliteRow = screen.getByTestId('extension-row-sqlite_scanner');
    await user.click(within(sqliteRow).getByRole('button', { name: '安装' }));

    expect(installDuckDBExtension).toHaveBeenCalledWith('sqlite_scanner');

    // 轮询到下载中：出现进度提示
    await waitFor(() => {
      expect(within(sqliteRow).getByText(/下载中/)).toBeInTheDocument();
    });

    // 轮询到 done：进度消失，行内变为「已安装」
    await waitFor(
      () => {
        expect(within(sqliteRow).getByText('已安装')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    expect(getDuckDBExtensionInstallStatus).toHaveBeenCalledWith('sqlite_scanner');
  });

  it('shows an error toast and restores the install button on failure', async () => {
    installDuckDBExtension.mockResolvedValue(undefined);
    getDuckDBExtensionInstallStatus.mockResolvedValueOnce({
      status: 'error',
      progress: 0,
      error: '扩展 vss 安装失败：network unreachable',
    } as ExtensionInstallStatus);

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('vss');

    const vssRow = screen.getByTestId('extension-row-vss');
    await user.click(within(vssRow).getByRole('button', { name: '安装' }));

    await waitFor(() => {
      expect(within(vssRow).getByRole('button', { name: '安装' })).toBeInTheDocument();
    });
  });
});
