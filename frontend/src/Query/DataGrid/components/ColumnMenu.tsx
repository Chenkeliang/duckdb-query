/**
 * ColumnMenu - 列管理菜单组件
 * 
 * 功能：
 * - 显示所有列
 * - 重置列（列宽和列顺序）
 * - 自动列宽（所有列根据内容自动调整）
 * - 适应宽度（所有列平均分配容器宽度）
 * - 列显示/隐藏切换
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Columns3, Eye, EyeOff, RefreshCw, Maximize2, ArrowLeftRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

export interface ColumnMenuProps {
  /** 所有列字段名 */
  allColumns: string[];
  /** 可见列字段名 */
  visibleColumns: string[];
  /** 隐藏列数量 */
  hiddenCount: number;
  /** 切换列可见性 */
  onToggleColumn: (field: string) => void;
  /** 显示所有列 */
  onShowAllColumns: () => void;
  /** 重置列（列宽和可见性） */
  onResetColumns: () => void;
  /** 自动列宽（所有列） */
  onAutoFitAllColumns: () => void;
  /** 适应宽度（平均分配） */
  onFitToWidth: () => void;
  /** 自定义类名 */
  className?: string;
}

export const ColumnMenu: React.FC<ColumnMenuProps> = ({
  allColumns,
  visibleColumns,
  hiddenCount,
  onToggleColumn,
  onShowAllColumns,
  onResetColumns,
  onAutoFitAllColumns,
  onFitToWidth,
  className,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);

  const visibleSet = React.useMemo(() => new Set(visibleColumns), [visibleColumns]);

  // 处理按钮点击，不关闭菜单
  const handleAction = React.useCallback((action: () => void) => {
    action();
    // 不关闭菜单，让用户可以继续操作
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-7 gap-1 text-xs', className)}
        >
          <Columns3 className="h-3.5 w-3.5" />
          <span>{t('dataGrid.columns', '列')}</span>
          {hiddenCount > 0 && (
            <span className="text-muted-foreground">
              ({hiddenCount} {t('dataGrid.hidden', '隐藏')})
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-0"
        align="end"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={() => {
          // 点击外部时关闭
        }}
      >
        <div className="p-2 space-y-1">
          {/* 显示所有列 */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-8 text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAction(onShowAllColumns);
            }}
            disabled={hiddenCount === 0}
          >
            <Eye className="h-3.5 w-3.5 mr-2" />
            {t('dataGrid.showAllColumns', '显示所有列')}
          </Button>

          {/* 重置列 */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-8 text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAction(onResetColumns);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            {t('dataGrid.resetColumns', '重置列')}
          </Button>
        </div>

        <Separator />

        <div className="p-2 space-y-1">
          {/* 自动列宽 */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-8 text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAction(onAutoFitAllColumns);
            }}
          >
            <Maximize2 className="h-3.5 w-3.5 mr-2" />
            {t('dataGrid.autoFitColumns', '自动列宽')}
          </Button>

          {/* 适应宽度 */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-8 text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAction(onFitToWidth);
            }}
          >
            <ArrowLeftRight className="h-3.5 w-3.5 mr-2" />
            {t('dataGrid.fitToWidth', '适应宽度')}
          </Button>
        </div>

        <Separator />

        {/* 列列表 */}
        <ScrollArea className="h-64">
          <div className="p-2 space-y-0.5">
            {allColumns.map((field) => {
              const isVisible = visibleSet.has(field);
              return (
                <button
                  key={field}
                  className={cn(
                    'flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-left',
                    'hover:bg-accent transition-colors',
                    !isVisible && 'text-muted-foreground'
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleColumn(field);
                  }}
                >
                  {isVisible ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  <span className="truncate flex-1">{field}</span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export { ColumnMenu as default };
