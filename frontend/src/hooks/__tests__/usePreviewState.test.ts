/**
 * usePreviewState Hook 测试
 *
 * 测试预览 SQL 状态管理
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePreviewState } from '../usePreviewState';

describe('usePreviewState', () => {
    describe('初始化', () => {
        it('初始状态应该为空字符串', () => {
            const { result } = renderHook(() => usePreviewState());

            expect(result.current.previewQuery).toBe('');
        });
    });

    describe('setPreviewQuery', () => {
        it('应该设置预览查询', () => {
            const { result } = renderHook(() => usePreviewState());

            act(() => {
                result.current.setPreviewQuery('SELECT * FROM users');
            });

            expect(result.current.previewQuery).toBe('SELECT * FROM users');
        });

        it('应该更新预览查询', () => {
            const { result } = renderHook(() => usePreviewState());

            act(() => {
                result.current.setPreviewQuery('SELECT * FROM users');
            });

            act(() => {
                result.current.setPreviewQuery('SELECT * FROM orders');
            });

            expect(result.current.previewQuery).toBe('SELECT * FROM orders');
        });
    });

    describe('clearPreviewQuery', () => {
        it('应该清除预览查询', () => {
            const { result } = renderHook(() => usePreviewState());

            act(() => {
                result.current.setPreviewQuery('SELECT * FROM users');
            });

            expect(result.current.previewQuery).toBe('SELECT * FROM users');

            act(() => {
                result.current.clearPreviewQuery();
            });

            expect(result.current.previewQuery).toBe('');
        });

        it('清除空查询不应该出错', () => {
            const { result } = renderHook(() => usePreviewState());

            expect(() => {
                act(() => {
                    result.current.clearPreviewQuery();
                });
            }).not.toThrow();

            expect(result.current.previewQuery).toBe('');
        });
    });

    describe('函数引用稳定性', () => {
        it('setPreviewQuery 引用应该稳定', () => {
            const { result, rerender } = renderHook(() => usePreviewState());

            const firstRef = result.current.setPreviewQuery;

            rerender();

            expect(result.current.setPreviewQuery).toBe(firstRef);
        });

        it('clearPreviewQuery 引用应该稳定', () => {
            const { result, rerender } = renderHook(() => usePreviewState());

            const firstRef = result.current.clearPreviewQuery;

            rerender();

            expect(result.current.clearPreviewQuery).toBe(firstRef);
        });
    });
});
