/**
 * 筛选条件容器组件
 * FilterBar Component
 * 
 * 双模筛选器的主容器，支持可视化模式和 SQL 模式切换
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, Code, Sparkles, X, AlertCircle } from 'lucide-react';
import { Button } from '@/new/components/ui/button';
import { Alert, AlertDescription } from '@/new/components/ui/alert';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/new/components/ui/tooltip';
import { FilterChip } from './FilterChip';
import { LogicConnector } from './LogicConnector';
import { GroupChip } from './GroupChip';
import { FilterPopover } from './FilterPopover';
import { DraggableFilterList } from './DraggableFilterList';
import type {
    FilterGroup,
    FilterNode,
    FilterCondition,
    ColumnInfo,
    ParseResult,
} from './types';
import { MAX_CONDITIONS_RECOMMENDED } from './types';
import {
    generateFilterSQL,
    parseFilterSQL,
    createEmptyGroup,
    toggleGroupLogic,
    removeNodeById,
    addConditionToTree,
    countConditions,
} from './filterUtils';

export interface FilterBarProps {
    /** 当前筛选树 */
    filterTree: FilterGroup;
    /** 筛选树变化回调 */
    onFilterChange: (tree: FilterGroup) => void;
    /** 可用的列信息 */
    availableColumns: ColumnInfo[];
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否启用拖拽排序 */
    enableDragDrop?: boolean;
    /** 自定义类名 */
    className?: string;
}

type FilterMode = 'visual' | 'sql';

