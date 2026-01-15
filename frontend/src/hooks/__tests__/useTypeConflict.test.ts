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

      expect(result.current.unresolvedCount).toBe(0);
      expect(result.current.allResolved).toBe(true);

      // Each conflict should have its recommended type
      for (const conflict of result.current.conflicts) {
        expect(conflict.resolvedType).toBe(conflict.recommendedType);
      }
    });

    it('should override existing resolutions', () => {
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

      // Manually resolve with a different type
      act(() => {
        result.current.resolveConflict('orders.id::users.order_id', 'BIGINT');
      });

      expect(result.current.conflicts[0].resolvedType).toBe('BIGINT');

      // Apply all recommendations
      act(() => {
        result.current.resolveAllWithRecommendations();
      });

      // Should be overridden with recommended type
      expect(result.current.conflicts[0].resolvedType).toBe(
        result.current.conflicts[0].recommendedType
      );
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

  describe('recommended types', () => {
    it('should recommend VARCHAR for string + numeric', () => {
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

      expect(result.current.conflicts[0].recommendedType).toBe('VARCHAR');
    });

    it('should recommend TIMESTAMP for datetime + numeric', () => {
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

      expect(result.current.conflicts[0].recommendedType).toBe('TIMESTAMP');
    });
  });
});
