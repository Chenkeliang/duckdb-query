import * as React from 'react';
import { forwardRef } from 'react';
import { Database, Table2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { TableContextMenu } from './ContextMenu';
import type { SelectedTableObject } from '@/types/SelectedTable';
import { getIndentClass } from './TreeNode';

/**
 * TableItem 组件
 * 
 * 数据表项，支持单选和多选模式
 * 
 * Features:
 * - 单选模式：单击选中
 * - 多选模式：checkbox 选择
 * - 选中状态样式（bg-primary/10 + border-l-2）
 * - 显示行数信息
 * - 右键菜单支持
 * - 支持 DuckDB 表和外部数据库表
 * - 外部表显示数据库类型图标
 */

/**
 * 数据库类型配置
 */
const DATABASE_TYPE_LABEL: Record<string, string> = {
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  sqlite: 'SQLite',
  sqlserver: 'SQL Server',
};

/**
 * 获取表图标和标签
 */
const getTableIconAndBadge = (table: SelectedTableObject): { icon: React.ReactNode; badge?: React.ReactNode } => {
  if (table.source === 'external' && table.connection?.type) {
    const label = DATABASE_TYPE_LABEL[table.connection.type] || table.connection.type.toUpperCase();
    return {
      icon: <Database className="h-4 w-4 text-muted-foreground flex-shrink-0" />,
      badge: (
        <Badge variant="outline" className="ml-1 h-4 px-1 py-0 text-xs font-medium">
          {label}
        </Badge>
      ),
    };
  }
  return {
    icon: <Table2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />,
    badge: undefined,
  };
};

interface TableItemProps {
  table: SelectedTableObject;
  rowCount?: number;
  isSelected: boolean;
  selectionMode?: 'single' | 'multiple';
  onSelect: (table: SelectedTableObject) => void;
  onPreview?: (table: SelectedTableObject) => void;
  onDelete?: (tableName: string) => void;
  onImport?: (table: SelectedTableObject) => void;
  searchQuery?: string;
  disabled?: boolean;
  level?: number;
}

interface TableItemButtonProps {
  isSelected: boolean;
  disabled: boolean;
  onClick: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  children: React.ReactNode;
  className?: string; // Add className prop
}

/**
 * 内部按钮组件 - 使用 forwardRef 以支持 Radix UI 的 asChild
 */
const TableItemButton = forwardRef<
  HTMLDivElement,
  TableItemButtonProps
>(({ isSelected, disabled, onClick, onKeyDown, children, className, ...props }, ref) => (
  <div
    ref={ref}
    role="button"
    tabIndex={disabled ? -1 : 0}
    onClick={onClick}
    onKeyDown={onKeyDown}
    className={[
      'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
      'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      isSelected ? 'border-l-2 border-primary bg-primary/10' : 'border-l-2 border-transparent',
      disabled ? 'cursor-not-allowed opacity-50 hover:bg-transparent' : 'cursor-pointer',
      className, // Apply additional className
    ].filter(Boolean).join(' ')}
    {...props}
  >
    {children}
  </div>
));
TableItemButton.displayName = 'TableItemButton';

export const TableItem = forwardRef<HTMLDivElement, TableItemProps>(({
  table,
  rowCount,
  isSelected,
  selectionMode = 'single',
  onSelect,
  onPreview,
  onDelete,
  onImport,
  searchQuery = '',
  disabled = false,
  level = 0,
}, ref) => {
  const iconAndBadge = React.useMemo(() => getTableIconAndBadge(table), [table]);

  // 高亮搜索匹配的文本
  const highlightText = (text: string, query: string) => {
    if (!query) return text;

    // 转义正则特殊字符，避免输入 (、[、* 等字符时报错
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    try {
      const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
      return (
        <>
          {parts.map((part, i) =>
            part.toLowerCase() === query.toLowerCase() ? (
              <mark key={i} className="rounded bg-yellow-400/40 text-foreground font-medium px-0.5">
                {part}
              </mark>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </>
      );
    } catch (error) {
      // 如果正则构造仍然失败，返回原文本
      return text;
    }
  };
  const handleClick = React.useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    // 如果是多选模式且点击的是 checkbox，不处理（让 checkbox 自己处理）
    if (selectionMode === 'multiple' && (e.target as HTMLElement).closest('[role="checkbox"]')) {
      return;
    }
    onSelect(table);
  }, [disabled, selectionMode, onSelect, table]);

  const handlePreview = React.useCallback(() => {
    if (onPreview) {
      onPreview(table);
    }
  }, [onPreview, table]);

  // 外部表不能删除（只能删除 DuckDB 表）
  const canDelete = table.source === 'duckdb';

  // 处理键盘事件（支持 Enter 和 Space 键选择）
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(table);
    }
  }, [disabled, onSelect, table]);

  // Checkbox 回调 - 使用 useCallback 避免每次渲染创建新函数
  const handleCheckboxChange = React.useCallback(() => {
    onSelect(table);
  }, [onSelect, table]);

  const handleCheckboxClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <TableContextMenu
      table={table}
      canDelete={canDelete}
      onPreview={handlePreview}
      onDelete={onDelete}
      onImport={onImport}
    >
      {/* 使用 forwardRef 的内部组件，支持 Radix UI 的 asChild ref 传递 */}
      <TableItemButton
        isSelected={isSelected}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={getIndentClass(level)} // 应用缩进样式
      >
        <div className="flex items-center gap-2">
          {/* 多选模式：显示 checkbox */}
          {selectionMode === 'multiple' && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={handleCheckboxChange}
              onClick={handleCheckboxClick}
              disabled={disabled}
            />
          )}

          {/* 表图标 - 根据数据源类型显示不同图标 */}
          {iconAndBadge.icon}

          {/* 表信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center font-medium text-foreground">
              <span className="truncate">{highlightText(table.name, searchQuery)}</span>
              {iconAndBadge.badge}
            </div>
            {/* 外部表不显示行数（无法准确获取） */}
            {rowCount !== undefined && table.source !== 'external' && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {rowCount.toLocaleString()} 行
              </div>
            )}
          </div>
        </div>
      </TableItemButton>
    </TableContextMenu>
  );
});
TableItem.displayName = 'TableItem';
