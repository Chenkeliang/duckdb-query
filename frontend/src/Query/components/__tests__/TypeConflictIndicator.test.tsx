/**
 * TypeConflictIndicator 组件测试
 * 
 * Property 9: Conflict badge state reflects resolution status
 * For any conflict, the badge SHALL show warning state when unresolved
 * and success state when resolved.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypeConflictIndicator } from '../TypeConflictIndicator';
import type { TypeConflict } from '@/hooks/useTypeConflict';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue: string, params?: Record<string, string>) => {
      if (params) {
        let result = defaultValue;
        Object.entries(params).forEach(([k, v]) => {
          result = result.replace(`{{${k}}}`, v);
        });
        return result;
      }
      return defaultValue;
    },
  }),
}));

describe('TypeConflictIndicator', () => {
  const unresolvedConflict: TypeConflict = {
    key: 'orders.id::users.order_id',
    leftLabel: 'orders',
    leftColumn: 'id',
    leftType: 'VARCHAR',
    leftTypeDisplay: 'VARCHAR',
    rightLabel: 'users',
    rightColumn: 'order_id',
    rightType: 'INTEGER',
    rightTypeDisplay: 'INTEGER',
    recommendedType: 'VARCHAR',
    resolvedType: undefined,
  };

  const resolvedConflict: TypeConflict = {
    ...unresolvedConflict,
    resolvedType: 'BIGINT',
  };

  /**
   * Property 9: Conflict badge state reflects resolution status
   */
  describe('Property 9: Badge state', () => {
    it('should not render when conflict is null', () => {
      const { container } = render(<TypeConflictIndicator conflict={null} />);
      expect(container.firstChild).toBeNull();
    });

    it('should not render when conflict is undefined', () => {
      const { container } = render(<TypeConflictIndicator conflict={undefined} />);
      expect(container.firstChild).toBeNull();
    });

    it('should show warning state for unresolved conflict', () => {
      render(<TypeConflictIndicator conflict={unresolvedConflict} />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('text-warning');
      
      // Should have AlertTriangle icon (warning)
      const svg = button.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should show success state for resolved conflict', () => {
      render(<TypeConflictIndicator conflict={resolvedConflict} />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('text-success');
      
      // Should have CheckCircle2 icon (success)
      const svg = button.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should have correct aria-label for unresolved conflict', () => {
      render(<TypeConflictIndicator conflict={unresolvedConflict} />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute(
        'aria-label',
        '类型冲突: VARCHAR ≠ INTEGER'
      );
    });

    it('should have correct aria-label for resolved conflict', () => {
      render(<TypeConflictIndicator conflict={resolvedConflict} />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', '已转换为 BIGINT');
    });
  });

  describe('click handling', () => {
    it('should call onClick when clicked', () => {
      const handleClick = vi.fn();
      render(
        <TypeConflictIndicator
          conflict={unresolvedConflict}
          onClick={handleClick}
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not throw when onClick is not provided', () => {
      render(<TypeConflictIndicator conflict={unresolvedConflict} />);
      
      const button = screen.getByRole('button');
      expect(() => fireEvent.click(button)).not.toThrow();
    });
  });

  describe('size variants', () => {
    it('should apply small size by default', () => {
      render(<TypeConflictIndicator conflict={unresolvedConflict} />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('p-0.5');
    });

    it('should apply medium size when specified', () => {
      render(
        <TypeConflictIndicator conflict={unresolvedConflict} size="md" />
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('p-1');
    });
  });

  describe('custom className', () => {
    it('should apply custom className', () => {
      render(
        <TypeConflictIndicator
          conflict={unresolvedConflict}
          className="custom-class"
        />
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });
  });
});
