/**
 * DuckDB 扩展管理 API
 *
 * 对应后端 api/routers/duckdb_extensions.py：目录清单 + 按需在线安装 + 安装进度轮询。
 */

import { apiClient, normalizeResponse, handleApiError } from './client';

export type ExtensionCategory = 'datasource' | 'capability';

export interface DuckDBExtensionItem {
  name: string;
  category: ExtensionCategory;
  description: string;
  description_en: string;
  installed: boolean;
  bundled: boolean;
}

export type ExtensionInstallPhase = 'idle' | 'downloading' | 'verifying' | 'done' | 'error';

export interface ExtensionInstallStatus {
  status: ExtensionInstallPhase;
  progress: number;
  error: string | null;
}

/** GET /api/duckdb/extensions —— 精选目录 + 每项的安装状态 */
export async function listDuckDBExtensions(): Promise<DuckDBExtensionItem[]> {
  try {
    const response = await apiClient.get('/api/duckdb/extensions');
    const normalized = normalizeResponse<{ items?: DuckDBExtensionItem[] }>(response);
    return (normalized.items ?? normalized.data?.items ?? []) as DuckDBExtensionItem[];
  } catch (error) {
    throw handleApiError(error as never, '获取扩展列表失败');
  }
}

/** POST /api/duckdb/extensions/{name}/install —— 触发后台安装（已在安装中则幂等） */
export async function installDuckDBExtension(name: string): Promise<void> {
  try {
    await apiClient.post(`/api/duckdb/extensions/${encodeURIComponent(name)}/install`);
  } catch (error) {
    throw handleApiError(error as never, '安装扩展失败');
  }
}

/** GET /api/duckdb/extensions/install/{name} —— 查询安装进度，供轮询使用 */
export async function getDuckDBExtensionInstallStatus(
  name: string
): Promise<ExtensionInstallStatus> {
  try {
    const response = await apiClient.get(
      `/api/duckdb/extensions/install/${encodeURIComponent(name)}`
    );
    return normalizeResponse<ExtensionInstallStatus>(response).data;
  } catch (error) {
    throw handleApiError(error as never, '获取扩展安装进度失败');
  }
}
