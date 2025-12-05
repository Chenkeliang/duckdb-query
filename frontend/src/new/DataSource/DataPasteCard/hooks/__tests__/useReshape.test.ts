/**
 * useReshape Hook 单元测试
 */

import { renderHook, act } from '@testing-library/react';
import { useReshape } from '../useReshape';

describe('useReshape', () => {
  describe('初始化', () => {
    it('应该正确初始化空数据', () => {
      const { result } = renderHook(() => useReshape());

      expect(result.current.totalCells).toBe(0);
      expect(result.current.combinations).toEqual([]);
    });

    it('应该正确初始化带数据', () => {
      const { result } = renderHook(() => useReshape(['a', 'b', 'c', 'd', 'e', 'f']));

      expect(result.current.totalCells).toBe(6);
      expect(result.current.combinations.length).toBeGreaterThan(0);
    });
  });

  describe('因数分解', () => {
    it('应该计算 6 的所有因数对', () => {
      const { result } = renderHook(() => useReshape());

      act(() => {
        result.current.initWithData(['1', '2', '3', '4', '5', '6']);
      });

      const combos = result.current.combinations;
      expect(combos).toContainEqual({ rows: 1, cols: 6, label: '1 行 × 6 列' });
      expect(combos).toContainEqual({ rows: 2, cols: 3, label: '2 行 × 3 列' });
      expect(combos).toContainEqual({ rows: 3, cols: 2, label: '3 行 × 2 列' });
      expect(combos).toContainEqual({ rows: 6, cols: 1, label: '6 行 × 1 列' });
    });

    it('应该计算 12 的所有因数对', () => {
      const { result } = renderHook(() => useReshape());

      act(() => {
        result.current.initWithData(Array(12).fill('x'));
      });

      const combos = result.current.combinations;
      expect(combos.length).toBe(6); // 1x12, 2x6, 3x4, 4x3, 6x2, 12x1
    });
  });

  describe('按行填充', () => {
    it('应该正确按行填充', () => {
      const { result } = renderHook(() => useReshape());

      act(() => {
        result.current.initWithData(['1', '2', '3', '4', '5', '6']);
        result.current.setConfig({ rows: 2, cols: 3, direction: 'row' });
      });

      expect(result.current.preview).toEqual([
        ['1', '2', '3'],
        ['4', '5', '6'],
      ]);
    });
  });

  describe('按列填充', () => {
    it('应该正确按列填充', () => {
      const { result } = renderHook(() => useReshape());

      act(() => {
        result.current.initWithData(['1', '2', '3', '4', '5', '6']);
        result.current.setConfig({ rows: 2, cols: 3, direction: 'col' });
      });

      expect(result.current.preview).toEqual([
        ['1', '3', '5'],
        ['2', '4', '6'],
      ]);
    });
  });

  describe('验证', () => {
    it('完美匹配应该返回 success', () => {
      const { result } = renderHook(() => useReshape());

      act(() => {
        result.current.initWithData(['1', '2', '3', '4', '5', '6']);
        result.current.setConfig({ rows: 2, cols: 3 });
      });

      expect(result.current.validation.valid).toBe(true);
      expect(result.current.validation.type).toBe('success');
    });

    it('数据截断应该返回 warning', () => {
      const { result } = renderHook(() => useReshape());

      act(() => {
        result.current.initWithData(['1', '2', '3', '4', '5', '6']);
        result.current.setConfig({ rows: 2, cols: 2 }); // 只能容纳 4 个
      });

      expect(result.current.validation.valid).toBe(true);
      expect(result.current.validation.type).toBe('warning');
      expect(result.current.validation.message).toContain('丢失');
    });

    it('数据填充应该返回 info', () => {
      const { result } = renderHook(() => useReshape());

      act(() => {
        result.current.initWithData(['1', '2', '3', '4', '5', '6']);
        result.current.setConfig({ rows: 3, cols: 3 }); // 需要 9 个
      });

      expect(result.current.validation.valid).toBe(true);
      expect(result.current.validation.type).toBe('info');
      expect(result.current.validation.message).toContain('填充');
    });

    it('无数据应该返回 error', () => {
      const { result } = renderHook(() => useReshape());

      expect(result.current.validation.valid).toBe(false);
      expect(result.current.validation.type).toBe('error');
    });

    it('行列为 0 应该返回 error', () => {
      const { result } = renderHook(() => useReshape());

      act(() => {
        result.current.initWithData(['1', '2', '3']);
        result.current.setConfig({ rows: 0, cols: 3 });
      });

      expect(result.current.validation.valid).toBe(false);
      expect(result.current.validation.type).toBe('error');
    });
  });

  describe('重组执行', () => {
    it('应该返回重组后的数据', () => {
      const { result } = renderHook(() => useReshape());

      act(() => {
        result.current.initWithData(['a', 'b', 'c', 'd']);
        result.current.setConfig({ rows: 2, cols: 2, direction: 'row' });
      });

      let reshaped;
      act(() => {
        reshaped = result.current.reshape();
      });

      expect(reshaped).toEqual([
        ['a', 'b'],
        ['c', 'd'],
      ]);
    });

    it('无效配置应该返回空数组', () => {
      const { result } = renderHook(() => useReshape());

      let reshaped;
      act(() => {
        reshaped = result.current.reshape();
      });

      expect(reshaped).toEqual([]);
    });
  });

  describe('重置', () => {
    it('应该重置为默认配置', () => {
      const { result } = renderHook(() => useReshape());

      act(() => {
        result.current.initWithData(['1', '2', '3', '4']);
        result.current.setConfig({ rows: 2, cols: 2 });
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.config.rows).toBe(1);
      expect(result.current.config.cols).toBe(4);
    });
  });

  describe('自动选择最佳配置', () => {
    it('应该选择最接近正方形的配置', () => {
      const { result } = renderHook(() => useReshape());

      act(() => {
        result.current.initWithData(Array(16).fill('x'));
      });

      // 16 = 4x4 是最接近正方形的
      expect(result.current.config.rows).toBe(4);
      expect(result.current.config.cols).toBe(4);
    });

    it('质数只有 1xN 和 Nx1 两种组合', () => {
      const { result } = renderHook(() => useReshape());

      act(() => {
        result.current.initWithData(Array(7).fill('x')); // 7 是质数
      });

      // 质数只有两种因数分解：1x7 和 7x1
      // 算法选择最接近正方形的，两者距离相同，取决于排序
      const { rows, cols } = result.current.config;
      expect(rows * cols).toBe(7);
      expect([1, 7]).toContain(rows);
      expect([1, 7]).toContain(cols);
    });
  });
});
