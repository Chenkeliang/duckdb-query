/**
 * 行列重组 Hook
 * 
 * 将一维数据重组为二维表格：
 * - 支持自定义行列数
 * - 支持按行/按列填充
 * - 自动计算可行的行列组合
 * - 验证重组参数
 */

import { useState, useCallback, useMemo } from 'react';

// ============ 类型定义 ============

export type FillDirection = 'row' | 'col';

export interface ReshapeConfig {
  rows: number;
  cols: number;
  direction: FillDirection;
}

export interface ReshapeValidation {
  valid: boolean;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
}

export interface ReshapeCombination {
  rows: number;
  cols: number;
  label: string;
}

interface UseReshapeReturn {
  // 配置
  config: ReshapeConfig;
  setConfig: (config: Partial<ReshapeConfig>) => void;
  
  // 可行的组合
  combinations: ReshapeCombination[];
  
  // 验证
  validation: ReshapeValidation;
  
  // 预览
  preview: string[][];
  
  // 操作
  reshape: () => string[][];
  reset: () => void;
  initWithData: (data: string[]) => void;
  
  // 原始数据
  totalCells: number;
}

// ============ 工具函数 ============

/**
 * 计算一个数的所有因数对
 */
const getFactorPairs = (n: number): Array<[number, number]> => {
  const pairs: Array<[number, number]> = [];
  for (let i = 1; i <= Math.sqrt(n); i++) {
    if (n % i === 0) {
      pairs.push([i, n / i]);
      if (i !== n / i) {
        pairs.push([n / i, i]);
      }
    }
  }
  // 按行数排序
  return pairs.sort((a, b) => a[0] - b[0]);
};

/**
 * 将一维数组重组为二维数组
 */
const reshapeArray = (
  data: string[],
  rows: number,
  cols: number,
  direction: FillDirection
): string[][] => {
  const result: string[][] = [];
  
  for (let i = 0; i < rows; i++) {
    const row: string[] = [];
    for (let j = 0; j < cols; j++) {
      const idx = direction === 'row' 
        ? i * cols + j 
        : j * rows + i;
      row.push(data[idx] ?? '');
    }
    result.push(row);
  }
  
  return result;
};

// ============ 主 Hook ============

export const useReshape = (initialData: string[] = []): UseReshapeReturn => {
  const [data, setData] = useState<string[]>(initialData);
  const [config, setConfigState] = useState<ReshapeConfig>({
    rows: 1,
    cols: initialData.length || 1,
    direction: 'row',
  });

  const totalCells = useMemo(() => data.length, [data.length]);

  /**
   * 计算所有可行的行列组合
   */
  const combinations = useMemo((): ReshapeCombination[] => {
    if (totalCells === 0) return [];
    
    const pairs = getFactorPairs(totalCells);
    return pairs.map(([rows, cols]) => ({
      rows,
      cols,
      label: `${rows} 行 × ${cols} 列`,
    }));
  }, [totalCells]);

  /**
   * 验证当前配置
   */
  const validation = useMemo((): ReshapeValidation => {
    if (totalCells === 0) {
      return {
        valid: false,
        message: '没有数据可重组',
        type: 'error',
      };
    }

    if (config.rows <= 0 || config.cols <= 0) {
      return {
        valid: false,
        message: '行数和列数必须大于 0',
        type: 'error',
      };
    }

    const targetCells = config.rows * config.cols;

    if (targetCells === totalCells) {
      return {
        valid: true,
        message: `${config.rows}×${config.cols}=${targetCells}，完美匹配 ✓`,
        type: 'success',
      };
    }

    if (targetCells < totalCells) {
      const lost = totalCells - targetCells;
      return {
        valid: true,
        message: `将丢失 ${lost} 个单元格`,
        type: 'warning',
      };
    }

    // targetCells > totalCells
    const fill = targetCells - totalCells;
    return {
      valid: true,
      message: `将填充 ${fill} 个空单元格`,
      type: 'info',
    };
  }, [config.rows, config.cols, totalCells]);

  /**
   * 预览重组结果
   */
  const preview = useMemo((): string[][] => {
    if (!validation.valid || data.length === 0) {
      return [];
    }
    return reshapeArray(data, config.rows, config.cols, config.direction);
  }, [data, config, validation.valid]);

  /**
   * 更新配置
   */
  const setConfig = useCallback((newConfig: Partial<ReshapeConfig>) => {
    setConfigState(prev => ({ ...prev, ...newConfig }));
  }, []);

  /**
   * 执行重组
   */
  const reshape = useCallback((): string[][] => {
    if (!validation.valid) {
      return [];
    }
    return reshapeArray(data, config.rows, config.cols, config.direction);
  }, [data, config, validation.valid]);

  /**
   * 重置配置
   */
  const reset = useCallback(() => {
    setConfigState({
      rows: 1,
      cols: data.length || 1,
      direction: 'row',
    });
  }, [data.length]);

  /**
   * 设置新数据并自动计算最佳配置
   */
  const initWithData = useCallback((newData: string[]) => {
    setData(newData);
    // 自动设置为最接近正方形的组合
    if (newData.length > 0) {
      const pairs = getFactorPairs(newData.length);
      if (pairs.length > 0) {
        // 找最接近正方形的组合
        const best = pairs.reduce((a, b) => 
          Math.abs(a[0] - a[1]) < Math.abs(b[0] - b[1]) ? a : b
        );
        setConfigState({
          rows: best[0],
          cols: best[1],
          direction: 'row',
        });
      } else {
        setConfigState({
          rows: 1,
          cols: newData.length,
          direction: 'row',
        });
      }
    }
  }, []);

  return {
    config,
    setConfig,
    combinations,
    validation,
    preview,
    reshape,
    reset,
    initWithData,
    totalCells,
  };
};

export default useReshape;
