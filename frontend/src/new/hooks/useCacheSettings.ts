/**
 * 缓存设置 Hook
 *
 * 用于管理 TanStack Query 的缓存时间配置
 *
 * 特性：
 * - 读取/保存缓存设置到 localStorage
 * - 提供更新设置的方法
 * - 提供重置为默认值的方法
 * - 提供清除所有缓存的方法
 *
 * 使用示例：
 * ```tsx
 * const { settings, updateSettings, resetToDefaults, clearAllCache } = useCacheSettings();
 *
 * // 更新缓存时间
 * updateSettings({ cacheDuration: 60 });
 *
 * // 重置为默认值
 * resetToDefaults();
 *
 * // 清除所有缓存
 * await clearAllCache();
 * ```
 */

import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  loadCacheSettings,
  saveCacheSettings,
  resetCacheSettings,
  validateCacheDuration,
  DEFAULT_CACHE_DURATION,
  type CacheSettings,
} from '../utils/cacheConfig';

export interface UseCacheSettingsReturn {
  /** 当前缓存设置 */
  settings: CacheSettings;
  /** 更新缓存设置 */
  updateSettings: (newSettings: Partial<CacheSettings>) => boolean;
  /** 重置为默认值 */
  resetToDefaults: () => boolean;
  /** 清除所有 TanStack Query 缓存 */
  clearAllCache: () => Promise<void>;
  /** 是否正在加载 */
  isLoading: boolean;
}

/**
 * 缓存设置 Hook
 */
export function useCacheSettings(): UseCacheSettingsReturn {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<CacheSettings>(() => loadCacheSettings());
  const [isLoading, setIsLoading] = useState(false);

  // 组件挂载时加载设置
  useEffect(() => {
    const loaded = loadCacheSettings();
    setSettings(loaded);
  }, []);

  /**
   * 更新缓存设置
   */
  const updateSettings = useCallback((newSettings: Partial<CacheSettings>): boolean => {
    const updatedSettings: CacheSettings = {
      cacheDuration: validateCacheDuration(
        newSettings.cacheDuration ?? settings.cacheDuration
      ),
    };

    const success = saveCacheSettings(updatedSettings);
    if (success) {
      setSettings(updatedSettings);
    }
    return success;
  }, [settings]);

  /**
   * 重置为默认值
   */
  const resetToDefaults = useCallback((): boolean => {
    const success = resetCacheSettings();
    if (success) {
      setSettings({ cacheDuration: DEFAULT_CACHE_DURATION });
    }
    return success;
  }, []);

  /**
   * 清除所有 TanStack Query 缓存
   */
  const clearAllCache = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      // 清除所有查询缓存
      await queryClient.invalidateQueries();
      // 重置所有查询状态
      queryClient.clear();
    } finally {
      setIsLoading(false);
    }
  }, [queryClient]);

  return {
    settings,
    updateSettings,
    resetToDefaults,
    clearAllCache,
    isLoading,
  };
}

// 重新导出类型和常量
export type { CacheSettings } from '../utils/cacheConfig';
export {
  DEFAULT_CACHE_DURATION,
  MIN_CACHE_DURATION,
  MAX_CACHE_DURATION,
} from '../utils/cacheConfig';
