/**
 * 逻辑连接符组件
 * LogicConnector Component
 * 
 * 显示 AND/OR 逻辑连接符，支持点击切换
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/new/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/new/components/ui/tooltip';
import type { LogicOperator } from './types';

export interface LogicConnectorProps {
    /** 当前逻辑操作符 */
    logic: LogicOperator;
    /** 点击切换回调 */
    onClick?: () => void;
    /** 是否禁用 */
    disabled?: boolean;
    /** 尺寸 */
    size?: 'sm' | 'default';
    /** 自定义类名 */
    className?: string;
}

export const LogicConnector: React.FC<LogicConnectorProps> = ({
    logic,
    onClick,
    disabled = false,
    size = 'sm',
    className,
}) => {
    const { t } = useTranslation('common');

    const handleClick = () => {
        if (!disabled && onClick) {
            onClick();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;

        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
        }
    };

    const nextLogic = logic === 'AND' ? 'OR' : 'AND';
    const tooltipText = t('query.filter.logic.toggle', '点击切换为 {{logic}}', { logic: nextLogic });

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size={size}
                        className={`
              px-2 
              h-6
              text-xs 
              font-medium 
              text-muted-foreground 
              hover:text-primary 
              hover:bg-primary/10
              transition-all duration-200
              animate-filter-slide-in
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${className || ''}
            `}
                        onClick={handleClick}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        aria-label={t('query.filter.logic.toggle', '切换逻辑') + `: ${logic}`}
                        role="button"
                    >
                        <span className="mx-1">—</span>
                        <span className={`
              ${logic === 'AND' ? 'text-blue-500 dark:text-blue-400' : 'text-orange-500 dark:text-orange-400'}
              font-semibold
            `}>
                            {logic}
                        </span>
                        <span className="mx-1">—</span>
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                    <p>{tooltipText}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

/**
 * 静态显示版本的逻辑连接符（不可点击）
 */
export const LogicConnectorStatic: React.FC<{
    logic: LogicOperator;
    className?: string;
}> = ({ logic, className }) => {
    return (
        <span
            className={`
        inline-flex items-center
        px-2 
        text-xs 
        font-medium 
        text-muted-foreground
        ${className || ''}
      `}
        >
            <span className="mx-1">—</span>
            <span className={`
        ${logic === 'AND' ? 'text-blue-500 dark:text-blue-400' : 'text-orange-500 dark:text-orange-400'}
        font-semibold
      `}>
                {logic}
            </span>
            <span className="mx-1">—</span>
        </span>
    );
};

export default LogicConnector;
