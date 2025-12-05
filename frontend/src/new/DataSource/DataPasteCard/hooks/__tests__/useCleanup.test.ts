/**
 * useCleanup Hook 单元测试
 */

import { renderHook, act } from '@testing-library/react';
import { useCleanup } from '../useCleanup';

describe('useCleanup', () => {
  const sampleData = [
    ['"name"', ' age ', 'N/A'],
    ['"John"', ' 25 ', 'null'],
    ["'Jane'", ' 30 ', '-'],
  ];

  describe('去除引号', () => {
    it('应该去除双引号', () => {
      const { result } = renderHook(() => useCleanup([
        ['"hello"', '"world"'],
      ]));

      act(() => {
        result.current.cleanup('quotes');
      });

      expect(result.current.data).toEqual([['hello', 'world']]);
    });

    it('应该去除单引号', () => {
      const { result } = renderHook(() => useCleanup([
        ["'hello'", "'world'"],
      ]));

      act(() => {
        result.current.cleanup('quotes');
      });

      expect(result.current.data).toEqual([['hello', 'world']]);
    });

    it('应该统计清理数量', () => {
      const { result } = renderHook(() => useCleanup([
        ['"a"', '"b"', 'c'],
      ]));

      let cleanupResult;
      act(() => {
        cleanupResult = result.current.cleanup('quotes');
      });

      expect(cleanupResult.affected).toBe(2);
      expect(result.current.stats.quotes).toBe(2);
    });
  });

  describe('去除空格', () => {
    it('应该 trim 所有单元格', () => {
      const { result } = renderHook(() => useCleanup([
        [' hello ', '  world  '],
      ]));

      act(() => {
        result.current.cleanup('spaces');
      });

      expect(result.current.data).toEqual([['hello', 'world']]);
    });

    it('应该统计清理数量', () => {
      const { result } = renderHook(() => useCleanup([
        [' a ', 'b', ' c'],
      ]));

      let cleanupResult;
      act(() => {
        cleanupResult = result.current.cleanup('spaces');
      });

      expect(cleanupResult.affected).toBe(2);
    });
  });

  describe('清理空值', () => {
    it('应该清理 null 值', () => {
      const { result } = renderHook(() => useCleanup([
        ['null', 'NULL', 'Null'],
      ]));

      act(() => {
        result.current.cleanup('nulls');
      });

      expect(result.current.data).toEqual([['', '', '']]);
    });

    it('应该清理 N/A 值', () => {
      const { result } = renderHook(() => useCleanup([
        ['N/A', 'n/a', 'NA'],
      ]));

      act(() => {
        result.current.cleanup('nulls');
      });

      expect(result.current.data).toEqual([['', '', '']]);
    });

    it('应该清理 - 值', () => {
      const { result } = renderHook(() => useCleanup([
        ['-', '--', '---'],
      ]));

      act(() => {
        result.current.cleanup('nulls');
      });

      expect(result.current.data).toEqual([['', '', '']]);
    });
  });

  describe('格式化数字', () => {
    it('应该去除千分位逗号', () => {
      const { result } = renderHook(() => useCleanup([
        ['1,000', '1,000,000'],
      ]));

      act(() => {
        result.current.cleanup('numbers');
      });

      expect(result.current.data).toEqual([['1000', '1000000']]);
    });

    it('应该去除货币符号', () => {
      const { result } = renderHook(() => useCleanup([
        ['$100', '¥200', '€300'],
      ]));

      act(() => {
        result.current.cleanup('numbers');
      });

      expect(result.current.data).toEqual([['100', '200', '300']]);
    });
  });

  describe('全部清理', () => {
    it('应该依次执行所有清理', () => {
      const { result } = renderHook(() => useCleanup([
        ['"hello"', ' world ', 'N/A', '$1,000'],
      ]));

      act(() => {
        result.current.cleanup('all');
      });

      expect(result.current.data).toEqual([['hello', 'world', '', '1000']]);
    });
  });

  describe('撤销功能', () => {
    it('应该能撤销清理操作', () => {
      const original = [['"hello"', '"world"']];
      const { result } = renderHook(() => useCleanup(original));

      act(() => {
        result.current.cleanup('quotes');
      });

      expect(result.current.data).toEqual([['hello', 'world']]);
      expect(result.current.canUndo).toBe(true);

      act(() => {
        result.current.undo();
      });

      expect(result.current.data).toEqual(original);
      expect(result.current.canUndo).toBe(false);
    });

    it('应该支持多次撤销', () => {
      const { result } = renderHook(() => useCleanup([
        ['"hello"', ' world '],
      ]));

      act(() => {
        result.current.cleanup('quotes');
      });

      act(() => {
        result.current.cleanup('spaces');
      });

      expect(result.current.data).toEqual([['hello', 'world']]);

      act(() => {
        result.current.undo();
      });

      expect(result.current.data).toEqual([['hello', ' world ']]);

      act(() => {
        result.current.undo();
      });

      expect(result.current.data).toEqual([['"hello"', ' world ']]);
    });
  });

  describe('检测可清理内容', () => {
    it('应该检测到引号', () => {
      const { result } = renderHook(() => useCleanup([
        ['"hello"', 'world'],
      ]));

      const cleanable = result.current.detectCleanable();
      expect(cleanable.hasQuotes).toBe(true);
    });

    it('应该检测到空格', () => {
      const { result } = renderHook(() => useCleanup([
        [' hello ', 'world'],
      ]));

      const cleanable = result.current.detectCleanable();
      expect(cleanable.hasSpaces).toBe(true);
    });

    it('应该检测到空值', () => {
      const { result } = renderHook(() => useCleanup([
        ['N/A', 'world'],
      ]));

      const cleanable = result.current.detectCleanable();
      expect(cleanable.hasNulls).toBe(true);
    });

    it('应该检测到格式化数字', () => {
      const { result } = renderHook(() => useCleanup([
        ['$1,000', 'world'],
      ]));

      const cleanable = result.current.detectCleanable();
      expect(cleanable.hasFormattedNumbers).toBe(true);
    });
  });

  describe('重置功能', () => {
    it('应该重置数据和历史', () => {
      const { result } = renderHook(() => useCleanup([
        ['"hello"'],
      ]));

      act(() => {
        result.current.cleanup('quotes');
      });

      expect(result.current.canUndo).toBe(true);

      act(() => {
        result.current.reset([['new data']]);
      });

      expect(result.current.data).toEqual([['new data']]);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.stats.total).toBe(0);
    });
  });
});
