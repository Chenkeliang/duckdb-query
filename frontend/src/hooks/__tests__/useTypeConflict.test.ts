/**
 * useTypeConflict Hook 测试
 * 
 * 测试属性：
 * - Property 3: Incompatible types trigger conflicts with correct type names
 * - Property 6: Resolution state persists until condition changes
 * - Property 8: Apply all recommendations sets all conflicts to recommended types
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTypeConflict, type ColumnPair } from '../useTypeConflict';

describe('useTypeConflict', () => {
  /**
   * Property 3: Incompatible types trigger conflicts with correct type names
   * For any pair of columns with incompatible types, the conflict detection
   * SHALL return a conflict object containing the original DuckDB type names.
   */
  describe('Property 3: Conflict detection', () => {
    it('should detect conflict between VARCHAR and INTEGER', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'id',
          leftType: 'VARCHAR',
          rightLabel: 'users',
          rightColumn: 'order_id',
          rightType: 'INTEGER',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      expect(result.current.hasConflicts).toBe(true);
      expect(result.current.conflicts).toHaveLength(1);
      expect(result.current.conflicts[0]).toMatchObject({
        leftLabel: 'orders',
        leftColumn: 'id',
        leftType: 'VARCHAR',
        leftTypeDisplay: 'VARCHAR',
        rightLabel: 'users',
        rightColumn: 'order_id',
        rightType: 'INTEGER',
        rightTypeDisplay: 'INTEGER',
      });
    });

    it('should preserve original type names with precision', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'amount',
          leftType: 'DECIMAL(18,4)',
          rightLabel: 'users',
          rightColumn: 'balance',
          rightType: 'VARCHAR(255)',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      expect(result.current.conflicts[0].leftType).toBe('DECIMAL(18,4)');
      expect(result.current.conflicts[0].leftTypeDisplay).toBe('DECIMAL(18,4)');
      expect(result.current.conflicts[0].rightType).toBe('VARCHAR(255)');
      expect(result.current.conflicts[0].rightTypeDisplay).toBe('VARCHAR(255)');
    });

    it('should not detect conflict for compatible types', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'id',
          leftType: 'INTEGER',
          rightLabel: 'users',
          rightColumn: 'order_id',
          rightType: 'BIGINT',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      expect(result.current.hasConflicts).toBe(false);
      expect(result.current.conflicts).toHaveLength(0);
    });

    it('should skip same column JOIN (same table, same column)', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'users',
          leftColumn: 'id',
          leftType: 'INTEGER',
          rightLabel: 'users',
          rightColumn: 'id',
          rightType: 'VARCHAR', // Even with different types, should skip
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      expect(result.current.hasConflicts).toBe(false);
    });

    it('should skip empty column names', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: '',
          leftType: 'INTEGER',
          rightLabel: 'users',
          rightColumn: 'id',
          rightType: 'VARCHAR',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      expect(result.current.hasConflicts).toBe(false);
    });

    it('should detect multiple conflicts', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'id',
          leftType: 'VARCHAR',
          rightLabel: 'users',
          rightColumn: 'order_id',
          rightType: 'INTEGER',
        },
        {
          leftLabel: 'orders',
          leftColumn: 'date',
          leftType: 'DATE',
          rightLabel: 'logs',
          rightColumn: 'created_at',
          rightType: 'VARCHAR',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      expect(result.current.hasConflicts).toBe(true);
      expect(result.current.conflicts).toHaveLength(2);
      expect(result.current.unresolvedCount).toBe(2);
    });

    it('should generate content-based key', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'Orders',
          leftColumn: 'ID',
          leftType: 'VARCHAR',
          rightLabel: 'Users',
          rightColumn: 'Order_ID',
          rightType: 'INTEGER',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      // Key should be lowercase
      expect(result.current.conflicts[0].key).toBe('orders.id::users.order_id');
    });
  });

  /**
   * Property 6: Resolution state persists until condition changes
   * For any resolved conflict, the resolution SHALL persist across re-renders
   * until the JOIN condition columns are modified.
   */
  describe('Property 6: Resolution persistence', () => {
    it('should persist resolution across re-renders', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'id',
          leftType: 'VARCHAR',
          rightLabel: 'users',
          rightColumn: 'order_id',
          rightType: 'INTEGER',
        },
      ];

      const { result, rerender } = renderHook(() => useTypeConflict(columnPairs));

      // Resolve the conflict
      act(() => {
        result.current.resolveConflict('orders.id::users.order_id', 'BIGINT');
      });

      expect(result.current.conflicts[0].resolvedType).toBe('BIGINT');
      expect(result.current.allResolved).toBe(true);

      // Re-render with same props
      rerender();

      // Resolution should persist
      expect(result.current.conflicts[0].resolvedType).toBe('BIGINT');
      expect(result.current.allResolved).toBe(true);
    });

    it('should clear resolution when column pair is removed', () => {
      const initialPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'id',
          leftType: 'VARCHAR',
          rightLabel: 'users',
          rightColumn: 'order_id',
          rightType: 'INTEGER',
        },
        {
          leftLabel: 'orders',
          leftColumn: 'date',
          leftType: 'DATE',
          rightLabel: 'logs',
          rightColumn: 'created_at',
          rightType: 'VARCHAR',
        },
      ];

      const { result, rerender } = renderHook(
        ({ pairs }) => useTypeConflict(pairs),
        { initialProps: { pairs: initialPairs } }
      );

      // Resolve both conflicts
      act(() => {
        result.current.resolveConflict('orders.id::users.order_id', 'VARCHAR');
        result.current.resolveConflict('orders.date::logs.created_at', 'VARCHAR');
      });

      expect(result.current.allResolved).toBe(true);

      // Remove one pair
      const updatedPairs = [initialPairs[0]];
      rerender({ pairs: updatedPairs });

      // Only one conflict should remain, still resolved
      expect(result.current.conflicts).toHaveLength(1);
      expect(result.current.conflicts[0].resolvedType).toBe('VARCHAR');
    });

    it('should preserve resolution when column pair order changes', () => {
      const initialPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'id',
          leftType: 'VARCHAR',
          rightLabel: 'users',
          rightColumn: 'order_id',
          rightType: 'INTEGER',
        },
        {
          leftLabel: 'orders',
          leftColumn: 'date',
          leftType: 'DATE',
          rightLabel: 'logs',
          rightColumn: 'created_at',
          rightType: 'VARCHAR',
        },
      ];

      const { result, rerender } = renderHook(
        ({ pairs }) => useTypeConflict(pairs),
        { initialProps: { pairs: initialPairs } }
      );

      // Resolve first conflict
      act(() => {
        result.current.resolveConflict('orders.id::users.order_id', 'BIGINT');
      });

      // Reverse the order
      const reversedPairs = [...initialPairs].reverse();
      rerender({ pairs: reversedPairs });

      // Resolution should persist (content-based key)
      const conflict = result.current.conflicts.find(
        c => c.key === 'orders.id::users.order_id'
      );
      expect(conflict?.resolvedType).toBe('BIGINT');
    });
  });

  /**
   * Property 8: Apply all recommendations sets all conflicts to recommended types
   * For any set of conflicts, applying all recommendations SHALL set each
   * conflict's resolved type to its recommended type.
   */
  describe('Property 8: Apply all recommendations', () => {
    it('should set all conflicts to recommended types', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'id',
          leftType: 'VARCHAR',
          rightLabel: 'users',
          rightColumn: 'order_id',
          rightType: 'INTEGER',
        },
        {
          leftLabel: 'orders',
          leftColumn: 'date',
          leftType: 'DATE',
          rightLabel: 'logs',
          rightColumn: 'created_at',
          rightType: 'VARCHAR',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      expect(result.current.unresolvedCount).toBe(2);

      act(() => {
        result.current.resolveAllWithRecommendations();
      });

      // 有类型层推荐的(DATE×VARCHAR→VARCHAR)被解决;无推荐的(VARCHAR×INTEGER,string×numeric)
      // 被跳过,不会被套一个不安全的默认,仍未解决
      const withRec = result.current.conflicts.filter((c) => c.recommendedType);
      const withoutRec = result.current.conflicts.filter((c) => !c.recommendedType);
      expect(withRec.length).toBeGreaterThan(0);
      expect(withoutRec.length).toBeGreaterThan(0);
      for (const conflict of withRec) {
        expect(conflict.resolvedType).toBe(conflict.recommendedType);
      }
      for (const conflict of withoutRec) {
        expect(conflict.resolvedType).toBeUndefined();
      }
      expect(result.current.unresolvedCount).toBe(withoutRec.length);
    });

    it('should override existing resolutions for conflicts that have a recommendation', () => {
      // 用有推荐的冲突(DATE×VARCHAR→VARCHAR):apply-all 覆盖手动解析。string×numeric 无推荐,
      // 会被跳过(不覆盖用户手选),另有专门测试覆盖。
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'created',
          leftType: 'DATE',
          rightLabel: 'logs',
          rightColumn: 'ts',
          rightType: 'VARCHAR',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));
      const key = result.current.conflicts[0].key;

      act(() => {
        result.current.resolveConflict(key, 'BIGINT');
      });
      expect(result.current.conflicts[0].resolvedType).toBe('BIGINT');

      act(() => {
        result.current.resolveAllWithRecommendations();
      });

      // 被推荐类型(VARCHAR)覆盖
      expect(result.current.conflicts[0].resolvedType).toBe(
        result.current.conflicts[0].recommendedType
      );
      expect(result.current.conflicts[0].resolvedType).toBe('VARCHAR');
    });

    it('apply-all does not override a manual choice for a no-recommendation conflict', () => {
      // string×numeric 无类型层推荐;用户手选 BIGINT 后 apply-all 应保留,不清空/不套默认
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'id',
          leftType: 'VARCHAR',
          rightLabel: 'users',
          rightColumn: 'order_id',
          rightType: 'INTEGER',
        },
      ];
      const { result } = renderHook(() => useTypeConflict(columnPairs));
      const key = result.current.conflicts[0].key;
      act(() => result.current.resolveConflict(key, 'BIGINT'));
      act(() => result.current.resolveAllWithRecommendations());
      expect(result.current.conflicts[0].resolvedType).toBe('BIGINT');
    });
  });

  describe('resolvedTypes mapping', () => {
    it('should return mapping of resolved conflicts', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'id',
          leftType: 'VARCHAR',
          rightLabel: 'users',
          rightColumn: 'order_id',
          rightType: 'INTEGER',
        },
        {
          leftLabel: 'orders',
          leftColumn: 'date',
          leftType: 'DATE',
          rightLabel: 'logs',
          rightColumn: 'created_at',
          rightType: 'VARCHAR',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      // Resolve one conflict
      act(() => {
        result.current.resolveConflict('orders.id::users.order_id', 'VARCHAR');
      });

      expect(result.current.resolvedTypes).toEqual({
        'orders.id::users.order_id': 'VARCHAR',
      });

      // Resolve second conflict
      act(() => {
        result.current.resolveConflict('orders.date::logs.created_at', 'TIMESTAMP');
      });

      expect(result.current.resolvedTypes).toEqual({
        'orders.id::users.order_id': 'VARCHAR',
        'orders.date::logs.created_at': 'TIMESTAMP',
      });
    });
  });

  describe('clearResolutions', () => {
    it('should clear all resolutions', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'id',
          leftType: 'VARCHAR',
          rightLabel: 'users',
          rightColumn: 'order_id',
          rightType: 'INTEGER',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      act(() => {
        result.current.resolveConflict('orders.id::users.order_id', 'VARCHAR');
      });

      expect(result.current.allResolved).toBe(true);

      act(() => {
        result.current.clearResolutions();
      });

      expect(result.current.allResolved).toBe(false);
      expect(result.current.unresolvedCount).toBe(1);
      expect(result.current.conflicts[0].resolvedType).toBeUndefined();
    });
  });

  describe('getConflict', () => {
    it('should return conflict by key', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'id',
          leftType: 'VARCHAR',
          rightLabel: 'users',
          rightColumn: 'order_id',
          rightType: 'INTEGER',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      const conflict = result.current.getConflict('orders.id::users.order_id');
      expect(conflict).toBeDefined();
      expect(conflict?.leftColumn).toBe('id');
    });

    it('should return undefined for non-existent key', () => {
      const columnPairs: ColumnPair[] = [];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      const conflict = result.current.getConflict('non.existent::key.here');
      expect(conflict).toBeUndefined();
    });
  });

  describe('resolvedCasts (分侧转换)', () => {
    it('只转与目标类型不同的一侧,已是目标类型的一侧不转', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders', leftColumn: 'id', leftType: 'VARCHAR',
          rightLabel: 'users', rightColumn: 'order_id', rightType: 'BIGINT',
        },
      ];
      const { result } = renderHook(() => useTypeConflict(columnPairs));
      const key = result.current.conflicts[0].key;
      // 目标 BIGINT:VARCHAR 侧需转,BIGINT 侧已是目标→不转
      act(() => result.current.resolveConflict(key, 'BIGINT'));
      expect(result.current.resolvedCasts[key]).toEqual({ leftCast: 'BIGINT' });
    });

    it('两侧都与目标不同时都转(如公共 DECIMAL)', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 't1', leftColumn: 'a', leftType: 'BIGINT',
          rightLabel: 't2', rightColumn: 'b', rightType: 'DOUBLE',
        },
      ];
      const { result } = renderHook(() => useTypeConflict(columnPairs));
      const key = result.current.conflicts[0].key;
      act(() => result.current.resolveConflict(key, 'DECIMAL(38,2)'));
      expect(result.current.resolvedCasts[key]).toEqual({
        leftCast: 'DECIMAL(38,2)', rightCast: 'DECIMAL(38,2)',
      });
    });
  });

  describe('recommended types', () => {
    it('should return empty recommendedType for string + numeric (data-aware needed)', () => {
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'id',
          leftType: 'VARCHAR',
          rightLabel: 'users',
          rightColumn: 'order_id',
          rightType: 'INTEGER',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      // 无类型层默认(VARCHAR 丢匹配),交数据感知推断 / 手填
      expect(result.current.conflicts[0].recommendedType).toBe('');
    });

    it('should recommend lossless VARCHAR for datetime + numeric', () => {
      // 回归:曾推荐 TIMESTAMP——把 BIGINT 毫秒数硬转 TIMESTAMP 是纪元
      // 误读陷阱,统一推荐无损 VARCHAR,由用户显式决定语义转换
      const columnPairs: ColumnPair[] = [
        {
          leftLabel: 'orders',
          leftColumn: 'date',
          leftType: 'DATE',
          rightLabel: 'logs',
          rightColumn: 'timestamp_ms',
          rightType: 'BIGINT',
        },
      ];

      const { result } = renderHook(() => useTypeConflict(columnPairs));

      expect(result.current.conflicts[0].recommendedType).toBe('VARCHAR');
    });
  });
});
