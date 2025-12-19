/**
 * TypeConflictDialog 组件测试
 * 
 * Property 10: Dialog header shows correct conflict count
 * For any set of conflicts, the dialog header SHALL display the count
 * of unresolved conflicts, or a success message when all are resolved.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypeConflictDialog } from '../TypeConflictDialog';
import type { TypeConflict } from '@/new/hooks/useTypeConflict';

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

describe('TypeConflictDialog', () => {
  const createConflict = (
    key: string,
    leftType: string,
    rightType: string,
    resolvedType?: string
  ): TypeConflict => ({
    key,
    leftLabel: 'orders',
    leftColumn: 'id',
    leftType,
    leftTypeDisplay: leftType,
    rightLabel: 'users',
    rightColumn: 'order_id',
    rightType,
    rightTypeDisplay: rightType,
    recommendedType: 'VARCHAR',
    resolvedType,
  });

  const defaultProps = {
    open: true,
    conflicts: [
      createConflict('orders.id::users.order_id', 'VARCHAR', 'INTEGER'),
    ],
    onResolve: vi.fn(),
    onResolveAll: vi.fn(),
    onClose: vi.fn(),
    onConfirm: vi.fn(),
  };

  /**
   * Property 10: Dialog header shows correct conflict count
   */
  describe('Property 10: Dialog header', () => {
    it('should show unresolved count in header', () => {
      render(<TypeConflictDialog {...defaultProps} />);
      
      // Should show "检测到 1 个类型冲突"
      expect(screen.getByText(/检测到 1 个类型冲突/)).toBeInTheDocument();
    });

    it('should show correct count for multiple unresolved conflicts', () => {
      const conflicts = [
        createConflict('orders.id::users.order_id', 'VARCHAR', 'INTEGER'),
        createConflict('orders.date::logs.created_at', 'DATE', 'VARCHAR'),
      ];

      render(<TypeConflictDialog {...defaultProps} conflicts={conflicts} />);
      
      expect(screen.getByText(/检测到 2 个类型冲突/)).toBeInTheDocument();
    });

    it('should show success message when all resolved', () => {
      const conflicts = [
        createConflict('orders.id::users.order_id', 'VARCHAR', 'INTEGER', 'VARCHAR'),
      ];

      render(<TypeConflictDialog {...defaultProps} conflicts={conflicts} />);
      
      expect(screen.getByText(/所有类型冲突已解决/)).toBeInTheDocument();
    });

    it('should show correct count with mixed resolved/unresolved', () => {
      const conflicts = [
        createConflict('orders.id::users.order_id', 'VARCHAR', 'INTEGER', 'VARCHAR'),
        createConflict('orders.date::logs.created_at', 'DATE', 'VARCHAR'),
      ];

      render(<TypeConflictDialog {...defaultProps} conflicts={conflicts} />);
      
      // Only 1 unresolved
      expect(screen.getByText(/检测到 1 个类型冲突/)).toBeInTheDocument();
    });
  });

  describe('conflict table', () => {
    it('should display conflict details', () => {
      render(<TypeConflictDialog {...defaultProps} />);
      
      // Should show table headers
      expect(screen.getByText('JOIN 条件')).toBeInTheDocument();
      expect(screen.getByText('左侧类型')).toBeInTheDocument();
      expect(screen.getByText('右侧类型')).toBeInTheDocument();
      expect(screen.getByText('转换为')).toBeInTheDocument();
      
      // Should show conflict data
      expect(screen.getByText('orders.id')).toBeInTheDocument();
      expect(screen.getByText('users.order_id')).toBeInTheDocument();
      expect(screen.getByText('VARCHAR')).toBeInTheDocument();
      expect(screen.getByText('INTEGER')).toBeInTheDocument();
    });

    it('should show recommended badge for recommended type', () => {
      render(<TypeConflictDialog {...defaultProps} />);
      
      // Open the select dropdown
      const selectTrigger = screen.getByRole('combobox');
      fireEvent.click(selectTrigger);
      
      // Should show "推荐" badge
      expect(screen.getByText('推荐')).toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('should call onResolve when type is selected', () => {
      const onResolve = vi.fn();
      render(<TypeConflictDialog {...defaultProps} onResolve={onResolve} />);
      
      // Open the select dropdown
      const selectTrigger = screen.getByRole('combobox');
      fireEvent.click(selectTrigger);
      
      // Select a type
      const option = screen.getByText('BIGINT');
      fireEvent.click(option);
      
      expect(onResolve).toHaveBeenCalledWith('orders.id::users.order_id', 'BIGINT');
    });

    it('should call onResolveAll when apply all button is clicked', () => {
      const onResolveAll = vi.fn();
      render(<TypeConflictDialog {...defaultProps} onResolveAll={onResolveAll} />);
      
      const applyAllButton = screen.getByText('应用所有推荐');
      fireEvent.click(applyAllButton);
      
      expect(onResolveAll).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when cancel button is clicked', () => {
      const onClose = vi.fn();
      render(<TypeConflictDialog {...defaultProps} onClose={onClose} />);
      
      const cancelButton = screen.getByText('取消');
      fireEvent.click(cancelButton);
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should disable confirm button when not all resolved', () => {
      render(<TypeConflictDialog {...defaultProps} />);
      
      const confirmButton = screen.getByText('应用转换并继续');
      expect(confirmButton).toBeDisabled();
    });

    it('should enable confirm button when all resolved', () => {
      const conflicts = [
        createConflict('orders.id::users.order_id', 'VARCHAR', 'INTEGER', 'VARCHAR'),
      ];

      render(<TypeConflictDialog {...defaultProps} conflicts={conflicts} />);
      
      const confirmButton = screen.getByText('应用转换并继续');
      expect(confirmButton).not.toBeDisabled();
    });

    it('should call onConfirm when confirm button is clicked', () => {
      const onConfirm = vi.fn();
      const conflicts = [
        createConflict('orders.id::users.order_id', 'VARCHAR', 'INTEGER', 'VARCHAR'),
      ];

      render(
        <TypeConflictDialog
          {...defaultProps}
          conflicts={conflicts}
          onConfirm={onConfirm}
        />
      );
      
      const confirmButton = screen.getByText('应用转换并继续');
      fireEvent.click(confirmButton);
      
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('TRY_CAST warning', () => {
    it('should display TRY_CAST NULL warning', () => {
      render(<TypeConflictDialog {...defaultProps} />);
      
      expect(
        screen.getByText(/TRY_CAST 转换失败的行将返回 NULL/)
      ).toBeInTheDocument();
    });
  });

  describe('SQL preview', () => {
    it('should display SQL preview when provided', () => {
      const sqlPreview = 'SELECT * FROM orders JOIN users ON TRY_CAST(orders.id AS VARCHAR) = TRY_CAST(users.order_id AS VARCHAR)';
      
      render(<TypeConflictDialog {...defaultProps} sqlPreview={sqlPreview} />);
      
      expect(screen.getByText('SQL 预览')).toBeInTheDocument();
      expect(screen.getByText(sqlPreview)).toBeInTheDocument();
    });

    it('should not display SQL preview when not provided', () => {
      render(<TypeConflictDialog {...defaultProps} />);
      
      expect(screen.queryByText('SQL 预览')).not.toBeInTheDocument();
    });
  });

  describe('custom props', () => {
    it('should use custom title', () => {
      render(
        <TypeConflictDialog {...defaultProps} title="Custom Title" />
      );
      
      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('should use custom confirm text', () => {
      const conflicts = [
        createConflict('orders.id::users.order_id', 'VARCHAR', 'INTEGER', 'VARCHAR'),
      ];

      render(
        <TypeConflictDialog
          {...defaultProps}
          conflicts={conflicts}
          confirmText="Custom Confirm"
        />
      );
      
      expect(screen.getByText('Custom Confirm')).toBeInTheDocument();
    });
  });

  describe('dialog state', () => {
    it('should not render when open is false', () => {
      render(<TypeConflictDialog {...defaultProps} open={false} />);
      
      expect(screen.queryByText('JOIN 条件')).not.toBeInTheDocument();
    });
  });
});
