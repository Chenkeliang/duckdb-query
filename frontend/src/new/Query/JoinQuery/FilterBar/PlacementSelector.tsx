/**
 * PlacementSelector - 条件应用位置选择器
 * 
 * 用于在 FilterPopover 中选择条件应用于 ON 子句还是 WHERE 子句
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/new/components/ui/label';
import { Button } from '@/new/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/new/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import type { FilterPlacement, PlacementContext } from './types';
import { cn } from '@/lib/utils';

interface PlacementSelectorProps {
    /** 当前选中的 placement */
    value: FilterPlacement;
    /** 值变更回调 */
    onChange: (value: FilterPlacement) => void;
    /** 位置上下文（保留接口兼容性） */
    context?: PlacementContext;
    /** 是否禁用 */
    disabled?: boolean;
}

/**
 * 条件应用位置选择器组件
 */
export const PlacementSelector: React.FC<PlacementSelectorProps> = ({
    value,
    onChange,
    context: _context,
    disabled = false,
}) => {
    const { t } = useTranslation('common');

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1.5">
                <Label className="text-xs font-medium">
                    {t('query.filter.placement.label', '应用位置')}
                </Label>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">
                                {t(
                                    'filter.placement.helpText',
                                    'ON 子句条件在 JOIN 时生效，保留无匹配的行（显示为 NULL）。WHERE 子句条件在 JOIN 后生效，会过滤掉不匹配的行。查询外部数据库表时，建议添加时间范围条件以避免全表扫描导致查询时间过长。'
                                )}
                            </p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            <div className="flex gap-2">
                {/* ON 选项 */}
                <Button
                    type="button"
                    variant={value === 'on' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                        "flex-1 justify-start h-auto py-2 px-3",
                        value === 'on' && "ring-2 ring-primary ring-offset-1"
                    )}
                    disabled={disabled}
                    onClick={() => onChange('on')}
                >
                    <div className="flex flex-col items-start gap-0.5 w-full">
                        <span className="font-medium text-sm">
                            {t('query.filter.placement.on', 'ON 子句')}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-normal text-left">
                            {t('query.filter.placement.onHint', '在 JOIN 时过滤')}
                        </span>
                    </div>
                </Button>

                {/* WHERE 选项 */}
                <Button
                    type="button"
                    variant={value === 'where' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                        "flex-1 justify-start h-auto py-2 px-3",
                        value === 'where' && "ring-2 ring-primary ring-offset-1"
                    )}
                    disabled={disabled}
                    onClick={() => onChange('where')}
                >
                    <div className="flex flex-col items-start gap-0.5 w-full">
                        <span className="font-medium text-sm">
                            {t('query.filter.placement.where', 'WHERE 子句')}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-normal text-left">
                            {t('query.filter.placement.whereHint', '在结果中过滤')}
                        </span>
                    </div>
                </Button>
            </div>
        </div>
    );
};

export default PlacementSelector;
