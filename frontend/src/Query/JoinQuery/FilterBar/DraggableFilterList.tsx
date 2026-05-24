/**
 * 可拖拽筛选条件组件
 * DraggableFilterList Component
 *
 * 使用 @dnd-kit 实现拖拽排序和分组功能
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
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
import { RawSqlFilterChip } from './RawSqlFilterChip';
import type {
  FilterNode,
  FilterCondition,
  FilterGroup,
  FilterRaw,
} from './types';

export interface DraggableFilterListProps {
  filterTree: FilterGroup;
  onFilterChange: (tree: FilterGroup) => void;
  onEditCondition?: (condition: FilterCondition) => void;
  onDeleteCondition?: (conditionId: string) => void;
  onToggleLogic?: () => void;
  disabled?: boolean;
}

type SortableFilterNode = FilterCondition | FilterRaw;

function isSortableNode(node: FilterNode): node is SortableFilterNode {
  return node.type === 'condition' || node.type === 'raw';
}

interface SortableConditionItemProps {
  node: FilterCondition;
  onEdit?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}

const SortableConditionItem: React.FC<SortableConditionItemProps> = ({
  node,
  onEdit,
  onDelete,
  disabled,
}) => {
  const { t } = useTranslation('common');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="inline-flex items-center gap-1">
      {!disabled ? (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab hover:bg-muted p-0.5 rounded touch-none"
          aria-label={t('query.filter.dragToSort', 'Drag to sort')}
        >
          <Grip className="h-3 w-3 text-muted-foreground" />
        </button>
      ) : null}
      <FilterChip node={node} onEdit={onEdit} onDelete={onDelete} disabled={disabled} />
    </div>
  );
};

interface SortableRawSqlItemProps {
  node: FilterRaw;
  onDelete?: () => void;
  disabled?: boolean;
}

const SortableRawSqlItem: React.FC<SortableRawSqlItemProps> = ({
  node,
  onDelete,
  disabled,
}) => {
  const { t } = useTranslation('common');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="inline-flex items-center gap-1">
      {!disabled ? (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab hover:bg-muted p-0.5 rounded touch-none"
          aria-label={t('query.filter.dragToSort', 'Drag to sort')}
        >
          <Grip className="h-3 w-3 text-muted-foreground" />
        </button>
      ) : null}
      <RawSqlFilterChip
        sql={node.sql}
        truncateAt={24}
        disabled={disabled}
        onDelete={onDelete}
      />
    </div>
  );
};

const DragOverlayContent: React.FC<{ node: SortableFilterNode }> = ({ node }) => (
  <div className="inline-flex items-center gap-1 bg-background shadow-lg rounded-md p-1 border">
    <Grip className="h-3 w-3 text-muted-foreground shrink-0" />
    {node.type === 'condition' ? (
      <FilterChip node={node} disabled />
    ) : (
      <RawSqlFilterChip sql={node.sql} truncateAt={28} disabled />
    )}
  </div>
);

export const DraggableFilterList: React.FC<DraggableFilterListProps> = ({
  filterTree,
  onFilterChange,
  onEditCondition,
  onDeleteCondition,
  onToggleLogic,
  disabled = false,
}) => {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const activeNode = React.useMemo((): SortableFilterNode | null => {
    if (!activeId) return null;
    const found = filterTree.children.find((child) => child.id === activeId);
    return found && isSortableNode(found) ? found : null;
  }, [activeId, filterTree.children]);

  const itemIds = React.useMemo(
    () => filterTree.children.filter(isSortableNode).map((child) => child.id),
    [filterTree.children]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = filterTree.children.findIndex((child) => child.id === active.id);
    const newIndex = filterTree.children.findIndex((child) => child.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newChildren = [...filterTree.children];
      const [removed] = newChildren.splice(oldIndex, 1);
      newChildren.splice(newIndex, 0, removed);
      onFilterChange({ ...filterTree, children: newChildren });
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const renderNode = (node: FilterNode, _index: number, isLast: boolean) => {
    const connector = !isLast ? (
      <LogicConnector
        logic={filterTree.logic}
        onClick={onToggleLogic}
        disabled={disabled}
      />
    ) : null;

    const staticConnector = !isLast ? (
      <LogicConnectorStatic logic={filterTree.logic} />
    ) : null;

    if (node.type === 'condition') {
      return (
        <React.Fragment key={node.id}>
          <SortableConditionItem
            node={node}
            onEdit={() => onEditCondition?.(node)}
            onDelete={() => onDeleteCondition?.(node.id)}
            disabled={disabled}
          />
          {disabled ? staticConnector : connector}
        </React.Fragment>
      );
    }

    if (node.type === 'group') {
      return (
        <React.Fragment key={node.id}>
          <span className="text-xs text-muted-foreground">
            ({node.children.length} 个条件)
          </span>
          {staticConnector}
        </React.Fragment>
      );
    }

    if (node.type === 'raw') {
      return (
        <React.Fragment key={node.id}>
          {disabled ? (
            <RawSqlFilterChip
              sql={node.sql}
              truncateAt={24}
              disabled
              onDelete={() => onDeleteCondition?.(node.id)}
            />
          ) : (
            <SortableRawSqlItem
              node={node}
              onDelete={() => onDeleteCondition?.(node.id)}
            />
          )}
          {disabled ? staticConnector : connector}
        </React.Fragment>
      );
    }

    return null;
  };

  if (disabled) {
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

      <DragOverlay>
        {activeNode ? <DragOverlayContent node={activeNode} /> : null}
      </DragOverlay>
    </DndContext>
  );
};

export default DraggableFilterList;
