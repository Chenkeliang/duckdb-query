import * as React from 'react';
import { Database } from 'lucide-react';
import { Checkbox } from '@/new/components/ui/checkbox';
import { TableContextMenu } from './ContextMenu';

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
 */

export interface TableSource {
  type: 'duckdb' | 'external';
  connectionId?: string;
  schema?: string;
}

interface TableItemProps {
  name: string;
  rowCount?: number;
  isSelected: boolean;
  selectionMode?: 'single' | 'multiple';
  source?: TableSource;
  onSelect: (name: string, source?: TableSource) => void;
  onPreview?: (name: string, source?: TableSource) => void;
  onDelete?: (name: string) => void;
  searchQuery?: string;
}

export const TableItem: React.FC<TableItemProps> = ({
  name,
  rowCount,
  isSelected,
  selectionMode = 'single',
  source = { type: 'duckdb' },
  onSelect,
  onPreview,
  onDelete,
  searchQuery = '',
}) => {
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
              <mark key={i} className="bg-warning/30 text-foreground rounded px-0.5">
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
  const handleClick = (e: React.MouseEvent) => {
    // 如果是多选模式且点击的是 checkbox，不处理（让 checkbox 自己处理）
    if (selectionMode === 'multiple' && (e.target as HTMLElement).closest('[role="checkbox"]')) {
      return;
    }
    onSelect(name, source);
  };

  const handlePreview = () => {
    if (onPreview) {
      onPreview(name, source);
    }
  };

  // 外部表不能删除（只能删除 DuckDB 表）
  const canDelete = source.type === 'duckdb';

  return (
    <TableContextMenu
      tableName={name}
      canDelete={canDelete}
      onPreview={handlePreview}
      onDelete={onDelete}
    >
      <button
        onClick={handleClick}
        className={`
          w-full px-3 py-2 rounded-lg text-left text-sm
          transition-colors duration-fast
          hover:bg-surface-hover
          ${
            isSelected
              ? 'bg-primary/10 border-l-2 border-primary'
              : 'border-l-2 border-transparent'
          }
        `}
      >
        <div className="flex items-center gap-2">
          {/* 多选模式：显示 checkbox */}
          {selectionMode === 'multiple' && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onSelect(name, source)}
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {/* 表图标 */}
          <Database className="h-4 w-4 text-muted-foreground flex-shrink-0" />

          {/* 表信息 */}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-foreground truncate">
              {highlightText(name, searchQuery)}
            </div>
            {rowCount !== undefined && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {rowCount.toLocaleString()} 行
              </div>
            )}
          </div>
        </div>
      </button>
    </TableContextMenu>
  );
};
