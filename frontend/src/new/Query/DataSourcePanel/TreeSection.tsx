import * as React from 'react';
import { TreeNode } from './TreeNode';

/**
 * TreeSection 组件
 * 
 * 可展开/折叠的分组 section，用于数据源面板的表分组
 * 使用 TreeNode 组件实现统一的树形结构
 * 
 * Features:
 * - 展开/折叠动画
 * - 状态持久化到 localStorage
 * - 显示项目数量
 * - 完整的可访问性支持
 */

interface TreeSectionProps {
  id: string;
  title: string;
  count: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export const TreeSection: React.FC<TreeSectionProps> = ({
  id,
  title,
  count,
  defaultExpanded = true,
  children,
}) => {
  // 从 localStorage 恢复展开状态
  const [isExpanded, setIsExpanded] = React.useState(() => {
    const saved = localStorage.getItem(`treeSection-${id}`);
    return saved !== null ? saved === 'true' : defaultExpanded;
  });

  // 保存展开状态到 localStorage
  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    localStorage.setItem(`treeSection-${id}`, String(newState));
  };

  return (
    <TreeNode
      id={id}
      label={title}
      level={0}
      isExpandable={true}
      isExpanded={isExpanded}
      badge={count}
      onToggle={handleToggle}
    >
      {children}
    </TreeNode>
  );
};
