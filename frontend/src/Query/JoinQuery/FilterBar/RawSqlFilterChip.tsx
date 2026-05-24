/**
 * JOIN 筛选条：无法解析的原始 SQL 块（芯片 + 悬停高亮预览）
 */
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Code, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SQLHighlight } from '@/components/SQLHighlight';
import { cn } from '@/lib/utils';

export interface RawSqlFilterChipProps {
  sql: string;
  onDelete?: () => void;
  disabled?: boolean;
  /** 芯片内截断长度 */
  truncateAt?: number;
  showCodeIcon?: boolean;
  className?: string;
}

export const RawSqlFilterChip: React.FC<RawSqlFilterChipProps> = ({
  sql,
  onDelete,
  disabled = false,
  truncateAt = 30,
  showCodeIcon = false,
  className,
}) => {
  const { t } = useTranslation('common');
  const preview =
    sql.length > truncateAt ? `${sql.slice(0, truncateAt - 3)}...` : sql;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 text-xs',
              'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200',
              'border border-amber-300 dark:border-amber-700 rounded-md',
              disabled && 'opacity-50',
              className
            )}
          >
            {showCodeIcon ? <Code className="h-3 w-3 shrink-0" /> : null}
            <span className="font-mono max-w-[200px] truncate">{preview}</span>
            {!disabled && onDelete ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 hover:bg-amber-200 dark:hover:bg-amber-800"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                aria-label={t('query.filter.deleteCondition', '删除')}
              >
                <X className="h-3 w-3" />
              </Button>
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-md p-2">
          <p className="text-xs text-muted-foreground mb-1">
            {t('query.filter.rawSqlBlock', '原始 SQL 块（无法解析）')}
          </p>
          <SQLHighlight
            sql={sql}
            minHeight="3rem"
            maxHeight="10rem"
            className="border-0 rounded-md min-w-[240px]"
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default RawSqlFilterChip;
