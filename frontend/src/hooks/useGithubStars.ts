/**
 * useGithubStars Hook
 * 
 * 异步获取 GitHub 仓库星数。
 * 独立为单独 Hook，避免与其他状态耦合。
 */

import { useState, useEffect } from 'react';

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
 * 从缓存获取星数
 */
function getCachedStars(): number | null {
    if (typeof window === 'undefined') return null;

    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;

        const { count, timestamp }: CachedStars = JSON.parse(cached);

        // 检查缓存是否过期
        if (Date.now() - timestamp < CACHE_TTL) {
            return count;
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
    const [githubStars, setGithubStars] = useState<number | null>(() => getCachedStars());
    const [isLoading, setIsLoading] = useState(githubStars === null);

    useEffect(() => {
        // 如果已有缓存，不需要再请求
        if (githubStars !== null) {
            setIsLoading(false);
            return;
        }

        const fetchStars = async () => {
            try {
                const response = await fetch(GITHUB_API_URL);
                if (response.ok) {
                    const data = await response.json();
                    const count = data.stargazers_count;
                    if (typeof count === 'number') {
                        setGithubStars(count);
                        setCachedStars(count);
                    }
                }
            } catch {
                // 静默失败，不影响应用
            } finally {
                setIsLoading(false);
            }
        };

        fetchStars();
    }, [githubStars]);

    return { githubStars, isLoading };
}

export default useGithubStars;
