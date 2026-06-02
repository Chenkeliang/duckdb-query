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
  opts?: {
    tables?: string[];
    attachDatabases?: { alias: string; connectionId: string }[];
    locale?: 'zh' | 'en';
  }
): Promise<ErrorFixResult> {
  try {
    const res = await apiClient.post('/api/ai/error-fix', {
      sql,
      error,
      tables: opts?.tables ?? [],
      // 联邦表结构需后端 ATTACH 远端库才能取到，传 alias+connection_id
      attach_databases: (opts?.attachDatabases ?? []).map((d) => ({
        alias: d.alias,
        connection_id: d.connectionId,
      })),
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  content: string;
}

/** 多轮对话：发送历史消息（含最新一条 user），返回 assistant 回复。 */
export async function chat(
  messages: ChatMessage[],
  opts?: {
    tables?: string[];
    attachDatabases?: { alias: string; connectionId: string }[];
    locale?: 'zh' | 'en';
  }
): Promise<ChatResult> {
  try {
    const res = await apiClient.post('/api/ai/chat', {
      messages,
      tables: opts?.tables ?? [],
      // 联邦表 schema 需后端 ATTACH 远端库才能 DESCRIBE，传 alias+connection_id
      attach_databases: (opts?.attachDatabases ?? []).map((d) => ({
        alias: d.alias,
        connection_id: d.connectionId,
      })),
      locale: opts?.locale ?? 'zh',
    });
    return normalizeResponse<ChatResult>(res).data;
  } catch (e) {
    throw handleApiError(e as never, 'AI 对话失败');
  }
}

export interface SuggestChartResult {
  type: 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'kpi';
  x: string | null;
  y: string[];
  agg: 'sum' | 'count' | 'avg' | 'min' | 'max';
  xBin?: 'day' | 'month' | null;
  reason?: string;
}

export async function suggestChart(
  columns: { name: string; type: string }[],
  sample: Record<string, unknown>[],
  opts?: { locale?: 'zh' | 'en' }
): Promise<SuggestChartResult> {
  try {
    const res = await apiClient.post('/api/ai/suggest-chart', {
      columns,
      sample: sample.slice(0, 5),
      locale: opts?.locale ?? 'zh',
    });
    return normalizeResponse<SuggestChartResult>(res).data;
  } catch (e) {
    throw handleApiError(e as never, 'AI 推荐图表失败');
  }
}
