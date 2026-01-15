/**
 * useThemePreference Hook 测试
 *
 * 测试主题状态管理、DOM 同步和事件派发
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThemePreference, THEME_STORAGE_KEY } from '../useThemePreference';

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

// Mock matchMedia
const matchMediaMock = vi.fn();

describe('useThemePreference', () => {
    let dispatchEventSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // 重置 localStorage
        localStorageMock.clear();
        vi.clearAllMocks();

        // Mock localStorage
        Object.defineProperty(window, 'localStorage', {
            value: localStorageMock,
            writable: true,
        });

        // Mock matchMedia (默认浅色模式)
        matchMediaMock.mockReturnValue({ matches: false });
        Object.defineProperty(window, 'matchMedia', {
            value: matchMediaMock,
            writable: true,
        });

        // Spy on dispatchEvent
        dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

        // 初始化 DOM 状态
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dq-theme', 'dq-theme--dark', 'dq-theme--light');
    });

    afterEach(() => {
        dispatchEventSpy.mockRestore();
    });

    describe('初始化', () => {
        it('应该从 localStorage 读取 dark 主题', () => {
            localStorageMock.getItem.mockReturnValue('dark');

            const { result } = renderHook(() => useThemePreference());

            expect(result.current.isDarkMode).toBe(true);
        });

        it('应该从 localStorage 读取 light 主题', () => {
            localStorageMock.getItem.mockReturnValue('light');

            const { result } = renderHook(() => useThemePreference());

            expect(result.current.isDarkMode).toBe(false);
        });

        it('应该跟随系统偏好（深色）', () => {
            localStorageMock.getItem.mockReturnValue(null);
            matchMediaMock.mockReturnValue({ matches: true });

            const { result } = renderHook(() => useThemePreference());

            expect(result.current.isDarkMode).toBe(true);
        });

        it('应该跟随系统偏好（浅色）', () => {
            localStorageMock.getItem.mockReturnValue(null);
            matchMediaMock.mockReturnValue({ matches: false });

            const { result } = renderHook(() => useThemePreference());

            expect(result.current.isDarkMode).toBe(false);
        });
    });

    describe('DOM 同步', () => {
        it('应该给 html 添加 dark 类（深色模式）', () => {
            localStorageMock.getItem.mockReturnValue('dark');

            renderHook(() => useThemePreference());

            expect(document.documentElement.classList.contains('dark')).toBe(true);
        });

        it('应该移除 html 的 dark 类（浅色模式）', () => {
            localStorageMock.getItem.mockReturnValue('light');
            document.documentElement.classList.add('dark');

            renderHook(() => useThemePreference());

            expect(document.documentElement.classList.contains('dark')).toBe(false);
        });

        it('应该给 body 添加 dq-theme 基类', () => {
            localStorageMock.getItem.mockReturnValue('light');

            renderHook(() => useThemePreference());

            expect(document.body.classList.contains('dq-theme')).toBe(true);
        });

        it('应该给 body 添加 dq-theme--dark（深色模式）', () => {
            localStorageMock.getItem.mockReturnValue('dark');

            renderHook(() => useThemePreference());

            expect(document.body.classList.contains('dq-theme--dark')).toBe(true);
            expect(document.body.classList.contains('dq-theme--light')).toBe(false);
        });

        it('应该给 body 添加 dq-theme--light（浅色模式）', () => {
            localStorageMock.getItem.mockReturnValue('light');

            renderHook(() => useThemePreference());

            expect(document.body.classList.contains('dq-theme--light')).toBe(true);
            expect(document.body.classList.contains('dq-theme--dark')).toBe(false);
        });
    });

    describe('事件派发', () => {
        it('应该派发 duckquery-theme-change 事件', () => {
            localStorageMock.getItem.mockReturnValue('dark');

            renderHook(() => useThemePreference());

            expect(dispatchEventSpy).toHaveBeenCalled();
            const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
            expect(event.type).toBe('duckquery-theme-change');
            expect(event.detail).toEqual({ isDark: true });
        });
    });

    describe('主题切换', () => {
        it('toggleTheme 应该切换主题', () => {
            localStorageMock.getItem.mockReturnValue('light');

            const { result } = renderHook(() => useThemePreference());

            expect(result.current.isDarkMode).toBe(false);

            act(() => {
                result.current.toggleTheme();
            });

            expect(result.current.isDarkMode).toBe(true);

            act(() => {
                result.current.toggleTheme();
            });

            expect(result.current.isDarkMode).toBe(false);
        });

        it('setIsDarkMode 应该设置主题', () => {
            localStorageMock.getItem.mockReturnValue('light');

            const { result } = renderHook(() => useThemePreference());

            act(() => {
                result.current.setIsDarkMode(true);
            });

            expect(result.current.isDarkMode).toBe(true);
        });

        it('setIsDarkMode 应该支持回调函数', () => {
            localStorageMock.getItem.mockReturnValue('light');

            const { result } = renderHook(() => useThemePreference());

            act(() => {
                result.current.setIsDarkMode((prev) => !prev);
            });

            expect(result.current.isDarkMode).toBe(true);
        });
    });

    describe('localStorage 持久化', () => {
        it('切换主题应该保存到 localStorage', () => {
            localStorageMock.getItem.mockReturnValue('light');

            const { result } = renderHook(() => useThemePreference());

            act(() => {
                result.current.setIsDarkMode(true);
            });

            expect(localStorageMock.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'dark');
        });
    });
});
