/**
 * 缓存配置工具函数测试
 *
 * **Feature: cache-settings-configurable**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  validateCacheDuration,
  loadCacheSettings,
  saveCacheSettings,
  getCacheConfig,
  resetCacheSettings,
  DEFAULT_CACHE_DURATION,
  MIN_CACHE_DURATION,
  MAX_CACHE_DURATION,
  CACHE_SETTINGS_KEY,
} from '../cacheConfig';

describe('cacheConfig', () => {
  // Mock localStorage
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageMock[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageMock[key];
      }),
      clear: vi.fn(() => {
        localStorageMock = {};
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('validateCacheDuration', () => {
    /**
     * **Property 1: Cache duration validation**
     * **Validates: Requirements 1.2**
     *
     * For any input value, the validation function should:
     * - Accept only positive integers within range 1-120
     * - Return default value for invalid inputs
     */
    it('should accept valid integers in range 1-120', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_CACHE_DURATION, max: MAX_CACHE_DURATION }),
          (value) => {
            const result = validateCacheDuration(value);
            expect(result).toBe(value);
            expect(result).toBeGreaterThanOrEqual(MIN_CACHE_DURATION);
            expect(result).toBeLessThanOrEqual(MAX_CACHE_DURATION);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return default for negative numbers', () => {
      fc.assert(
        fc.property(fc.integer({ max: 0 }), (value) => {
          const result = validateCacheDuration(value);
          expect(result).toBe(DEFAULT_CACHE_DURATION);
        }),
        { numRuns: 100 }
      );
    });

    it('should cap values above MAX_CACHE_DURATION', () => {
      fc.assert(
        fc.property(fc.integer({ min: MAX_CACHE_DURATION + 1, max: 10000 }), (value) => {
          const result = validateCacheDuration(value);
          expect(result).toBe(MAX_CACHE_DURATION);
        }),
        { numRuns: 100 }
      );
    });

    it('should return default for non-integer numbers', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.1, max: 120, noNaN: true }).filter((n) => !Number.isInteger(n)),
          (value) => {
            const result = validateCacheDuration(value);
            expect(result).toBe(DEFAULT_CACHE_DURATION);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return default for null/undefined', () => {
      expect(validateCacheDuration(null)).toBe(DEFAULT_CACHE_DURATION);
      expect(validateCacheDuration(undefined)).toBe(DEFAULT_CACHE_DURATION);
    });

    it('should return default for NaN and Infinity', () => {
      expect(validateCacheDuration(NaN)).toBe(DEFAULT_CACHE_DURATION);
      expect(validateCacheDuration(Infinity)).toBe(DEFAULT_CACHE_DURATION);
      expect(validateCacheDuration(-Infinity)).toBe(DEFAULT_CACHE_DURATION);
    });

    it('should handle string inputs by converting to number', () => {
      expect(validateCacheDuration('30')).toBe(30);
      expect(validateCacheDuration('abc')).toBe(DEFAULT_CACHE_DURATION);
      expect(validateCacheDuration('')).toBe(DEFAULT_CACHE_DURATION);
    });
  });

  describe('loadCacheSettings / saveCacheSettings', () => {
    /**
     * **Property 2: Settings round-trip persistence**
     * **Validates: Requirements 1.3, 6.1, 6.2**
     *
     * For any valid CacheSettings object, saving to localStorage
     * and then loading should produce an equivalent object.
     */
    it('should round-trip valid settings correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_CACHE_DURATION, max: MAX_CACHE_DURATION }),
          (cacheDuration) => {
            const settings = { cacheDuration };

            // Save
            const saveResult = saveCacheSettings(settings);
            expect(saveResult).toBe(true);

            // Load
            const loaded = loadCacheSettings();
            expect(loaded.cacheDuration).toBe(cacheDuration);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return default when localStorage is empty', () => {
      const settings = loadCacheSettings();
      expect(settings.cacheDuration).toBe(DEFAULT_CACHE_DURATION);
    });
  });

  describe('loadCacheSettings with invalid data', () => {
    /**
     * **Property 3: Invalid settings fallback to defaults**
     * **Validates: Requirements 6.3**
     *
     * For any invalid or malformed settings data in localStorage,
     * loading should return the default settings without errors.
     */
    it('should return defaults for malformed JSON', () => {
      localStorageMock[CACHE_SETTINGS_KEY] = 'not valid json {{{';
      const settings = loadCacheSettings();
      expect(settings.cacheDuration).toBe(DEFAULT_CACHE_DURATION);
    });

    it('should return defaults for non-object JSON', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
          (value) => {
            localStorageMock[CACHE_SETTINGS_KEY] = JSON.stringify(value);
            const settings = loadCacheSettings();
            expect(settings.cacheDuration).toBe(DEFAULT_CACHE_DURATION);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return defaults for object with invalid cacheDuration', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string().filter((s) => isNaN(Number(s))),
            fc.constant(null),
            fc.constant(undefined),
            fc.constant({}),
            fc.constant([])
          ),
          (invalidValue) => {
            localStorageMock[CACHE_SETTINGS_KEY] = JSON.stringify({
              cacheDuration: invalidValue,
            });
            const settings = loadCacheSettings();
            expect(settings.cacheDuration).toBe(DEFAULT_CACHE_DURATION);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should normalize out-of-range values', () => {
      // Value too high
      localStorageMock[CACHE_SETTINGS_KEY] = JSON.stringify({ cacheDuration: 500 });
      let settings = loadCacheSettings();
      expect(settings.cacheDuration).toBe(MAX_CACHE_DURATION);

      // Value too low
      localStorageMock[CACHE_SETTINGS_KEY] = JSON.stringify({ cacheDuration: -10 });
      settings = loadCacheSettings();
      expect(settings.cacheDuration).toBe(DEFAULT_CACHE_DURATION);
    });
  });

  describe('getCacheConfig', () => {
    it('should return staleTime and gcTime in milliseconds', () => {
      const cacheDuration = 15; // 15 minutes
      saveCacheSettings({ cacheDuration });

      const config = getCacheConfig();
      const expectedMs = cacheDuration * 60 * 1000;

      expect(config.staleTime).toBe(expectedMs);
      expect(config.gcTime).toBe(expectedMs);
    });

    it('should use default when no settings saved', () => {
      const config = getCacheConfig();
      const expectedMs = DEFAULT_CACHE_DURATION * 60 * 1000;

      expect(config.staleTime).toBe(expectedMs);
      expect(config.gcTime).toBe(expectedMs);
    });
  });

  describe('resetCacheSettings', () => {
    it('should reset to default value', () => {
      // First save a custom value
      saveCacheSettings({ cacheDuration: 60 });
      expect(loadCacheSettings().cacheDuration).toBe(60);

      // Reset
      const result = resetCacheSettings();
      expect(result).toBe(true);
      expect(loadCacheSettings().cacheDuration).toBe(DEFAULT_CACHE_DURATION);
    });
  });
});


describe('getCacheConfig integration', () => {
  /**
   * **Property 4: Cache duration applies to all queries**
   * **Validates: Requirements 4.1**
   *
   * For any configured cache duration value, all TanStack Query hooks
   * should use that value as both staleTime and gcTime (converted to milliseconds).
   */
  it('should convert minutes to milliseconds correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_CACHE_DURATION, max: MAX_CACHE_DURATION }),
        (minutes) => {
          // Save the setting
          saveCacheSettings({ cacheDuration: minutes });

          // Get the config
          const config = getCacheConfig();

          // Verify conversion
          const expectedMs = minutes * 60 * 1000;
          expect(config.staleTime).toBe(expectedMs);
          expect(config.gcTime).toBe(expectedMs);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should use same value for staleTime and gcTime', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_CACHE_DURATION, max: MAX_CACHE_DURATION }),
        (minutes) => {
          saveCacheSettings({ cacheDuration: minutes });
          const config = getCacheConfig();

          // staleTime and gcTime should be equal
          expect(config.staleTime).toBe(config.gcTime);
        }
      ),
      { numRuns: 100 }
    );
  });
});
