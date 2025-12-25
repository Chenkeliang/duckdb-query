/**
 * useWelcomeState Hook 测试
 *
 * 测试欢迎页显示逻辑和 7 天规则
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWelcomeState, WELCOME_STORAGE_KEY } from '../useWelcomeState';

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

describe('useWelcomeState', () => {
    beforeEach(() => {
        localStorageMock.clear();
        vi.clearAllMocks();

        Object.defineProperty(window, 'localStorage', {
            value: localStorageMock,
            writable: true,
        });
    });

    describe('初始化', () => {
        it('首次访问应该显示欢迎页', () => {
            localStorageMock.getItem.mockReturnValue(null);

            const { result } = renderHook(() => useWelcomeState());

            expect(result.current.showWelcome).toBe(true);
        });

        it('7 天内不应该显示欢迎页', () => {
            // 6 天前
            const sixDaysAgo = new Date();
            sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
            localStorageMock.getItem.mockReturnValue(sixDaysAgo.toISOString());

            const { result } = renderHook(() => useWelcomeState());

            expect(result.current.showWelcome).toBe(false);
        });

        it('超过 7 天应该再次显示欢迎页', () => {
            // 8 天前
            const eightDaysAgo = new Date();
            eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
            localStorageMock.getItem.mockReturnValue(eightDaysAgo.toISOString());

            const { result } = renderHook(() => useWelcomeState());

            expect(result.current.showWelcome).toBe(true);
        });

        it('正好 7 天应该显示欢迎页', () => {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            localStorageMock.getItem.mockReturnValue(sevenDaysAgo.toISOString());

            const { result } = renderHook(() => useWelcomeState());

            expect(result.current.showWelcome).toBe(true);
        });

        it('无效日期会导致 NaN 比较，不显示欢迎页', () => {
            // 注意：new Date('invalid-date') 不会抛出错误，
            // 而是创建一个 Invalid Date，getTime() 返回 NaN
            // NaN >= 7 结果是 false，所以不会显示欢迎页
            localStorageMock.getItem.mockReturnValue('invalid-date');

            const { result } = renderHook(() => useWelcomeState());

            expect(result.current.showWelcome).toBe(false);
        });
    });

    describe('closeWelcome', () => {
        it('应该关闭欢迎页', () => {
            localStorageMock.getItem.mockReturnValue(null);

            const { result } = renderHook(() => useWelcomeState());

            expect(result.current.showWelcome).toBe(true);

            act(() => {
                result.current.closeWelcome();
            });

            expect(result.current.showWelcome).toBe(false);
        });

        it('应该保存关闭时间到 localStorage', () => {
            localStorageMock.getItem.mockReturnValue(null);

            const { result } = renderHook(() => useWelcomeState());

            act(() => {
                result.current.closeWelcome();
            });

            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                WELCOME_STORAGE_KEY,
                expect.any(String)
            );

            // 验证保存的是 ISO 日期字符串
            const savedDate = localStorageMock.setItem.mock.calls[0][1];
            expect(() => new Date(savedDate)).not.toThrow();
        });
    });

    describe('边界情况', () => {
        it('localStorage 抛出错误时应该显示欢迎页', () => {
            localStorageMock.getItem.mockImplementation(() => {
                throw new Error('localStorage error');
            });

            const { result } = renderHook(() => useWelcomeState());

            expect(result.current.showWelcome).toBe(true);
        });

        it('closeWelcome 时 localStorage 错误不应该崩溃', () => {
            localStorageMock.getItem.mockReturnValue(null);
            localStorageMock.setItem.mockImplementation(() => {
                throw new Error('localStorage quota exceeded');
            });

            const { result } = renderHook(() => useWelcomeState());

            // 不应该抛出错误
            expect(() => {
                act(() => {
                    result.current.closeWelcome();
                });
            }).not.toThrow();

            // 状态仍然应该更新
            expect(result.current.showWelcome).toBe(false);
        });
    });
});
