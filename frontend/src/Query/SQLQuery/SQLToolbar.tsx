/**
 * SQL 编辑器工具栏组件
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2, FileCode, Clock, ChevronDown, Database, StopCircle, Star } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { IS_DEMO } from '@/demo/isDemo';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

export interface SQLToolbarProps {
  /** 执行回调 */
  onExecute?: () => void;
  /** 取消回调 */
  onCancel?: () => void;
  /** 异步执行回调 */
  onAsyncExecute?: () => void;
  /** 格式化回调 */
  onFormat?: () => void;
  /** 保存回调 */
  onSave?: () => void;

  /** 是否正在执行 */
  isExecuting?: boolean;
  /** 是否正在取消 */
  isCancelling?: boolean;
  /** 是否禁用执行 */
  disableExecute?: boolean;
  /** 执行时间（毫秒） */
  executionTime?: number;
  /** 额外内容（如状态指示器） */
  extraContent?: React.ReactNode;
  /** 左侧按钮组尾部插槽(AI ✨ 解释按钮) */
  aiSlot?: React.ReactNode;
  /** 自定义类名 */
  className?: string;
}

interface QueryExecutionButtonsProps {
  onExecute?: () => void;
  onCancel?: () => void;
  onSaveTable?: () => void;
  isExecuting?: boolean;
  isCancelling?: boolean;
  disabled?: boolean;
  saveDisabled?: boolean;
}

/** One execute/save flow shared by SQL, JOIN, set and pivot workspaces. */
export function QueryExecutionButtons({ onExecute, onCancel, onSaveTable, isExecuting = false,
  isCancelling = false, disabled = false, saveDisabled = false }: QueryExecutionButtonsProps) {
  const { t } = useTranslation('common');
  const saveTable = IS_DEMO ? undefined : onSaveTable;
  const cancelling = isExecuting && !!onCancel;
  return <div className="flex shrink-0 items-center" data-aligned-row>
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={cancelling ? 'secondary' : 'run'} size="sm"
            className={cn('h-7 gap-1.5', saveTable && !isExecuting && 'rounded-r-none')}
            onClick={cancelling ? onCancel : onExecute}
            disabled={cancelling ? isCancelling : disabled || isExecuting}>
            {isExecuting ? (cancelling && !isCancelling ? <StopCircle className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />) : <Play className="size-3.5" />}
            {t(cancelling ? 'query.cancel' : 'query.execute', cancelling ? '取消' : '执行')}
          </Button>
        </TooltipTrigger>
        <TooltipContent><p>{cancelling ? t('query.sql.cancelTooltip', '取消当前查询') : t('query.execute', '执行')}</p></TooltipContent>
      </Tooltip>
      {saveTable && !isExecuting && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="run" size="icon" className="h-7 w-7 rounded-l-none border-l border-current/20"
            aria-label={t('query.sql.runOptions', '执行方式')} disabled={disabled || saveDisabled}>
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={saveTable} className="gap-2">
            <Database className="size-4" />{t('async.dialog.title', '保存为表')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    </TooltipProvider>
  </div>;
}

/**
 * 格式化执行时间
 */
function formatExecutionTime(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * SQL 工具栏组件
 */
export const SQLToolbar: React.FC<SQLToolbarProps> = ({
  onExecute,
  onCancel,
  onAsyncExecute,
  onFormat,
  onSave,

  isExecuting = false,
  isCancelling = false,
  disableExecute = false,
  executionTime,
  extraContent,
  aiSlot,
  className,
}) => {
  const { t } = useTranslation('common');
  // Demo:异步执行 / 收藏 需后端 → 回调置空,按钮即不渲染
  const asyncExecute = IS_DEMO ? undefined : onAsyncExecute;
  const save = IS_DEMO ? undefined : onSave;

  return (
    <div
      className={cn(
        '@container flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-2',
        className
      )}
    >
      {/* 左侧：主要操作 */}
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <TooltipProvider delayDuration={300}>
          <QueryExecutionButtons onExecute={onExecute} onCancel={onCancel} onSaveTable={asyncExecute}
            isExecuting={isExecuting} isCancelling={isCancelling} disabled={disableExecute} />

          {/* 分隔符 - 只在两组按钮都存在时显示 */}
          {(asyncExecute || isExecuting) && (onFormat || save) && (
            <Separator orientation="vertical" className="mx-1 h-4" />
          )}

          {/* 格式化按钮 */}
          {onFormat && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="quiet" size="sm" onClick={onFormat} aria-label={t('query.sql.format')} disabled={isExecuting}>
                  <FileCode className="h-3.5 w-3.5" />
                  <span className="hidden @md:inline">
                    {t('query.sql.format', '格式化')}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('query.sql.formatTooltip', '格式化 SQL')}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* 收藏按钮 */}
          {save && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="quiet" size="sm" onClick={save} aria-label={t('query.bookmark.save')} disabled={isExecuting}>
                  <Star className="h-3.5 w-3.5" />
                  <span className="hidden @md:inline">
                    {t('query.bookmark.save', '收藏')}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('query.bookmark.saveTooltip', '收藏查询')}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
        {aiSlot}
      </div>

      {/* 右侧：状态信息 */}
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {/* 额外内容（状态指示器等） */}
        {extraContent}

        {/* 执行时间 */}
        {executionTime !== undefined && (
          <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{formatExecutionTime(executionTime)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SQLToolbar;
