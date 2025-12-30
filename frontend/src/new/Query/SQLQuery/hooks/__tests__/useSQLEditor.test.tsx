/**
 * useSQLEditor Hook 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config.js';
import { useSQLEditor } from '../useSQLEditor';

// Mock API
const mockExecuteDuckDBSQL = vi.fn();
vi.mock('@/api', () => ({
  executeDuckDBSQL: (...args: any[]) => mockExecuteDuckDBSQL(...args),
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock cache invalidation
vi.mock('@/new/utils/cacheInvalidation', () => ({
  invalidateAllDataCaches: vi.fn(),
}));

// 测试包装器
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        {children}
      </I18nextProvider>
    </QueryClientProvider>
  );
}

describe('useSQLEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 确保测试使用中文
    i18n.changeLanguage('zh');
    localStorage.clear();
    mockExecuteDuckDBSQL.mockResolvedValue({
      data: [{ id: 1, name: 'test' }],
      row_count: 1,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('初始化', () => {
    it('应该使用默认值初始化', () => {
      const { result } = renderHook(() => useSQLEditor(), {
        wrapper: createWrapper(),
      });

      expect(result.current.sql).toBe('');
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isExecuting).toBe(false);
      expect(result.current.history).toEqual([]);
    });

    it('应该使用初始 SQL 初始化', () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users' }),
        { wrapper: createWrapper() }
      );

      expect(result.current.sql).toBe('SELECT * FROM users');
    });

    it('应该从 localStorage 加载历史记录', () => {
      const historyItem = {
        id: 'test-1',
        sql: 'SELECT * FROM users',
        timestamp: Date.now(),
      };
      localStorage.setItem('duckquery-sql-history', JSON.stringify([historyItem]));

      const { result } = renderHook(() => useSQLEditor(), {
        wrapper: createWrapper(),
      });

      expect(result.current.history).toHaveLength(1);
      expect(result.current.history[0].sql).toBe('SELECT * FROM users');
    });
  });

  describe('SQL 操作', () => {
    it('setSQL 应该更新 SQL', () => {
      const { result } = renderHook(() => useSQLEditor(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setSQL('SELECT * FROM orders');
      });

      expect(result.current.sql).toBe('SELECT * FROM orders');
    });

    it('clear 应该清空 SQL 和结果', () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users' }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.clear();
      });

      expect(result.current.sql).toBe('');
      expect(result.current.result).toBeNull();
    });
  });

  describe('SQL 执行', () => {
    it('应该执行 SQL 并返回结果', async () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users' }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.execute();
      });

      await waitFor(() => {
        expect(result.current.result).not.toBeNull();
      });

      expect(mockExecuteDuckDBSQL).toHaveBeenCalledWith(
        'SELECT * FROM users',
        undefined,
        undefined
      );
    });

    it('空 SQL 不应该执行', async () => {
      const { result } = renderHook(() => useSQLEditor(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.execute();
      });

      expect(mockExecuteDuckDBSQL).not.toHaveBeenCalled();
    });

    it('应该处理执行错误', async () => {
      mockExecuteDuckDBSQL.mockRejectedValueOnce(new Error('SQL syntax error'));

      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'INVALID SQL' }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.execute();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });
    });

    it('应该支持 saveAsTable 选项', async () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users' }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.execute({ saveAsTable: 'new_table' });
      });

      await waitFor(() => {
        expect(mockExecuteDuckDBSQL).toHaveBeenCalledWith(
          'SELECT * FROM users',
          'new_table',
          undefined
        );
      });
    });

    it('应该支持 isPreview 选项', async () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users' }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.execute({ isPreview: true });
      });

      await waitFor(() => {
        expect(mockExecuteDuckDBSQL).toHaveBeenCalledWith(
          'SELECT * FROM users',
          undefined,
          true
        );
      });
    });

    it('执行成功后应该调用 onSuccess 回调', async () => {
      const onSuccess = vi.fn();
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users', onSuccess }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.execute();
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('执行失败后应该调用 onError 回调', async () => {
      mockExecuteDuckDBSQL.mockRejectedValueOnce(new Error('Error'));
      const onError = vi.fn();

      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users', onError }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.execute();
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });
  });

  describe('历史记录', () => {
    it('执行成功后应该添加到历史', async () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users' }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.execute();
      });

      await waitFor(() => {
        expect(result.current.history.length).toBeGreaterThan(0);
      });

      expect(result.current.history[0].sql).toBe('SELECT * FROM users');
    });

    it('执行失败后也应该添加到历史（带错误）', async () => {
      mockExecuteDuckDBSQL.mockRejectedValueOnce(new Error('SQL error'));

      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'INVALID SQL' }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.execute();
      });

      await waitFor(() => {
        expect(result.current.history.length).toBeGreaterThan(0);
      });

      expect(result.current.history[0].error).toBeDefined();
    });

    it('loadFromHistory 应该加载历史 SQL', async () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users' }),
        { wrapper: createWrapper() }
      );

      // 先执行一次
      await act(async () => {
        result.current.execute();
      });

      await waitFor(() => {
        expect(result.current.history.length).toBeGreaterThan(0);
      });

      // 修改 SQL
      act(() => {
        result.current.setSQL('SELECT * FROM orders');
      });

      // 从历史加载
      const historyId = result.current.history[0].id;
      act(() => {
        result.current.loadFromHistory(historyId);
      });

      expect(result.current.sql).toBe('SELECT * FROM users');
    });

    it('removeFromHistory 应该删除历史项', async () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users' }),
        { wrapper: createWrapper() }
      );

      // 先执行一次
      await act(async () => {
        result.current.execute();
      });

      await waitFor(() => {
        expect(result.current.history.length).toBeGreaterThan(0);
      });

      const historyId = result.current.history[0].id;
      act(() => {
        result.current.removeFromHistory(historyId);
      });

      expect(result.current.history).toHaveLength(0);
    });

    it('clearHistory 应该清空所有历史', async () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users' }),
        { wrapper: createWrapper() }
      );

      // 执行多次
      await act(async () => {
        result.current.execute();
      });

      await waitFor(() => {
        expect(result.current.history.length).toBeGreaterThan(0);
      });

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.history).toHaveLength(0);
    });

    it('相同 SQL 应该更新而非重复添加', async () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users' }),
        { wrapper: createWrapper() }
      );

      // 执行两次相同的 SQL
      await act(async () => {
        result.current.execute();
      });

      await waitFor(() => {
        expect(result.current.history.length).toBe(1);
      });

      await act(async () => {
        result.current.execute();
      });

      // 应该只有一条记录
      expect(result.current.history.length).toBe(1);
    });

    it('应该限制历史记录数量', async () => {
      const { result } = renderHook(
        () => useSQLEditor({ maxHistory: 3 }),
        { wrapper: createWrapper() }
      );

      // 执行多次不同的 SQL
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.setSQL(`SELECT ${i} FROM users`);
        });
        await act(async () => {
          result.current.execute();
        });
        await waitFor(() => {
          expect(result.current.history.length).toBeLessThanOrEqual(3);
        });
      }

      expect(result.current.history.length).toBe(3);
    });
  });

  describe('SQL 格式化', () => {
    it('formatSQL 应该格式化 SQL', () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'select * from users where id = 1' }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.formatSQL();
      });

      // 关键字应该大写
      expect(result.current.sql).toContain('SELECT');
      expect(result.current.sql).toContain('FROM');
      expect(result.current.sql).toContain('WHERE');
    });

    it('formatSQL 应该正确处理关键字', () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'select * from users where id = 1 order by name' }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.formatSQL();
      });

      // 关键字应该大写
      expect(result.current.sql).toContain('SELECT');
      expect(result.current.sql).toContain('FROM');
      expect(result.current.sql).toContain('WHERE');
      expect(result.current.sql).toContain('ORDER');
      expect(result.current.sql).toContain('BY');
    });

    it('formatSQL 不应该格式化注释中的关键字', () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'select * from users -- 在 join 查询面板中执行' }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.formatSQL();
      });

      // SQL 关键字应该大写
      expect(result.current.sql).toContain('SELECT');
      expect(result.current.sql).toContain('FROM');
      // 注释中的 join 应该保持小写
      expect(result.current.sql).toContain('-- 在 join 查询面板中执行');
    });

    it('formatSQL 不应该格式化字符串中的关键字', () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: "select * from users where name = 'select from where'" }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.formatSQL();
      });

      // SQL 关键字应该大写
      expect(result.current.sql).toContain('SELECT');
      expect(result.current.sql).toContain('FROM');
      expect(result.current.sql).toContain('WHERE');
      // 字符串中的关键字应该保持原样
      expect(result.current.sql).toContain("'select from where'");
    });
  });

  describe('执行时间', () => {
    it('应该记录执行时间', async () => {
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users' }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.execute();
      });

      await waitFor(() => {
        expect(result.current.executionTime).toBeDefined();
      });
    });
  });

  describe('自定义存储 key', () => {
    it('应该使用自定义存储 key', async () => {
      const customKey = 'custom-sql-history';
      const { result } = renderHook(
        () => useSQLEditor({ initialSQL: 'SELECT * FROM users', storageKey: customKey }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.execute();
      });

      await waitFor(() => {
        expect(result.current.history.length).toBeGreaterThan(0);
      });

      // 检查 localStorage
      const stored = localStorage.getItem(customKey);
      expect(stored).not.toBeNull();
    });
  });
});
