/**
 * DownloadResultDialog 下载链路(2026-07-10 桌面直写改造):
 * - 桌面(Tauri):原生存盘对话框 → exportAsyncResultToPath 后端直写所选路径,
 *   不再经系统浏览器(Windows explorer 对带 query 的 URL 曾静默失败);
 * - 用户取消存盘对话框 → 不发请求、弹窗保持打开;
 * - Web:维持 openExternal 命中 GET 流式端点的原生下载。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    tauri: true,
    save: vi.fn(),
    openExternal: vi.fn(async () => undefined),
    exportToPath: vi.fn(async () => ({ path: '/x/out.csv', size_bytes: 1 })),
    getUrl: vi.fn(() => 'http://127.0.0.1:1/api/async-tasks/t1/download?format=csv'),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: unknown) =>
      typeof defaultValue === 'string' ? defaultValue : key,
    i18n: { language: 'zh', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));

vi.mock('@/desktop/openExternal', () => ({
  isTauri: () => mocks.tauri,
  openExternal: mocks.openExternal,
}));

vi.mock('@/api', () => ({
  getAsyncDownloadUrl: mocks.getUrl,
  exportAsyncResultToPath: mocks.exportToPath,
}));

vi.mock('@/utils/toastHelpers', () => ({
  showDownloadStartedToast: vi.fn(),
  showSavedToToast: vi.fn(),
  handleApiErrorToast: vi.fn(),
}));

import { DownloadResultDialog } from '../DownloadResultDialog';

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <DownloadResultDialog
      open
      onOpenChange={onOpenChange}
      taskId="t1"
      tableName="big_test"
      rowCount={420}
    />
  );
  return onOpenChange;
}

describe('DownloadResultDialog 下载链路', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tauri = true;
  });

  it('桌面:原生存盘对话框选路径后走后端直写,不经浏览器', async () => {
    mocks.save.mockResolvedValue('/Users/me/big_test.csv');
    const onOpenChange = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /下载/ }));

    await waitFor(() =>
      expect(mocks.exportToPath).toHaveBeenCalledWith('t1', {
        format: 'csv',
        targetPath: '/Users/me/big_test.csv',
      })
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'big_test.csv' })
    );
    expect(mocks.openExternal).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('桌面:用户取消存盘对话框 → 不发请求、弹窗保持打开', async () => {
    mocks.save.mockResolvedValue(null);
    const onOpenChange = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /下载/ }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.exportToPath).not.toHaveBeenCalled();
    expect(mocks.openExternal).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('Web:维持 openExternal 命中 GET 流式端点', async () => {
    mocks.tauri = false;
    const onOpenChange = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /下载/ }));

    await waitFor(() => expect(mocks.openExternal).toHaveBeenCalled());
    expect(mocks.getUrl).toHaveBeenCalledWith('t1', { format: 'csv' });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.exportToPath).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
