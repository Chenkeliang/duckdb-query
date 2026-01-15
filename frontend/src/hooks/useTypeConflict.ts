/**
 * 类型冲突检测和管理 Hook
 * 
 * 用于检测 JOIN 条件中的类型不兼容问题，并提供解决方案管理。
 * 
 * 特性：
 * - 自动检测类型冲突
 * - 基于内容的 key（而非索引），确保配置变化时解决方案仍有效
 * - 跳过同列 JOIN（同表同列名）
 * - 提供推荐类型和手动选择
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  areTypesCompatible,
  getRecommendedCastType,
  generateConflictKey,
  isSameColumn,
  getTypeDisplayName,
} from '@/utils/duckdbTypes';

/**
 * 列对（用于比较的两列）
 */
export interface ColumnPair {
  /** 左侧标识（表名或别名） */
  leftLabel: string;
  /** 左列名 */
  leftColumn: string;
  /** 左列类型 */
  leftType: string;
  /** 右侧标识（表名或别名） */
  rightLabel: string;
  /** 右列名 */
  rightColumn: string;
  /** 右列类型 */
  rightType: string;
}

/**
 * 类型冲突对象
 */
export interface TypeConflict {
  /** 唯一标识符（基于内容：leftLabel.leftColumn::rightLabel.rightColumn） */
  key: string;
  /** 左侧标识（表名或别名） */
  leftLabel: string;
  /** 左列名 */
  leftColumn: string;
  /** 左列类型（原始类型，如 DECIMAL(18,4)） */
  leftType: string;
  /** 左列类型显示名 */
  leftTypeDisplay: string;
  /** 右侧标识（表名或别名） */
  rightLabel: string;
  /** 右列名 */
  rightColumn: string;
  /** 右列类型（原始类型） */
  rightType: string;
  /** 右列类型显示名 */
  rightTypeDisplay: string;
  /** 系统推荐的转换类型 */
  recommendedType: string;
  /** 用户选择的转换类型（undefined 表示未解决） */
  resolvedType?: string;
}

/**
 * Hook 返回值
 */
export interface UseTypeConflictReturn {
  /** 所有检测到的冲突 */
  conflicts: TypeConflict[];
  /** 未解决的冲突数量 */
  unresolvedCount: number;
  /** 是否存在冲突 */
  hasConflicts: boolean;
  /** 是否所有冲突都已解决 */
  allResolved: boolean;
  /** 解决单个冲突 */
  resolveConflict: (key: string, targetType: string) => void;
  /** 一键应用所有推荐类型 */
  resolveAllWithRecommendations: () => void;
  /** 清除所有解决方案 */
  clearResolutions: () => void;
  /** 根据 key 获取冲突 */
  getConflict: (key: string) => TypeConflict | undefined;
  /** 获取已解决的类型映射 { key: resolvedType } */
  resolvedTypes: Record<string, string>;
}

/**
 * 通用类型冲突检测和管理 Hook
 * 
 * @param columnPairs - 需要检查的列对列表
 * @returns 冲突检测结果和管理方法
 * 
 * @example
 * // 在 JoinQueryPanel 中使用
 * const columnPairs = joinConfigs.flatMap((config, i) => 
 *   config.conditions.map((cond) => ({
 *     leftLabel: leftTableName,
 *     leftColumn: cond.leftColumn,
 *     leftType: getColumnType(leftTableName, cond.leftColumn),
 *     rightLabel: rightTableName,
 *     rightColumn: cond.rightColumn,
 *     rightType: getColumnType(rightTableName, cond.rightColumn),
 *   }))
 * );
 * const { conflicts, resolveConflict, hasConflicts } = useTypeConflict(columnPairs);
 */
export function useTypeConflict(columnPairs: ColumnPair[]): UseTypeConflictReturn {
  // 存储用户的解决方案 { key: targetType }
  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  // 计算冲突列表
  const conflicts = useMemo<TypeConflict[]>(() => {
    const result: TypeConflict[] = [];
    
    for (const pair of columnPairs) {
      // 跳过空列名
      if (!pair.leftColumn || !pair.rightColumn) continue;
      
      // 跳过同列 JOIN（同表同列名）
      if (isSameColumn(pair.leftLabel, pair.leftColumn, pair.rightLabel, pair.rightColumn)) {
        continue;
      }
      
      // 检查类型兼容性
      if (!areTypesCompatible(pair.leftType, pair.rightType)) {
        const key = generateConflictKey(
          pair.leftLabel,
          pair.leftColumn,
          pair.rightLabel,
          pair.rightColumn
        );
        
        result.push({
          key,
          leftLabel: pair.leftLabel,
          leftColumn: pair.leftColumn,
          leftType: pair.leftType,
          leftTypeDisplay: getTypeDisplayName(pair.leftType),
          rightLabel: pair.rightLabel,
          rightColumn: pair.rightColumn,
          rightType: pair.rightType,
          rightTypeDisplay: getTypeDisplayName(pair.rightType),
          recommendedType: getRecommendedCastType(pair.leftType, pair.rightType),
          resolvedType: resolutions[key],
        });
      }
    }
    
    return result;
  }, [columnPairs, resolutions]);

  // 当 columnPairs 变化时，清理失效的解决方案
  useEffect(() => {
    const validKeys = new Set(
      columnPairs
        .filter(p => p.leftColumn && p.rightColumn)
        .map(p => generateConflictKey(p.leftLabel, p.leftColumn, p.rightLabel, p.rightColumn))
    );
    
    setResolutions(prev => {
      const cleaned: Record<string, string> = {};
      let hasChanges = false;
      
      for (const [key, value] of Object.entries(prev)) {
        if (validKeys.has(key)) {
          cleaned[key] = value;
        } else {
          hasChanges = true;
        }
      }
      
      return hasChanges ? cleaned : prev;
    });
  }, [columnPairs]);

  // 计算统计信息
  const unresolvedCount = useMemo(() => {
    return conflicts.filter(c => !c.resolvedType).length;
  }, [conflicts]);

  const hasConflicts = conflicts.length > 0;
  const allResolved = hasConflicts && unresolvedCount === 0;

  // 解决单个冲突
  const resolveConflict = useCallback((key: string, targetType: string) => {
    setResolutions(prev => ({
      ...prev,
      [key]: targetType,
    }));
  }, []);

  // 一键应用所有推荐类型
  const resolveAllWithRecommendations = useCallback(() => {
    setResolutions(prev => {
      const updated = { ...prev };
      for (const conflict of conflicts) {
        updated[conflict.key] = conflict.recommendedType;
      }
      return updated;
    });
  }, [conflicts]);

  // 清除所有解决方案
  const clearResolutions = useCallback(() => {
    setResolutions({});
  }, []);

  // 根据 key 获取冲突
  const getConflict = useCallback((key: string): TypeConflict | undefined => {
    return conflicts.find(c => c.key === key);
  }, [conflicts]);

  // 获取已解决的类型映射
  const resolvedTypes = useMemo(() => {
    const result: Record<string, string> = {};
    for (const conflict of conflicts) {
      if (conflict.resolvedType) {
        result[conflict.key] = conflict.resolvedType;
      }
    }
    return result;
  }, [conflicts]);

  return {
    conflicts,
    unresolvedCount,
    hasConflicts,
    allResolved,
    resolveConflict,
    resolveAllWithRecommendations,
    clearResolutions,
    getConflict,
    resolvedTypes,
  };
}

export default useTypeConflict;
