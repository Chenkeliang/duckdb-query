/**
 * 分组芯片组件
 * GroupChip Component
 * 
 * 显示筛选分组（递归渲染子节点）
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Grip } from 'lucide-react';
import { Button } from '@/new/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/new/components/ui/tooltip';
import { FilterChip } from './FilterChip';
import { LogicConnector } from './LogicConnector';
import type { FilterGroup, FilterNode, FilterCondition, ColumnInfo } from './types';

export interface GroupChipProps {
    /** 分组节点 */
    node: FilterGroup;
    /** 更新回调 */
    onUpdate: (node: FilterGroup) => void;
    /** 删除回调 */
    onDelete?: () => void;
    /** 编辑条件回调 */
    onEditCondition?: (condition: FilterCondition) => void;
    /** 删除条件回调 */
    onDeleteCondition?: (conditionId: string) => void;
    /** 切换分组逻辑回调 */
    onToggleLogic?: (groupId: string) => void;
    /** 可用列信息（用于编辑） */
    availableColumns?: ColumnInfo[];
    /** 是否禁用 */
    disabled?: boolean;
    /** 嵌套深度（用于样式） */
    depth?: number;
    /** 是否显示拖拽手柄 */
    showDragHandle?: boolean;
    /** 自定义类名 */
    className?: string;
}

/**
 * 节点渲染器
 */
const NodeRenderer: React.FC<{
    node: FilterNode;
    onUpdate: (node: FilterNode) => void;
    onDelete: () => void;
    onEditCondition?: (condition: FilterCondition) => void;
    onToggleLogic?: (groupId: string) => void;
    availableColumns?: ColumnInfo[];
    disabled?: boolean;
    depth: number;
}> = ({
    node,
    onUpdate,
    onDelete,
    onEditCondition,
    onToggleLogic,
    availableColumns,
    disabled,
    depth,
}) => {
        switch (node.type) {
            case 'condition':
                return (
                    <FilterChip
                        node={node}
                        onEdit={() => onEditCondition?.(node)}
                        onDelete={onDelete}
                        disabled={disabled}
                    />
                );
            case 'group':
                return (
                    <GroupChip
                        node={node}
                        onUpdate={(updated) => onUpdate(updated)}
                        onDelete={onDelete}
                        onEditCondition={onEditCondition}
                        onDeleteCondition={(id) => {
                            // 递归删除
                            const newChildren = node.children.filter(c => c.id !== id);
                            onUpdate({ ...node, children: newChildren });
                        }}
                        onToggleLogic={onToggleLogic}
                        availableColumns={availableColumns}
                        disabled={disabled}
                        depth={depth + 1}
                    />
                );
            case 'raw':
                return (
                    <RawSqlChip sql={node.sql} onDelete={onDelete} disabled={disabled} />
                );
            default:
                return null;
        }
    };

/**
 * Raw SQL 芯片
 */
const RawSqlChip: React.FC<{
    sql: string;
    onDelete?: () => void;
    disabled?: boolean;
}> = ({ sql, onDelete, disabled }) => {
    const { t } = useTranslation('common');

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className={`
            inline-flex items-center gap-1
            px-2 py-1
            text-xs
            bg-amber-100 dark:bg-amber-900/30
            text-amber-800 dark:text-amber-200
            border border-amber-300 dark:border-amber-700
            rounded-md
            ${disabled ? 'opacity-50' : ''}
          `}>
                        <span className="font-mono max-w-[200px] truncate">
                            {sql.length > 30 ? sql.slice(0, 27) + '...' : sql}
                        </span>
                        {!disabled && onDelete && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 hover:bg-amber-200 dark:hover:bg-amber-800"
                                onClick={onDelete}
                                aria-label={t('query.filter.deleteCondition', '删除')}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[400px]">
                    <p className="text-xs text-muted-foreground mb-1">
                        {t('query.filter.rawSqlBlock', '原始 SQL 块（无法解析）')}
                    </p>
                    <pre className="font-mono text-xs whitespace-pre-wrap">{sql}</pre>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

export const GroupChip: React.FC<GroupChipProps> = ({
    node,
    onUpdate,
    onDelete,
    onEditCondition,
    onDeleteCondition,
    onToggleLogic,
    availableColumns,
    disabled = false,
    depth = 0,
    showDragHandle = false,
    className,
}) => {
    const { t } = useTranslation('common');

    // 切换分组逻辑
    const handleToggleLogic = () => {
        if (disabled) return;
        if (onToggleLogic) {
            onToggleLogic(node.id);
        } else {
            onUpdate({
                ...node,
                logic: node.logic === 'AND' ? 'OR' : 'AND',
            });
        }
    };

    // 更新子节点
    const handleUpdateChild = (index: number, updatedChild: FilterNode) => {
        const newChildren = [...node.children];
        newChildren[index] = updatedChild;
        onUpdate({ ...node, children: newChildren });
    };

    // 删除子节点
    const handleDeleteChild = (index: number) => {
        if (disabled) return;
        const child = node.children[index];
        if (onDeleteCondition) {
            onDeleteCondition(child.id);
        } else {
            const newChildren = node.children.filter((_, i) => i !== index);
            onUpdate({ ...node, children: newChildren });
        }
    };

    // 空分组
    if (node.children.length === 0) {
        return null;
    }

    // 深度颜色映射
    const depthColors = [
        'border-primary/50',
        'border-blue-400/50',
        'border-green-400/50',
        'border-purple-400/50',
        'border-orange-400/50',
    ];
    const borderColor = depthColors[depth % depthColors.length];

    return (
        <div
            className={`
        inline-flex items-center gap-1
        border-l-2 ${borderColor}
        pl-2 pr-1 py-0.5
        bg-muted/20 dark:bg-muted/10
        rounded-r
        ${disabled ? 'opacity-50' : ''}
        ${className || ''}
      `}
            role="group"
            aria-label={t('query.filter.group', '条件分组') + `: ${node.logic}`}
        >
            {/* 拖拽手柄 */}
            {showDragHandle && !disabled && (
                <Grip className="h-4 w-4 text-muted-foreground cursor-grab" />
            )}

            {/* 左括号 */}
            <span className="text-xs text-muted-foreground font-medium">(</span>

            {/* 子节点 */}
            {node.children.map((child, index) => (
                <React.Fragment key={child.id}>
                    {/* 逻辑连接符 */}
                    {index > 0 && (
                        <LogicConnector
                            logic={node.logic}
                            onClick={handleToggleLogic}
                            disabled={disabled}
                        />
                    )}
                    {/* 子节点渲染 */}
                    <NodeRenderer
                        node={child}
                        onUpdate={(updated) => handleUpdateChild(index, updated)}
                        onDelete={() => handleDeleteChild(index)}
                        onEditCondition={onEditCondition}
                        onToggleLogic={onToggleLogic}
                        availableColumns={availableColumns}
                        disabled={disabled}
                        depth={depth}
                    />
                </React.Fragment>
            ))}

            {/* 右括号 */}
            <span className="text-xs text-muted-foreground font-medium">)</span>

            {/* 删除分组按钮 */}
            {!disabled && onDelete && depth > 0 && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 ml-0.5 hover:bg-destructive/20 dark:hover:bg-destructive/30 hover:text-destructive"
                                onClick={onDelete}
                                aria-label={t('query.filter.ungroupConditions', '解散分组')}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            {t('query.filter.ungroupConditions', '解散分组')}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
        </div>
    );
};

export default GroupChip;
