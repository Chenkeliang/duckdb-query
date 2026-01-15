import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface TreeNodeProps {
  id: string;
  label: string;
  icon?: React.ReactNode;
  level: number; // 缩进层级 (0, 1, 2, 3)
  isExpandable: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
  badge?: string | number; // 显示数量徽章
  statusIndicator?: 'success' | 'warning' | 'error' | 'inactive';
  onToggle?: () => void;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

/**
 * Task 9.3: 优化缩进和间距
 * Level 0: 2px (pl-0.5)
 * Level 1: 24px (pl-6)
 * Level 2: 40px (pl-10)
 * Level 3: 56px (pl-14)
 */
export const getIndentClass = (level: number): string => {
  const indentMap: Record<number, string> = {
    0: 'pl-0.5',  // 2px
    1: 'pl-6',     // 24px (6 * 4)
    2: 'pl-10',    // 40px (10 * 4)
    3: 'pl-14',    // 56px (14 * 4)
  };
  return indentMap[level] || 'pl-0.5';
};

const getStatusIndicatorClass = (status?: string): string => {
  const statusMap: Record<string, string> = {
    success: 'bg-success',
    warning: 'bg-warning',
    error: 'bg-error',
    inactive: 'bg-muted',
  };
  return status ? statusMap[status] || 'bg-muted' : '';
};

export const TreeNode: React.FC<TreeNodeProps> = ({
  id, // 保留 id prop，虽然未使用但为了接口完整性
  label,
  icon,
  level,
  isExpandable,
  isExpanded = false,
  isSelected = false,
  badge,
  statusIndicator,
  onToggle,
  onClick,
  onContextMenu,
  children,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick();
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggle) {
      onToggle();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    // 仅在传入 onContextMenu 时阻断事件，否则让事件冒泡给 ContextMenuTrigger
    if (onContextMenu) {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e);
    }
  };

  return (
    <div className="tree-node">
      <div
        className={`
          flex items-center h-8 cursor-pointer
          ${getIndentClass(level)}
          ${isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-surface-hover'}
          transition-colors duration-fast
          rounded-lg
        `}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* 展开/折叠箭头 */}
        {isExpandable ? (
          <button
            onClick={handleToggle}
            className="flex items-center justify-center w-4 h-4 mr-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        ) : (
          <div className="w-4 mr-1" />
        )}

        {/* 状态指示器 */}
        {statusIndicator && (
          <div
            className={`w-2 h-2 rounded-full mr-2 ${getStatusIndicatorClass(
              statusIndicator
            )}`}
          />
        )}

        {/* 图标 */}
        {icon && <div className="mr-2 text-muted-foreground">{icon}</div>}

        {/* 标签 */}
        <span className="flex-1 text-sm truncate">{label}</span>

        {/* 徽章 */}
        {badge !== undefined && (
          <span className="ml-2 px-2 py-0.5 text-xs rounded-md bg-muted text-muted-foreground">
            {badge}
          </span>
        )}
      </div>

      {/* 子节点 */}
      {isExpandable && isExpanded && children && (
        <div className="tree-node-children">{children}</div>
      )}
    </div>
  );
};
