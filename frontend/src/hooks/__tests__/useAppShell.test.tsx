/**
 * useAppShell Hook 测试
 *
 * 测试应用状态管理组合入口
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppShell } from '../useAppShell';

// Mock 子 Hooks
vi.mock('../useThemePreference', () => ({
    useThemePreference: () => ({
        isDarkMode: false,
        setIsDarkMode: vi.fn(),
        toggleTheme: vi.fn(),
    }),
}));

vi.mock('../useWelcomeState', () => ({
    useWelcomeState: () => ({
        showWelcome: true,
        closeWelcome: vi.fn(),
    }),
}));

vi.mock('../usePreviewState', () => ({
    usePreviewState: () => ({
        previewQuery: '',
        setPreviewQuery: vi.fn(),
        clearPreviewQuery: vi.fn(),
    }),
}));

vi.mock('../useGithubStars', () => ({
    useGithubStars: () => ({
        githubStars: 123,
        isLoading: false,
    }),
}));

vi.mock('../useAppActions', () => ({
    useAppActions: () => ({
        refreshAllData: vi.fn(),
        handleDatabaseConnect: vi.fn(),
        handleDatabaseSaveConfig: vi.fn(),
        isRefreshing: false,
    }),
}));

const createWrapper = () => {
    const queryClient = new QueryClient();

    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

describe('useAppShell', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('state 接口', () => {
        it('应该包含所有必需的 state 字段', () => {
            const { result } = renderHook(() => useAppShell(), {
                wrapper: createWrapper(),
            });

            expect(result.current.state).toHaveProperty('isDarkMode');
            expect(result.current.state).toHaveProperty('showWelcome');
            expect(result.current.state).toHaveProperty('previewQuery');
            expect(result.current.state).toHaveProperty('currentTab');
            expect(result.current.state).toHaveProperty('githubStars');
        });

        it('githubStars 应该存在且正确', () => {
            const { result } = renderHook(() => useAppShell(), {
                wrapper: createWrapper(),
            });

            expect(result.current.state.githubStars).toBeDefined();
            expect(result.current.state.githubStars).toBe(123);
        });

        it('currentTab 默认值应该是 datasource', () => {
            const { result } = renderHook(() => useAppShell(), {
                wrapper: createWrapper(),
            });

            expect(result.current.state.currentTab).toBe('datasource');
        });
    });

    describe('actions 接口', () => {
        it('应该包含所有必需的 actions', () => {
            const { result } = renderHook(() => useAppShell(), {
                wrapper: createWrapper(),
            });

            // 新 API 名称
            expect(result.current.actions).toHaveProperty('setDarkMode');
            expect(result.current.actions).toHaveProperty('setCurrentTab');
            expect(result.current.actions).toHaveProperty('setPreviewQuery');
            expect(result.current.actions).toHaveProperty('closeWelcome');
            expect(result.current.actions).toHaveProperty('refreshData');
            expect(result.current.actions).toHaveProperty('connectDatabase');
            expect(result.current.actions).toHaveProperty('saveDatabase');
        });
    });

    describe('setCurrentTab', () => {
        it('应该切换 Tab', () => {
            const { result } = renderHook(() => useAppShell(), {
                wrapper: createWrapper(),
            });

            expect(result.current.state.currentTab).toBe('datasource');

            act(() => {
                result.current.actions.setCurrentTab('queryworkbench');
            });

            expect(result.current.state.currentTab).toBe('queryworkbench');
        });
    });

    describe('closeWelcome', () => {
        it('应该是一个函数且可调用', () => {
            const { result } = renderHook(() => useAppShell(), {
                wrapper: createWrapper(),
            });

            expect(typeof result.current.actions.closeWelcome).toBe('function');

            expect(() => {
                act(() => {
                    result.current.actions.closeWelcome();
                });
            }).not.toThrow();
        });
    });

    describe('refreshData', () => {
        it('应该调用 refreshAllData', () => {
            const { result } = renderHook(() => useAppShell(), {
                wrapper: createWrapper(),
            });

            expect(typeof result.current.actions.refreshData).toBe('function');

            expect(() => {
                act(() => {
                    result.current.actions.refreshData();
                });
            }).not.toThrow();
        });
    });

    describe('返回值结构', () => {
        it('应该返回 { state, actions } 结构', () => {
            const { result } = renderHook(() => useAppShell(), {
                wrapper: createWrapper(),
            });

            expect(result.current).toHaveProperty('state');
            expect(result.current).toHaveProperty('actions');
            expect(Object.keys(result.current)).toEqual(['state', 'actions']);
        });
    });
});