export const FilterBar: React.FC<FilterBarProps> = ({
    filterTree,
    onFilterChange,
    availableColumns,
    disabled = false,
    enableDragDrop = false,
    className,
}) => {
    const { t } = useTranslation('common');

    // 模式状态
    const [mode, setMode] = React.useState<FilterMode>('visual');

    // SQL 模式下的内容
    const [sqlContent, setSqlContent] = React.useState<string>('');

    // 解析警告
    const [parseWarnings, setParseWarnings] = React.useState<string[]>([]);

    // 编辑中的条件
    const [editingCondition, setEditingCondition] = React.useState<FilterCondition | null>(null);

    // 条件数量
    const conditionCount = React.useMemo(() => countConditions(filterTree), [filterTree]);

    // 切换到 SQL 模式
    const switchToSqlMode = () => {
        const sql = generateFilterSQL(filterTree);
        // 如果是空括号，显示为空
        setSqlContent(sql === '()' ? '' : sql);
        setParseWarnings([]);
        setMode('sql');
    };

    // 切换到可视化模式
    const switchToVisualMode = () => {
        if (!sqlContent.trim()) {
            onFilterChange(createEmptyGroup());
            setMode('visual');
            return;
        }

        const result: ParseResult = parseFilterSQL(sqlContent);

        if (result.warnings && result.warnings.length > 0) {
            setParseWarnings(result.warnings);
        } else {
            setParseWarnings([]);
        }

        // 确保根节点是 Group
        if (result.node.type === 'group') {
            onFilterChange(result.node);
        } else {
            // 将单个节点包装在 Group 中
            onFilterChange({
                ...createEmptyGroup(),
                children: [result.node],
            });
        }

        setMode('visual');
    };

    // 添加条件
    const handleAddCondition = (condition: FilterCondition) => {
        const newTree = addConditionToTree(filterTree, condition);
        onFilterChange(newTree);
    };

    // 更新条件（编辑）
    const handleUpdateCondition = (condition: FilterCondition) => {
        // 先删除旧的，再添加新的
        let newTree = removeNodeById(filterTree, condition.id);
        newTree = addConditionToTree(newTree, condition);
        onFilterChange(newTree);
        setEditingCondition(null);
    };

    // 删除条件
    const handleDeleteCondition = (conditionId: string) => {
        const newTree = removeNodeById(filterTree, conditionId);
        onFilterChange(newTree);
    };

    // 切换根节点逻辑
    const handleToggleRootLogic = () => {
        const newTree = toggleGroupLogic(filterTree, filterTree.id);
        onFilterChange(newTree);
    };

    // 清空所有条件
    const handleClearAll = () => {
        onFilterChange(createEmptyGroup());
        setSqlContent('');
        setParseWarnings([]);
    };

    // 渲染节点
    const renderNode = (node: FilterNode, _index: number, isLast: boolean) => {
        switch (node.type) {
            case 'condition':
                return (
                    <React.Fragment key={node.id}>
                        <FilterChip
                            node={node}
                            onEdit={() => setEditingCondition(node)}
                            onDelete={() => handleDeleteCondition(node.id)}
                            disabled={disabled}
                        />
                        {!isLast && (
                            <LogicConnector
                                logic={filterTree.logic}
                                onClick={handleToggleRootLogic}
                                disabled={disabled}
                            />
                        )}
                    </React.Fragment>
                );
            case 'group':
                return (
                    <React.Fragment key={node.id}>
                        <GroupChip
                            node={node}
                            onUpdate={(updated) => {
                                const newChildren = filterTree.children.map(c =>
                                    c.id === node.id ? updated : c
                                );
                                onFilterChange({ ...filterTree, children: newChildren });
                            }}
                            onDelete={() => handleDeleteCondition(node.id)}
                            onEditCondition={setEditingCondition}
                            onDeleteCondition={handleDeleteCondition}
                            onToggleLogic={(groupId) => {
                                const newTree = toggleGroupLogic(filterTree, groupId);
                                onFilterChange(newTree);
                            }}
                            availableColumns={availableColumns}
                            disabled={disabled}
                        />
                        {!isLast && (
                            <LogicConnector
                                logic={filterTree.logic}
                                onClick={handleToggleRootLogic}
                                disabled={disabled}
                            />
                        )}
                    </React.Fragment>
                );
            case 'raw':
                return (
                    <React.Fragment key={node.id}>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 rounded-md">
                                        <Code className="h-3 w-3" />
                                        <span className="font-mono max-w-[150px] truncate">{node.sql}</span>
                                        {!disabled && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-4 w-4 hover:bg-amber-200 dark:hover:bg-amber-800"
                                                onClick={() => handleDeleteCondition(node.id)}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="text-xs">{t('filter.rawSqlBlock', '原始 SQL（无法解析）')}</p>
                                    <pre className="font-mono text-xs mt-1">{node.sql}</pre>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        {!isLast && (
                            <LogicConnector
                                logic={filterTree.logic}
                                onClick={handleToggleRootLogic}
                                disabled={disabled}
                            />
                        )}
                    </React.Fragment>
                );
            default:
                return null;
        }
    };

    const isEmpty = filterTree.children.length === 0;

    return (
        <div className={`border-t border-border bg-muted/30 p-3 ${className || ''}`}>
            {/* 头部：标题 + 模式切换 */}
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                        {t('filter.title', 'WHERE 条件')}
                    </span>
                    {conditionCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                            ({conditionCount})
                        </span>
                    )}
                    {conditionCount > MAX_CONDITIONS_RECOMMENDED && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <AlertCircle className="h-4 w-4 text-amber-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t('filter.error.tooManyConditions', '条件过多，建议使用 SQL 模式')}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {/* 模式切换按钮 */}
                    <div className="flex border rounded-md overflow-hidden">
                        <Button
                            variant={mode === 'visual' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="rounded-none h-7 px-2 gap-1"
                            onClick={() => mode === 'sql' && switchToVisualMode()}
                        >
                            <Sparkles className="h-3 w-3" />
                            <span className="text-xs">{t('filter.modes.visual', '可视化')}</span>
                        </Button>
                        <Button
                            variant={mode === 'sql' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="rounded-none h-7 px-2 gap-1"
                            onClick={() => mode === 'visual' && switchToSqlMode()}
                        >
                            <Code className="h-3 w-3" />
                            <span className="text-xs">{t('filter.modes.sql', 'SQL')}</span>
                        </Button>
                    </div>

                    {/* 清空按钮 */}
                    {!isEmpty && !disabled && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2"
                                        onClick={handleClearAll}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t('filter.action.clearAll', '清空所有条件')}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </div>

            {/* 解析警告 */}
            {parseWarnings.length > 0 && (
                <Alert variant="default" className="mb-2 py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                        {parseWarnings.join('; ')}
                    </AlertDescription>
                </Alert>
            )}

            {/* 主体内容 */}
            {mode === 'visual' ? (
                // 可视化模式
                <div className="flex flex-wrap items-center gap-1 min-h-[32px]">
                    {isEmpty ? (
                        // 空状态
                        <span className="text-xs text-muted-foreground">
                            {t('filter.emptyPlaceholder', '暂无筛选条件')}
                        </span>
                    ) : enableDragDrop ? (
                        // 拖拽模式
                        <DraggableFilterList
                            filterTree={filterTree}
                            onFilterChange={onFilterChange}
                            onEditCondition={setEditingCondition}
                            onDeleteCondition={handleDeleteCondition}
                            onToggleLogic={handleToggleRootLogic}
                            disabled={disabled}
                        />
                    ) : (
                        // 静态模式：渲染条件列表
                        filterTree.children.map((node, index) =>
                            renderNode(node, index, index === filterTree.children.length - 1)
                        )
                    )}

                    {/* 添加条件按钮 */}
                    {!disabled && (
                        <FilterPopover
                            mode="add"
                            availableColumns={availableColumns}
                            onSubmit={handleAddCondition}
                        />
                    )}
                </div>
            ) : (
                // SQL 模式
                <div className="space-y-2">
                    <textarea
                        value={sqlContent}
                        onChange={(e) => setSqlContent(e.target.value)}
                        placeholder={t('filter.sqlPlaceholder', '输入 WHERE 子句，例如: status = \'active\' AND amount > 100')}
                        className="w-full h-20 p-2 text-sm font-mono border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        disabled={disabled}
                    />
                    <div className="flex justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={switchToVisualMode}
                            disabled={disabled}
                        >
                            {t('filter.action.applyAndSwitch', '应用并切换到可视化')}
                        </Button>
                    </div>
                </div>
            )}

            {/* 编辑条件弹窗 */}
            {editingCondition && (
                <FilterPopover
                    mode="edit"
                    initialValue={editingCondition}
                    availableColumns={availableColumns}
                    onSubmit={handleUpdateCondition}
                    onCancel={() => setEditingCondition(null)}
                    open={true}
                    onOpenChange={(open) => !open && setEditingCondition(null)}
                    trigger={<span />}
                />
            )}
        </div>
    );
};

export default FilterBar;
