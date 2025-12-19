/**
 * 类型冲突指示器组件
 * 
 * 用于在 JOIN 条件旁边显示类型冲突状态：
 * - 无冲突：不显示
 * - 未解决冲突：显示警告图标 + tooltip
 * - 已解决冲突：显示成功图标 + tooltip
 * 
 * 可用于：JoinQueryPanel、VisualQuery、SetOperations 等
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/new/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { TypeConflict } from '@/new/hooks/useTypeConflict';

export interface TypeConflictIndicatorProps {
  /** 冲突对象，null/undefined 表示无冲突 */
  conflict: TypeConflict | null | undefined;
  /** 点击时的回调（打开对话框） */
  onClick?: () => void;
  /** 尺寸 */
  size?: 'sm' | 'md';
  /** 额外的 className */
  className?: string;
}

/**
 * 通用类型冲突指示器
 */
export const TypeConflictIndicator: React.FC<TypeConflictIndicatorProps> = ({
  conflict,
  onClick,
  size = 'sm',
  className,
}) => {
  const { t } = useTranslation('common');

  // 无冲突时不显示
  if (!conflict) {
    return null;
  }

  const isResolved = !!conflict.resolvedType;
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const buttonSize = size === 'sm' ? 'p-0.5' : 'p-1';

  // 构建 tooltip 内容
  const tooltipContent = isResolved
    ? t('query.typeConflict.resolved', '已转换为 {{type}}', {
        type: conflict.resolvedType,
      })
    : t('query.typeConflict.detected', '类型冲突: {{leftType}} ≠ {{rightType}}', {
        leftType: conflict.leftTypeDisplay,
        rightType: conflict.rightTypeDisplay,
      });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={cn(
              'rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1',
              buttonSize,
              isResolved
                ? 'text-success hover:bg-success/10 focus:ring-success/50'
                : 'text-warning hover:bg-warning/10 focus:ring-warning/50',
              className
            )}
            aria-label={tooltipContent}
          >
            {isResolved ? (
              <CheckCircle2 className={iconSize} />
            ) : (
              <AlertTriangle className={iconSize} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{tooltipContent}</p>
          {!isResolved && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('query.typeConflict.clickToResolve', '点击解决')}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default TypeConflictIndicator;
