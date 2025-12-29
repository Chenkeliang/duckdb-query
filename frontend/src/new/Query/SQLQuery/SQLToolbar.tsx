/**
 * SQL 编辑器工具栏组件
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2, Save, FileCode, History, Clock, Timer, StopCircle } from 'lucide-react';
import { Button } from '@/new/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/new/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
  /** 历史记录回调 */
  onHistory?: () => void;
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
  /** 自定义类名 */
  className?: string;
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
  onHistory,
  isExecuting = false,
  isCancelling = false,
  disableExecute = false,
  executionTime,
  extraContent,
  className,
}) => {
  const { t } = useTranslation('common');

  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30',
        className
      )}
    >
      {/* 左侧：主要操作 */}
      <div className="flex items-center gap-2">
        <TooltipProvider>
          {/* 执行按钮 - 执行时变为取消按钮 */}
          {isExecuting && onCancel ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onCancel}
                  disabled={isCancelling}
                  className="gap-1.5"
                >
                  {isCancelling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <StopCircle className="h-4 w-4" />
                  )}
                  <span>{t('query.sql.cancel', '取消')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('query.sql.cancelTooltip', '取消当前查询')}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  onClick={onExecute}
                  disabled={disableExecute || isExecuting}
                  className="gap-1.5"
                >
                  {isExecuting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span>{t('query.sql.execute', '执行')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Ctrl+Enter / Cmd+Enter</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* 异步执行按钮 */}
          {onAsyncExecute && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAsyncExecute}
                  disabled={disableExecute || isExecuting}
                  className="gap-1.5"
                >
                  <Timer className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {t('query.sql.asyncExecute', '异步执行')}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Ctrl+Shift+Enter / Cmd+Shift+Enter</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('query.sql.asyncExecuteHint', '后台执行，结果保存到表')}
                </p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* 格式化按钮 */}
          {onFormat && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onFormat}
                  disabled={isExecuting}
                >
                  <FileCode className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">
                    {t('query.sql.format', '格式化')}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('query.sql.formatTooltip', '格式化 SQL')}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* 保存按钮 */}
          {onSave && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSave}
                  disabled={isExecuting}
                >
                  <Save className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">
                    {t('query.sql.save', '保存')}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('query.sql.saveTooltip', '保存查询')}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>

      {/* 右侧：状态信息和历史 */}
      <div className="flex items-center gap-3">
        {/* 额外内容（状态指示器等） */}
        {extraContent}

        {/* 执行时间 */}
        {executionTime !== undefined && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{formatExecutionTime(executionTime)}</span>
          </div>
        )}

        {/* 历史记录按钮 */}
        {onHistory && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onHistory}
                  className="h-8 px-2"
                >
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('query.sql.history', '查询历史')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
};

export default SQLToolbar;
