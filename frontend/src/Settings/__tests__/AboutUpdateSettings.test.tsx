/**
 * 关于与更新设置卡:版本展示 + 手动检查更新三态(有更新/已最新/失败),
 * 复用 UpdateChecker 的 checkForUpdate/promptUpdate;Web 下不渲染。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    tauri: true,
    getVersion: vi.fn(async () => '1.1.1'),
    checkForUpdate: vi.fn(),
    promptUpdate: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  },
}));

vi.mock('@tauri-apps/api/app', () => ({ getVersion: mocks.getVersion }));
vi.mock('@/desktop/openExternal', () => ({ isTauri: () => mocks.tauri }));
vi.mock('@/desktop/UpdateChecker', () => ({
  checkForUpdate: mocks.checkForUpdate,
  promptUpdate: mocks.promptUpdate,
}));
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: unknown) =>
      typeof defaultValue === 'string' ? defaultValue : key,
  }),
}));

import { AboutUpdateSettings } from '../AboutUpdateSettings';

describe('AboutUpdateSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tauri = true;
  });

  it('展示当前版本号', async () => {
    render(<AboutUpdateSettings />);
    await waitFor(() => expect(screen.getByText('v1.1.1')).toBeInTheDocument());
  });

  it('检查到新版本 → 走 promptUpdate(与启动检查同链路)', async () => {
    mocks.checkForUpdate.mockResolvedValue({ version: '9.9.9' });
    render(<AboutUpdateSettings />);

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }));

    await waitFor(() =>
      expect(mocks.promptUpdate).toHaveBeenCalledWith({ version: '9.9.9' })
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('已是最新 → success toast;检查失败 → error toast', async () => {
    mocks.checkForUpdate.mockResolvedValue(null);
    render(<AboutUpdateSettings />);
    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());

    mocks.checkForUpdate.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.promptUpdate).not.toHaveBeenCalled();
  });

  it('Web(非 Tauri)不渲染', () => {
    mocks.tauri = false;
    const { container } = render(<AboutUpdateSettings />);
    expect(container.firstChild).toBeNull();
  });
});
