/**
 * 条件芯片组件
 * FilterChip Component
 * 
 * 显示单个筛选条件，支持点击编辑和删除
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Badge } from '@/new/components/ui/badge';
import { Button } from '@/new/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/new/components/ui/tooltip';
import type { FilterCondition, FilterOperator } from './types';
import { getOperatorConfig } from './types';

export interface FilterChipProps {
    /** 条件节点 */
    node: FilterCondition;
    /** 点击编辑回调 */
    onEdit?: () => void;
    /** 删除回调 */
    onDelete?: () => void;
    /** 是否禁用 */
    disabled?: boolean;
    /** 自定义类名 */
    className?: string;
}

/**
 * 格式化显示值
 */
function formatDisplayValue(value: any, operator: FilterOperator): string {
    // 不需要值的操作符
    if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
        return '';
    }

    // IN/NOT IN 显示为列表
    if ((operator === 'IN' || operator === 'NOT IN') && Array.isArray(value)) {
        if (value.length === 0) return '()';
        if (value.length <= 3) {
            return `(${value.join(', ')})`;
        }
        return `(${value.slice(0, 2).join(', ')}, +${value.length - 2})`;
    }

    // BETWEEN 操作符不在这里处理（需要 value2）

    // 普通值
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'string') {
        // 截断过长的字符串
        if (value.length > 20) {
            return `'${value.slice(0, 17)}...'`;
        }
        return `'${value}'`;
    }
    return String(value);
}

/**
 * 获取操作符显示符号
 */
function getOperatorSymbol(operator: FilterOperator): string {
    const config = getOperatorConfig(operator);
    return config?.symbol || operator;
}

export const FilterChip: React.FC<FilterChipProps> = ({
    node,
    onEdit,
    onDelete,
    disabled = false,
    className,
}) => {
    const { t } = useTranslation('common');

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;

        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onEdit?.();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            onDelete?.();
        }
    };

    const handleClick = () => {
        if (!disabled) {
            onEdit?.();
        }
    };

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!disabled) {
            onDelete?.();
        }
    };

    // 构建完整的条件描述（用于 tooltip 和无障碍）
    const operatorSymbol = getOperatorSymbol(node.operator);
    const displayValue = formatDisplayValue(node.value, node.operator);
    const placement = node.placement || 'where';

    let fullDescription = `${node.table}.${node.column} ${operatorSymbol}`;
    if (displayValue) {
        fullDescription += ` ${displayValue}`;
    }
    if (node.operator === 'BETWEEN' && node.value2 !== undefined) {
        fullDescription += ` AND ${formatDisplayValue(node.value2, '=')}`;
    }
    fullDescription += ` [${placement.toUpperCase()}]`;

    const ariaLabel = t('filter.editCondition', '编辑条件') + ': ' + fullDescription;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Badge
                        variant="outline"
                        className={`
              cursor-pointer 
              hover:bg-muted 
              dark:hover:bg-muted/80
              gap-1 
              pr-1 
              max-w-[300px]
              transition-all duration-200
              border-border dark:border-border/60
              animate-filter-pop
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              ${className || ''}
            `}
                        onClick={handleClick}
                        onKeyDown={handleKeyDown}
                        tabIndex={disabled ? -1 : 0}
                        role="button"
                        aria-label={ariaLabel}
                    >
                        {/* Placement 标记 */}
                        <span
                            className={`
                                text-[9px] font-bold uppercase px-1 py-0 rounded
                                ${placement === 'on'
                                    ? 'bg-accent text-accent-foreground'
                                    : 'bg-muted text-muted-foreground'
                                }
                            `}
                        >
                            {placement}
                        </span>
                        {/* 表名 */}
                        <span className="text-muted-foreground text-xs truncate max-w-[60px]">
                            {node.table}.
                        </span>
                        {/* 列名 */}
                        <span className="font-medium truncate max-w-[80px]">
                            {node.column}
                        </span>
                        {/* 操作符 */}
                        <span className="text-primary dark:text-primary/90 font-medium mx-0.5">
                            {operatorSymbol}
                        </span>
                        {/* 值 */}
                        {displayValue && (
                            <span className="text-foreground truncate max-w-[80px]">
                                {displayValue}
                            </span>
                        )}
                        {/* BETWEEN 的第二个值 */}
                        {node.operator === 'BETWEEN' && node.value2 !== undefined && (
                            <>
                                <span className="text-muted-foreground mx-0.5">AND</span>
                                <span className="text-foreground truncate max-w-[60px]">
                                    {formatDisplayValue(node.value2, '=')}
                                </span>
                            </>
                        )}
                        {/* 删除按钮 */}
                        {!disabled && onDelete && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 ml-0.5 hover:bg-destructive/20 dark:hover:bg-destructive/30 hover:text-destructive"
                                onClick={handleDeleteClick}
                                aria-label={t('filter.deleteCondition', '删除条件')}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        )}
                    </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[400px]">
                    <p className="font-mono text-xs">{fullDescription}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

export default FilterChip;
