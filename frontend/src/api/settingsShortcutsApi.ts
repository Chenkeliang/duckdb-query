/**
 * 设置：键盘快捷键 API（/api/settings/...）
 */

import { apiClient, handleApiError, normalizeResponse } from './client';

export interface ShortcutRecordApi {
  action_id: string;
  shortcut: string;
  updated_at?: string | null;
}

export interface ShortcutsConfigPayload {
  shortcuts: ShortcutRecordApi[];
  defaults: Record<string, unknown>;
}

export async function fetchShortcutsConfig(): Promise<ShortcutsConfigPayload> {
  try {
    const response = await apiClient.get('/api/settings/shortcuts');
    const normalized = normalizeResponse<ShortcutsConfigPayload>(response);
    return normalized.data as ShortcutsConfigPayload;
  } catch (error) {
    throw handleApiError(error as never, '获取快捷键配置失败');
  }
}

export async function updateShortcutSetting(actionId: string, shortcut: string): Promise<void> {
  try {
    await apiClient.put(`/api/settings/shortcuts/${encodeURIComponent(actionId)}`, { shortcut });
  } catch (error) {
    throw handleApiError(error as never, '更新快捷键失败');
  }
}

export async function resetShortcutsSetting(actionId?: string): Promise<void> {
  try {
    await apiClient.post('/api/settings/shortcuts/reset', { action_id: actionId ?? null });
  } catch (error) {
    throw handleApiError(error as never, '重置快捷键失败');
  }
}
