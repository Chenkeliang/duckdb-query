/**
 * useGithubStars Hook
 *
 * 异步获取 GitHub 仓库星数（TanStack Query + localStorage 1 小时缓存种子）。
 * 独立为单独 Hook，避免与其他状态耦合。
 */

import { useQuery } from '@tanstack/react-query';

const GITHUB_REPO = 'chenkeliang/duckdb-query';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}`;

// 缓存 key，避免频繁请求
const CACHE_KEY = 'duck-query-github-stars';
const CACHE_TTL = 1000 * 60 * 60; // 1 小时

export interface UseGithubStarsReturn {
    /** GitHub 星数，未获取到时为 null */
    githubStars: number | null;
    /** 是否正在加载 */
    isLoading: boolean;
}

interface CachedStars {
    count: number;
    timestamp: number;
}

/**
 * 读取未过期的缓存条目（过期/异常返回 null）
 */
function getCachedEntry(): CachedStars | null {
    if (typeof window === 'undefined') return null;

    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;

        const entry: CachedStars = JSON.parse(cached);
        if (Date.now() - entry.timestamp < CACHE_TTL) {
            return entry;
        }
    } catch {
        // 忽略解析错误
    }

    return null;
}

/**
 * 缓存星数
 */
function setCachedStars(count: number): void {
    if (typeof window === 'undefined') return;

    try {
        const cache: CachedStars = {
            count,
            timestamp: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
        // 忽略存储错误
    }
}

/**
 * 拉取星数；失败静默返回 null（不影响应用）。
 * fetch 目标为第三方 GitHub API —— AGENTS §4.2 允许的裸 fetch 例外（本后端必须走 apiClient）。
 */
async function fetchGithubStars(): Promise<number | null> {
    try {
        const response = await fetch(GITHUB_API_URL);
        if (!response.ok) return null;

        const data = await response.json();
        const count = data.stargazers_count;
        if (typeof count === 'number') {
            setCachedStars(count);
            return count;
        }
    } catch {
        // 静默失败，不影响应用
    }
    return null;
}

/**
 * GitHub 星数获取 Hook
 *
 * @example
 * ```tsx
 * const { githubStars, isLoading } = useGithubStars();
 *
 * {githubStars !== null && (
 *   <span>⭐ {githubStars}</span>
 * )}
 * ```
 */
export function useGithubStars(): UseGithubStarsReturn {
    const { data, isLoading } = useQuery({
        queryKey: ['github-stars'],
        queryFn: fetchGithubStars,
        // localStorage 种子：命中未过期缓存则不发请求（staleTime 按缓存写入时刻计算）
        initialData: () => getCachedEntry()?.count,
        initialDataUpdatedAt: () => getCachedEntry()?.timestamp,
        staleTime: CACHE_TTL,
        retry: false,
        refetchOnWindowFocus: false,
    });

    return { githubStars: data ?? null, isLoading };
}

export default useGithubStars;
