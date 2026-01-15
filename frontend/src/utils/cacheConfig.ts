/**
 * 缓存配置工具函数
 *
 * 用于管理 TanStack Query 的缓存时间配置
 */

/** 默认缓存有效期（分钟） */
export const DEFAULT_CACHE_DURATION = 30;

/** 缓存有效期最小值（分钟） */
export const MIN_CACHE_DURATION = 1;

/** 缓存有效期最大值（分钟） */
export const MAX_CACHE_DURATION = 120;

/** localStorage 存储键 */
export const CACHE_SETTINGS_KEY = 'duckquery-cache-settings';

/**
 * 缓存设置接口
 */
export interface CacheSettings {
  /** 缓存有效期（分钟） */
  cacheDuration: number;
}

/**
 * 缓存配置接口（毫秒）
 */
export interface CacheConfig {
  /** staleTime（毫秒） */
  staleTime: number;
  /** gcTime（毫秒） */
  gcTime: number;
}

/**
 * 验证缓存有效期输入
 *
 * @param value - 输入值
 * @returns 有效的缓存有效期（分钟），无效输入返回默认值
 */
export function validateCacheDuration(value: unknown): number {
  // 处理 null/undefined
  if (value === null || value === undefined) {
    return DEFAULT_CACHE_DURATION;
  }

  // 尝试转换为数字
  const num = typeof value === 'number' ? value : Number(value);

  // 检查是否为有效数字
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return DEFAULT_CACHE_DURATION;
  }

  // 检查是否为正整数
  if (!Number.isInteger(num) || num < MIN_CACHE_DURATION) {
    return DEFAULT_CACHE_DURATION;
  }

  // 限制在有效范围内
  if (num > MAX_CACHE_DURATION) {
    return MAX_CACHE_DURATION;
  }

  return num;
}

/**
 * 从 localStorage 读取缓存设置
 *
 * @returns 缓存设置对象
 */
export function loadCacheSettings(): CacheSettings {
  try {
    // 检查 localStorage 是否可用
    if (typeof window === 'undefined' || !window.localStorage) {
      return { cacheDuration: DEFAULT_CACHE_DURATION };
    }

    const stored = localStorage.getItem(CACHE_SETTINGS_KEY);
    if (!stored) {
      return { cacheDuration: DEFAULT_CACHE_DURATION };
    }

    const parsed = JSON.parse(stored);

    // 验证解析结果
    if (typeof parsed !== 'object' || parsed === null) {
      return { cacheDuration: DEFAULT_CACHE_DURATION };
    }

    return {
      cacheDuration: validateCacheDuration(parsed.cacheDuration),
    };
  } catch {
    // JSON 解析失败或其他错误，返回默认值
    console.warn('[CacheConfig] Failed to load cache settings, using defaults');
    return { cacheDuration: DEFAULT_CACHE_DURATION };
  }
}

/**
 * 保存缓存设置到 localStorage
 *
 * @param settings - 缓存设置对象
 * @returns 是否保存成功
 */
export function saveCacheSettings(settings: CacheSettings): boolean {
  try {
    // 检查 localStorage 是否可用
    if (typeof window === 'undefined' || !window.localStorage) {
      console.warn('[CacheConfig] localStorage not available');
      return false;
    }

    // 验证并规范化设置
    const normalizedSettings: CacheSettings = {
      cacheDuration: validateCacheDuration(settings.cacheDuration),
    };

    localStorage.setItem(CACHE_SETTINGS_KEY, JSON.stringify(normalizedSettings));
    return true;
  } catch (error) {
    console.error('[CacheConfig] Failed to save cache settings:', error);
    return false;
  }
}

/**
 * 获取 TanStack Query 缓存配置（毫秒）
 *
 * @returns 缓存配置对象，包含 staleTime 和 gcTime
 */
export function getCacheConfig(): CacheConfig {
  const settings = loadCacheSettings();
  const durationMs = settings.cacheDuration * 60 * 1000;

  return {
    staleTime: durationMs,
    gcTime: durationMs,
  };
}

/**
 * 重置缓存设置为默认值
 *
 * @returns 是否重置成功
 */
export function resetCacheSettings(): boolean {
  return saveCacheSettings({ cacheDuration: DEFAULT_CACHE_DURATION });
}
