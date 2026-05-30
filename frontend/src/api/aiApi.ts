import { apiClient, normalizeResponse, handleApiError } from './client';

export type AiProviderType = 'openai' | 'anthropic' | 'ollama' | 'openai_compatible';

export interface AiProvider {
  id: string;
  type: AiProviderType;
  base_url?: string | null;
  api_key?: string;          // 写时为明文；读时后端返回掩码 ****
  models: string[];
  enabled: boolean;
}

export interface AiFeatureCfg {
  enabled: boolean;
  provider?: string | null;
  model?: string | null;
}

export interface AiSettings {
  enabled: boolean;
  default_provider?: string | null;
  providers: AiProvider[];
  features: Record<string, AiFeatureCfg>;
  timeout_seconds?: number;
  num_retries?: number;
}

export async function getAiSettings(): Promise<AiSettings> {
  try {
    const res = await apiClient.get('/api/settings/ai');
    return normalizeResponse<AiSettings>(res).data;
  } catch (e) {
    throw handleApiError(e as never, '获取 AI 设置失败');
  }
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  try {
    await apiClient.put('/api/settings/ai', settings);
  } catch (e) {
    throw handleApiError(e as never, '保存 AI 设置失败');
  }
}

export async function testProvider(providerId: string): Promise<{ ok: boolean; sample?: string }> {
  try {
    const res = await apiClient.post(`/api/ai/providers/${providerId}/test`);
    return normalizeResponse<{ ok: boolean; sample?: string }>(res).data;
  } catch (e) {
    throw handleApiError(e as never, '测试供应商失败');
  }
}
