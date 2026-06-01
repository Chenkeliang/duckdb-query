import { apiClient, normalizeResponse, handleApiError } from './client';

export type AiProviderType = 'openai' | 'anthropic' | 'ollama' | 'openai_compatible';

export interface AiProvider {
  id: string;               // 稳定主键，default_provider/feature 引用它，不展示给用户编辑
  name?: string;            // 用户可编辑的显示名（缺省回退到 id）
  type: AiProviderType;
  base_url?: string | null;
  api_key?: string;          // 写时为明文；读时后端返回掩码 ****
  models: string[];
  enabled: boolean;
}

export interface AiFeatureCfg {
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

export interface ErrorFixResult {
  explanation: string;
  fixed_sql: string | null;
  safe: boolean;
}

export async function errorFix(
  sql: string,
  error: string,
  opts?: { tables?: string[]; locale?: 'zh' | 'en' }
): Promise<ErrorFixResult> {
  try {
    const res = await apiClient.post('/api/ai/error-fix', {
      sql,
      error,
      tables: opts?.tables ?? [],
      locale: opts?.locale ?? 'zh',
    });
    return normalizeResponse<ErrorFixResult>(res).data;
  } catch (e) {
    throw handleApiError(e as never, 'AI 修复失败');
  }
}

export interface ExplainSqlResult {
  explanation: string;
}

export async function explainSql(
  sql: string,
  opts?: { locale?: 'zh' | 'en' }
): Promise<ExplainSqlResult> {
  try {
    const res = await apiClient.post('/api/ai/explain-sql', {
      sql,
      locale: opts?.locale ?? 'zh',
    });
    return normalizeResponse<ExplainSqlResult>(res).data;
  } catch (e) {
    throw handleApiError(e as never, 'AI 解释失败');
  }
}

export interface NlToSqlResult {
  sql: string;
  used_tables: string[];
  safe: boolean;
}

export async function nlToSql(
  question: string,
  opts?: { tables?: string[]; locale?: 'zh' | 'en' }
): Promise<NlToSqlResult> {
  try {
    const res = await apiClient.post('/api/ai/nl-to-sql', {
      question,
      tables: opts?.tables ?? [],
      locale: opts?.locale ?? 'zh',
    });
    return normalizeResponse<NlToSqlResult>(res).data;
  } catch (e) {
    throw handleApiError(e as never, 'AI 生成 SQL 失败');
  }
}
