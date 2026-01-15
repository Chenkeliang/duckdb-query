/**
 * TreeNode 组件单元测试
 * Task 2.2: 编写 TreeNode 组件单元测试
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TreeNode } from '../TreeNode';
import { Database } from 'lucide-react';

describe('TreeNode', () => {
  describe('基础渲染', () => {
    it('应该正确渲染标签', () => {
      render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
        />
      );

      expect(screen.getByText('测试节点')).toBeInTheDocument();
    });

    it('应该正确渲染图标', () => {
      render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
          icon={<Database data-testid="icon" />}
        />
      );

      expect(screen.getByTestId('icon')).toBeInTheDocument();
    });

    it('应该正确渲染徽章', () => {
      render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
          badge={42}
        />
      );

      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('应该正确渲染字符串徽章', () => {
      render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
          badge="NEW"
        />
      );

      expect(screen.getByText('NEW')).toBeInTheDocument();
    });
  });

  describe('展开/折叠功能', () => {
    it('可展开节点应该显示展开箭头', () => {
      render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={true}
          isExpanded={false}
        />
      );

      // 应该有一个按钮用于展开
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('不可展开节点不应该显示展开箭头', () => {
      render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
        />
      );

      // 不应该有按钮
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('点击展开箭头应该触发 onToggle', () => {
      const onToggle = vi.fn();
      render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={true}
          isExpanded={false}
          onToggle={onToggle}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('展开状态应该显示子节点', () => {
      render(
        <TreeNode
          id="test-node"
          label="父节点"
          level={0}
          isExpandable={true}
          isExpanded={true}
        >
          <div data-testid="child">子节点内容</div>
        </TreeNode>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('折叠状态不应该显示子节点', () => {
      render(
        <TreeNode
          id="test-node"
          label="父节点"
          level={0}
          isExpandable={true}
          isExpanded={false}
        >
          <div data-testid="child">子节点内容</div>
        </TreeNode>
      );

      expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    });
  });

  describe('缩进层级', () => {
    it('level 0 应该有最小缩进', () => {
      const { container } = render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
        />
      );

      const nodeDiv = container.querySelector('.tree-node > div');
      expect(nodeDiv).toHaveClass('pl-0.5');
    });

    it('level 1 应该有适当缩进', () => {
      const { container } = render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={1}
          isExpandable={false}
        />
      );

      const nodeDiv = container.querySelector('.tree-node > div');
      expect(nodeDiv).toHaveClass('pl-6');
    });

    it('level 2 应该有更大缩进', () => {
      const { container } = render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={2}
          isExpandable={false}
        />
      );

      const nodeDiv = container.querySelector('.tree-node > div');
      expect(nodeDiv).toHaveClass('pl-10');
    });

    it('level 3 应该有最大缩进', () => {
      const { container } = render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={3}
          isExpandable={false}
        />
      );

      const nodeDiv = container.querySelector('.tree-node > div');
      expect(nodeDiv).toHaveClass('pl-14');
    });
  });

  describe('状态指示器', () => {
    it('success 状态应该显示绿色指示器', () => {
      const { container } = render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
          statusIndicator="success"
        />
      );

      const indicator = container.querySelector('.bg-success');
      expect(indicator).toBeInTheDocument();
    });

    it('error 状态应该显示红色指示器', () => {
      const { container } = render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
          statusIndicator="error"
        />
      );

      const indicator = container.querySelector('.bg-error');
      expect(indicator).toBeInTheDocument();
    });

    it('inactive 状态应该显示灰色指示器', () => {
      const { container } = render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
          statusIndicator="inactive"
        />
      );

      const indicator = container.querySelector('.bg-muted');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('事件处理', () => {
    it('点击节点应该触发 onClick', () => {
      const onClick = vi.fn();
      render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
          onClick={onClick}
        />
      );

      fireEvent.click(screen.getByText('测试节点'));

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('右键点击应该触发 onContextMenu', () => {
      const onContextMenu = vi.fn();
      render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
          onContextMenu={onContextMenu}
        />
      );

      fireEvent.contextMenu(screen.getByText('测试节点'));

      expect(onContextMenu).toHaveBeenCalledTimes(1);
    });
  });

  describe('选中状态', () => {
    it('选中状态应该有高亮样式', () => {
      const { container } = render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
          isSelected={true}
        />
      );

      const nodeDiv = container.querySelector('.tree-node > div');
      expect(nodeDiv).toHaveClass('bg-primary/10');
      expect(nodeDiv).toHaveClass('text-primary');
    });

    it('未选中状态应该有悬停样式', () => {
      const { container } = render(
        <TreeNode
          id="test-node"
          label="测试节点"
          level={0}
          isExpandable={false}
          isSelected={false}
        />
      );

      const nodeDiv = container.querySelector('.tree-node > div');
      expect(nodeDiv).toHaveClass('hover:bg-surface-hover');
    });
  });
});
