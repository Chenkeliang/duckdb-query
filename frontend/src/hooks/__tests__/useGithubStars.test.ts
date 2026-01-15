/**
 * useGithubStars Hook 测试
 *
 * 测试 GitHub 星数获取、缓存读写
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGithubStars } from '../useGithubStars';

const CACHE_KEY = 'duck-query-github-stars';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
    };
})();

// Mock fetch
const mockFetch = vi.fn();

describe('useGithubStars', () => {
    beforeEach(() => {
        localStorageMock.clear();
        vi.clearAllMocks();

        Object.defineProperty(window, 'localStorage', {
            value: localStorageMock,
            writable: true,
        });

        global.fetch = mockFetch;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('缓存读取', () => {
        it('应该从缓存读取星数', async () => {
            const cache = {
                count: 123,
                timestamp: Date.now(),
            };
            localStorageMock.getItem.mockReturnValue(JSON.stringify(cache));

            const { result } = renderHook(() => useGithubStars());

            expect(result.current.githubStars).toBe(123);
            expect(result.current.isLoading).toBe(false);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('过期缓存应该重新请求', async () => {
            const cache = {
                count: 100,
                timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 小时前
            };
            localStorageMock.getItem.mockReturnValue(JSON.stringify(cache));

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ stargazers_count: 150 }),
            });

            const { result } = renderHook(() => useGithubStars());

            // 初始缓存为 null（过期）
            expect(result.current.githubStars).toBe(null);
            expect(result.current.isLoading).toBe(true);

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.githubStars).toBe(150);
            expect(mockFetch).toHaveBeenCalled();
        });

        it('无效缓存应该重新请求', async () => {
            localStorageMock.getItem.mockReturnValue('invalid-json');

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ stargazers_count: 200 }),
            });

            const { result } = renderHook(() => useGithubStars());

            expect(result.current.githubStars).toBe(null);

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.githubStars).toBe(200);
        });
    });

    describe('API 请求', () => {
        it('无缓存时应该请求 API', async () => {
            localStorageMock.getItem.mockReturnValue(null);

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ stargazers_count: 500 }),
            });

            const { result } = renderHook(() => useGithubStars());

            expect(result.current.isLoading).toBe(true);

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.githubStars).toBe(500);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('api.github.com/repos')
            );
        });

        it('API 失败时应该静默处理', async () => {
            localStorageMock.getItem.mockReturnValue(null);

            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            const { result } = renderHook(() => useGithubStars());

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.githubStars).toBe(null);
        });

        it('网络错误时应该静默处理', async () => {
            localStorageMock.getItem.mockReturnValue(null);

            mockFetch.mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useGithubStars());

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.githubStars).toBe(null);
        });
    });

    describe('缓存写入', () => {
        it('API 成功后应该缓存结果', async () => {
            localStorageMock.getItem.mockReturnValue(null);

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ stargazers_count: 300 }),
            });

            const { result } = renderHook(() => useGithubStars());

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                CACHE_KEY,
                expect.stringContaining('"count":300')
            );
        });

        it('缓存写入失败不应该崩溃', async () => {
            localStorageMock.getItem.mockReturnValue(null);
            localStorageMock.setItem.mockImplementation(() => {
                throw new Error('quota exceeded');
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ stargazers_count: 400 }),
            });

            const { result } = renderHook(() => useGithubStars());

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // 状态仍然应该更新
            expect(result.current.githubStars).toBe(400);
        });
    });
});
