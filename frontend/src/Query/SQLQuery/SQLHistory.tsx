/**
 * SQL 历史记录组件
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Trash2, Play, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { SQLHistoryItem } from './hooks/useSQLEditor';

export interface SQLHistoryProps {
  /** 历史记录列表 */
  history: SQLHistoryItem[];
  /** 加载历史项回调 */
  onLoad: (id: string) => void;
  /** 删除历史项回调 */
  onDelete: (id: string) => void;
  /** 清空历史回调 */
  onClear: () => void;
  /** 执行历史项回调 */
  onExecute?: (sql: string) => void;
  /** 触发器元素 */
  trigger?: React.ReactNode;
  /** 是否打开 */
  open?: boolean;
  /** 打开状态变化回调 */
  onOpenChange?: (open: boolean) => void;
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;
  
  // 小于 1 分钟
  if (diff < 60 * 1000) {
    return '刚刚';
  }
  
  // 小于 1 小时
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes} 分钟前`;
  }
  
  // 小于 24 小时
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours} 小时前`;
  }
  
  // 同一年
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  
  // 不同年
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * 截断 SQL 显示
 */
function truncateSQL(sql: string, maxLength: number = 100): string {
  const singleLine = sql.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return singleLine.substring(0, maxLength) + '...';
}

/**
 * SQL 历史记录组件
 */
export const SQLHistory: React.FC<SQLHistoryProps> = ({
  history,
  onLoad,
  onDelete,
  onClear,
  onExecute,
  trigger,
  open,
  onOpenChange,
}) => {
  const { t } = useTranslation('common');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('query.history.title', '查询历史')}
          </SheetTitle>
          <SheetDescription>
            {t('query.history.description', '最近执行的 SQL 查询记录')}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          {/* 操作栏 */}
          {history.length > 0 && (
            <div className="flex justify-end mb-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t('query.history.clearAll', '清空历史')}
              </Button>
            </div>
          )}

          {/* 历史列表 */}
          <ScrollArea className="h-[calc(100vh-200px)]">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mb-3 opacity-50" />
                <p>{t('query.history.empty', '暂无历史记录')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'group p-3 rounded-lg border border-border bg-surface hover:bg-surface-hover',
                      'transition-colors cursor-pointer',
                      item.error && 'border-error/50'
                    )}
                    onClick={() => onLoad(item.id)}
                  >
                    {/* SQL 预览 */}
                    <div className="font-mono text-sm text-foreground mb-2 line-clamp-2">
                      {truncateSQL(item.sql)}
                    </div>

                    {/* 元信息 */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-3">
                        {/* 状态图标 */}
                        {item.error ? (
                          <span className="flex items-center gap-1 text-error">
                            <AlertCircle className="h-3 w-3" />
                            {t('query.history.failed', '失败')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-success">
                            <CheckCircle className="h-3 w-3" />
                            {item.rowCount !== undefined && `${item.rowCount} 行`}
                          </span>
                        )}

                        {/* 执行时间 */}
                        {item.executionTime !== undefined && (
                          <span>{item.executionTime}ms</span>
                        )}

                        {/* 时间戳 */}
                        <span>{formatTimestamp(item.timestamp)}</span>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onExecute && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              onExecute(item.sql);
                            }}
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(item.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* 错误信息 */}
                    {item.error && (
                      <div className="mt-2 text-xs text-error line-clamp-1">
                        {item.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SQLHistory;
