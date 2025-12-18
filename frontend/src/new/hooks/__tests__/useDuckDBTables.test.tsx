/**
 * useDuckDBTables Hook 测试
 * 
 * 测试 TanStack Query 缓存和刷新机制
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDuckDBTables, invalidateDuckDBTables, DUCKDB_TABLES_QUERY_KEY } from '../useDuckDBTables';
import * as apiClient from '@/services/apiClient';

// Mock API client
vi.mock('@/services/apiClient');

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // 测试时禁用重试
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useDuckDBTables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功获取表列表', async () => {
    const mockTables = [
      { name: 'table1', type: 'TABLE', row_count: 100 },
      { name: 'table2', type: 'TABLE', row_count: 200 },
    ];

    vi.mocked(apiClient.getDuckDBTables).mockResolvedValue(mockTables);

    const { result } = renderHook(() => useDuckDBTables(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.tables).toEqual(mockTables);
    expect(result.current.isError).toBe(false);
  });

  it('应该处理 API 错误', async () => {
    vi.mocked(apiClient.getDuckDBTables).mockRejectedValue(
      new Error('API Error')
    );

    // 创建一个禁用重试的 QueryClient
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useDuckDBTables(), { wrapper });

    // 等待查询完成（hook 内部的 retry 配置会被 QueryClient 的配置覆盖）
    // 注意：hook 内部配置了 retry: 2，但 QueryClient 的 retry: false 不会覆盖它
    // 所以我们需要等待所有重试完成
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    }, { timeout: 10000 });

    expect(result.current.error).toBeTruthy();
    expect(result.current.tables).toEqual([]);
  });

  it('应该支持手动刷新', async () => {
    const mockTables = [
      { name: 'table1', type: 'TABLE', row_count: 100 },
    ];

    vi.mocked(apiClient.getDuckDBTables).mockResolvedValue(mockTables);

    const { result } = renderHook(() => useDuckDBTables(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 手动刷新
    await result.current.refresh();

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });

    // 验证 API 被调用了 2 次（初始加载 + 手动刷新）
    expect(apiClient.getDuckDBTables).toHaveBeenCalledTimes(2);
  });

  it('应该支持缓存失效', async () => {
    const mockTables = [
      { name: 'table1', type: 'TABLE', row_count: 100 },
    ];

    vi.mocked(apiClient.getDuckDBTables).mockResolvedValue(mockTables);

    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useDuckDBTables(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 使缓存失效
    await invalidateDuckDBTables(queryClient);

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });

    // 验证 API 被调用了 2 次
    expect(apiClient.getDuckDBTables).toHaveBeenCalledTimes(2);
  });

  it('应该在多个组件间共享数据', async () => {
    const mockTables = [
      { name: 'table1', type: 'TABLE', row_count: 100 },
    ];

    vi.mocked(apiClient.getDuckDBTables).mockResolvedValue(mockTables);

    const wrapper = createWrapper();

    // 渲染第一个 hook
    const { result: result1 } = renderHook(() => useDuckDBTables(), { wrapper });

    await waitFor(() => {
      expect(result1.current.isLoading).toBe(false);
    });

    // 渲染第二个 hook（应该使用缓存）
    const { result: result2 } = renderHook(() => useDuckDBTables(), { wrapper });

    // 第二个 hook 应该立即有数据（来自缓存）
    expect(result2.current.tables).toEqual(mockTables);
    expect(result2.current.isLoading).toBe(false);

    // API 只应该被调用 1 次（请求去重）
    expect(apiClient.getDuckDBTables).toHaveBeenCalledTimes(1);
  });

  it('应该返回空数组当数据为 null 或 undefined', async () => {
    vi.mocked(apiClient.getDuckDBTables).mockResolvedValue(null);

    const { result } = renderHook(() => useDuckDBTables(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.tables).toEqual([]);
  });
});

describe('invalidateDuckDBTables', () => {
  it('应该使正确的 queryKey 失效', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateDuckDBTables(queryClient);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: DUCKDB_TABLES_QUERY_KEY,
    });
  });
});
