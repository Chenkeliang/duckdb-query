/**
 * 引擎兼容性配置 API
 *
 * 对应后端 /api/app-config/engine-compat（四个布尔开关，默认全 false，与 DuckDB 原生默认一致）。
 */
import { apiClient, normalizeResponse, handleApiError } from './client';

export interface EngineCompatFlags {
  sqlite_all_varchar: boolean;
  mysql_incomplete_dates_as_nulls: boolean;
  pg_array_as_varchar: boolean;
  unsafe_enable_version_guessing: boolean;
}

export async function getEngineCompat(): Promise<EngineCompatFlags> {
  try {
    const res = await apiClient.get('/api/app-config/engine-compat');
    return normalizeResponse<EngineCompatFlags>(res).data;
  } catch (e) {
    throw handleApiError(e as never, '获取引擎兼容性配置失败');
  }
}

/**
 * 保存引擎兼容性配置。后端 PUT 需要完整的四个字段，这里先读取当前值再合并，
 * 避免只传单个开关时把其余开关意外重置为默认 false。
 */
export async function saveEngineCompat(
  patch: Partial<EngineCompatFlags>
): Promise<EngineCompatFlags> {
  try {
    const current = await getEngineCompat();
    const merged = { ...current, ...patch };
    const res = await apiClient.put('/api/app-config/engine-compat', merged);
    return normalizeResponse<EngineCompatFlags>(res).data;
  } catch (e) {
    throw handleApiError(e as never, '保存引擎兼容性配置失败');
  }
}
