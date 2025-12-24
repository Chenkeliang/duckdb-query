/**
 * 可拖拽筛选条件组件
 * DraggableFilterList Component
 * 
 * 使用 @dnd-kit 实现拖拽排序和分组功能
 */

import * as React from 'react';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    useSensor,
    useSensors,
    closestCenter,
} from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Grip } from 'lucide-react';
import { FilterChip } from './FilterChip';
import { LogicConnector, LogicConnectorStatic } from './LogicConnector';
import type {
    FilterNode,
    FilterCondition,
    FilterGroup,
} from './types';

export interface DraggableFilterListProps {
    /** 根分组节点 */
    filterTree: FilterGroup;
    /** 更新回调 */
    onFilterChange: (tree: FilterGroup) => void;
    /** 编辑条件回调 */
    onEditCondition?: (condition: FilterCondition) => void;
    /** 删除条件回调 */
    onDeleteCondition?: (conditionId: string) => void;
    /** 切换逻辑回调 */
    onToggleLogic?: () => void;
    /** 是否禁用 */
    disabled?: boolean;
}

/**
 * 可拖拽的条件项
 */
interface SortableItemProps {
    node: FilterCondition;
    onEdit?: () => void;
    onDelete?: () => void;
    disabled?: boolean;
}

const SortableItem: React.FC<SortableItemProps> = ({
    node,
    onEdit,
    onDelete,
    disabled,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: node.id, disabled });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : 'auto',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="inline-flex items-center gap-1"
        >
            {/* 拖拽手柄 */}
            {!disabled && (
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab hover:bg-muted p-0.5 rounded touch-none"
                    aria-label="拖拽排序"
                >
                    <Grip className="h-3 w-3 text-muted-foreground" />
                </button>
            )}
            {/* 条件芯片 */}
            <FilterChip
                node={node}
                onEdit={onEdit}
                onDelete={onDelete}
                disabled={disabled}
            />
        </div>
    );
};

/**
 * 拖拽预览组件
 */
const DragOverlayContent: React.FC<{ node: FilterCondition }> = ({ node }) => {
    return (
        <div className="inline-flex items-center gap-1 bg-background shadow-lg rounded-md p-1 border">
            <Grip className="h-3 w-3 text-muted-foreground" />
            <FilterChip node={node} disabled />
        </div>
    );
};

export const DraggableFilterList: React.FC<DraggableFilterListProps> = ({
    filterTree,
    onFilterChange,
    onEditCondition,
    onDeleteCondition,
    onToggleLogic,
    disabled = false,
}) => {
    const [activeId, setActiveId] = React.useState<string | null>(null);

    // 配置拖拽传感器
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // 需要移动8px才开始拖拽
            },
        })
    );

    // 获取当前拖拽的节点
    const activeNode = React.useMemo(() => {
        if (!activeId) return null;
        return filterTree.children.find(
            (child): child is FilterCondition =>
                child.type === 'condition' && child.id === activeId
        );
    }, [activeId, filterTree.children]);

    // 获取所有条件节点的 id
    const itemIds = React.useMemo(() => {
        return filterTree.children
            .filter((child): child is FilterCondition => child.type === 'condition')
            .map((child) => child.id);
    }, [filterTree.children]);

    // 开始拖拽
    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    // 拖拽结束 - 重新排序
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over || active.id === over.id) {
            return;
        }

        const oldIndex = filterTree.children.findIndex(
            (child) => child.id === active.id
        );
        const newIndex = filterTree.children.findIndex(
            (child) => child.id === over.id
        );

        if (oldIndex !== -1 && newIndex !== -1) {
            const newChildren = [...filterTree.children];
            const [removed] = newChildren.splice(oldIndex, 1);
            newChildren.splice(newIndex, 0, removed);

            onFilterChange({
                ...filterTree,
                children: newChildren,
            });
        }
    };

    // 拖拽取消
    const handleDragCancel = () => {
        setActiveId(null);
    };

    // 渲染节点
    const renderNode = (node: FilterNode, _index: number, isLast: boolean) => {
        if (node.type === 'condition') {
            return (
                <React.Fragment key={node.id}>
                    <SortableItem
                        node={node}
                        onEdit={() => onEditCondition?.(node)}
                        onDelete={() => onDeleteCondition?.(node.id)}
                        disabled={disabled}
                    />
                    {!isLast && (
                        <LogicConnector
                            logic={filterTree.logic}
                            onClick={onToggleLogic}
                            disabled={disabled}
                        />
                    )}
                </React.Fragment>
            );
        }

        if (node.type === 'group') {
            // 分组暂时简化显示
            return (
                <React.Fragment key={node.id}>
                    <span className="text-xs text-muted-foreground">
                        ({node.children.length} 个条件)
                    </span>
                    {!isLast && (
                        <LogicConnectorStatic logic={filterTree.logic} />
                    )}
                </React.Fragment>
            );
        }

        if (node.type === 'raw') {
            return (
                <React.Fragment key={node.id}>
                    <span className="text-xs font-mono text-amber-600 dark:text-amber-400">
                        {node.sql.length > 20 ? node.sql.slice(0, 17) + '...' : node.sql}
                    </span>
                    {!isLast && (
                        <LogicConnectorStatic logic={filterTree.logic} />
                    )}
                </React.Fragment>
            );
        }

        return null;
    };

    if (disabled) {
        // 禁用状态下不使用拖拽
        return (
            <div className="flex flex-wrap items-center gap-1">
                {filterTree.children.map((node, index) =>
                    renderNode(node, index, index === filterTree.children.length - 1)
                )}
            </div>
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <SortableContext items={itemIds} strategy={horizontalListSortingStrategy}>
                <div className="flex flex-wrap items-center gap-1">
                    {filterTree.children.map((node, index) =>
                        renderNode(node, index, index === filterTree.children.length - 1)
                    )}
                </div>
            </SortableContext>

            {/* 拖拽预览 */}
            <DragOverlay>
                {activeNode && <DragOverlayContent node={activeNode} />}
            </DragOverlay>
        </DndContext>
    );
};

export default DraggableFilterList;
