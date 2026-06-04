/**
 * 异步任务面板组件
 * 显示异步任务列表和状态
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  RefreshCw,
  Play,
  StopCircle,
  Download,
  Database,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SQLHighlight } from '@/components/SQLHighlight';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { listAsyncTasks, cancelAsyncTask, retryAsyncTask } from '@/api';
import { invalidateAllDataCaches } from '@/utils/cacheInvalidation';
import { showSuccessToast, handleApiErrorToast } from '@/utils/toastHelpers';
import { useAppConfig } from '@/hooks/useAppConfig';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { DownloadResultDialog } from './DownloadResultDialog';

export interface AsyncTask {
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling';
  task_type?: string;
  sql?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  result_table?: string;
  row_count?: number;
  progress?: number;
  custom_table_name?: string;
  display_name?: string;
  result_info?: {
    table_name?: string;
    row_count?: number;
    custom_table_name?: string;
    display_name?: string;
  };
}

export interface AsyncTaskPanelProps {
  /** 自定义类名 */
  className?: string;
  /** 任务完成回调 */
  onTaskComplete?: (task: AsyncTask) => void;
  /** 预览某个任务的结果（将生成 SQL 并回传） */
  onPreviewSQL?: (sql: string) => void;
}

// 查询 key
const ASYNC_TASKS_QUERY_KEY = ['async-tasks'] as const;

/**
 * 格式化时间
 */
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 格式化持续时间
 */
function formatDuration(startTime: string, endTime?: string): string {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const duration = end - start;

  if (duration < 1000) return `${duration}ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
  return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;
}

/** SQL 关键字（行内轻量高亮） */
const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL',
  'CROSS', 'ON', 'USING', 'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT', 'OFFSET',
  'UNION', 'ALL', 'DISTINCT', 'AS', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'INSERT',
  'INTO', 'UPDATE', 'SET', 'DELETE', 'VALUES', 'WITH', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'DESC', 'ASC',
]);

/** 是否联邦查询（SQL 带「联邦查询」注释标记） */
function isFederatedSQL(sql?: string): boolean {
  return !!sql && /联邦查询/.test(sql);
}

/** 去掉开头的 -- 注释行并压成单行 */
function cleanSQL(sql: string): string {
  return sql.replace(/^\s*(?:--[^\n]*\n?)+/, '').replace(/\s+/g, ' ').trim();
}

/** 行内 SQL 关键字高亮 */
function renderSQLInline(sql: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /[A-Za-z_][A-Za-z0-9_]*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(sql)) !== null) {
    if (m.index > last) out.push(sql.slice(last, m.index));
    const word = m[0];
    if (SQL_KEYWORDS.has(word.toUpperCase())) {
      out.push(
        <span key={i++} className="text-blue-600 dark:text-blue-400">{word}</span>
      );
    } else {
      out.push(word);
    }
    last = m.index + word.length;
  }
  if (last < sql.length) out.push(sql.slice(last));
  return out;
}

/** 状态圆点 + 文字 */
function StatusDot({ status }: { status: AsyncTask['status'] }) {
  const { t } = useTranslation('common');
  const meta: Record<string, { dot: string; text: string; label: string }> = {
    pending: { dot: 'bg-muted-foreground', text: 'text-muted-foreground', label: t('async.status.pending', '等待中') },
    running: { dot: 'bg-blue-500 animate-pulse', text: 'text-blue-600 dark:text-blue-400', label: t('async.status.running', '运行中') },
    completed: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', label: t('async.status.completed', '已完成') },
    failed: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', label: t('async.status.failed', '失败') },
    cancelled: { dot: 'bg-muted-foreground', text: 'text-muted-foreground', label: t('async.status.cancelled', '已取消') },
    cancelling: { dot: 'bg-amber-500 animate-pulse', text: 'text-amber-600 dark:text-amber-400', label: t('async.status.cancelling', '取消中') },
  };
  const m = meta[status] || meta.pending;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', m.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}

/** 操作图标按钮 */
function ActionBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClick} disabled={disabled}>
            <Icon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * 异步任务面板组件
 */
export const AsyncTaskPanel: React.FC<AsyncTaskPanelProps> = ({
  className,
  onTaskComplete: _onTaskComplete,
  onPreviewSQL,
}) => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const { maxQueryRows } = useAppConfig();

  // 下载对话框状态
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [selectedTaskForDownload, setSelectedTaskForDownload] = useState<AsyncTask | null>(null);

  // 分页（前端分页，数据本来就一次拉全）
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // 获取任务列表
  const {
    data: tasks = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ASYNC_TASKS_QUERY_KEY,
    queryFn: async () => {
      const response = await listAsyncTasks();
      return (response.tasks || []) as unknown as AsyncTask[];
    },
    refetchInterval: 5000, // 每 5 秒自动刷新
    staleTime: 2000,
  });

  // 取消任务
  const cancelMutation = useMutation({
    mutationFn: cancelAsyncTask,
    onSuccess: () => {
      showSuccessToast(t, 'TASK_CANCELLED', t('async.cancelSuccess', '任务已取消'));
      queryClient.invalidateQueries({ queryKey: ASYNC_TASKS_QUERY_KEY });
    },
    onError: (error: Error) => {
      handleApiErrorToast(t, error, t('async.cancelFailed', '取消失败'));
    },
  });

  // 处理取消
  const handleCancel = useCallback((taskId: string) => {
    cancelMutation.mutate(taskId);
  }, [cancelMutation]);

  // 处理重试
  const retryMutation = useMutation({
    mutationFn: (taskId: string) => retryAsyncTask(taskId, {}),
    onSuccess: () => {
      showSuccessToast(t, 'TASK_RETRY_SUCCESS', t('async.retrySuccess', '任务已重试'));
      queryClient.invalidateQueries({ queryKey: ASYNC_TASKS_QUERY_KEY });
    },
    onError: (error: Error) => {
      handleApiErrorToast(t, error, t('async.retryFailed', '重试失败'));
    },
  });

  const handleRetry = useCallback((taskId: string) => {
    retryMutation.mutate(taskId);
  }, [retryMutation]);

  // 处理刷新
  const handleRefresh = useCallback(() => {
    refetch();
    invalidateAllDataCaches(queryClient);
  }, [refetch, queryClient]);

  const quoteDuckDBIdentifier = (value: string): string => {
    return `"${value.replace(/"/g, '""')}"`;
  };

  const quoteDuckDBTable = (tableName: string): string => {
    return tableName
      .split('.')
      .filter(Boolean)
      .map(quoteDuckDBIdentifier)
      .join('.');
  };

  const handlePreview = useCallback((task: AsyncTask) => {
    if (!onPreviewSQL) return;
    const table = task.result_info?.table_name || task.result_table || `async_result_${task.task_id}`;
    const sql = `SELECT * FROM ${quoteDuckDBTable(table)} LIMIT ${maxQueryRows}`;
    onPreviewSQL(sql);
  }, [onPreviewSQL]);

  // 处理下载
  const handleDownload = useCallback((task: AsyncTask) => {
    setSelectedTaskForDownload(task);
    setDownloadDialogOpen(true);
  }, []);

  // 获取任务显示名称
  const getTaskDisplayName = useCallback((task: AsyncTask): string => {
    // 优先使用 display_name，其次是 custom_table_name，最后是 result_table
    return task.result_info?.display_name
      || task.result_info?.custom_table_name
      || task.display_name
      || task.custom_table_name
      || task.result_info?.table_name
      || task.result_table
      || '';
  }, []);

  // 获取任务行数
  const getTaskRowCount = useCallback((task: AsyncTask): number | undefined => {
    return task.result_info?.row_count ?? task.row_count;
  }, []);

  // 行内操作按钮
  const renderActions = (task: AsyncTask) => (
    <div className="flex items-center justify-end gap-0.5">
      {onPreviewSQL && task.status === 'completed' && (
        <ActionBtn icon={Play} label={t('async.previewResult', '预览结果')} onClick={() => handlePreview(task)} />
      )}
      {task.status === 'completed' && (
        <ActionBtn icon={Download} label={t('async.downloadBtn', '下载')} onClick={() => handleDownload(task)} />
      )}
      {(task.status === 'pending' || task.status === 'running') && (
        <ActionBtn icon={StopCircle} label={t('async.cancel', '取消')} onClick={() => handleCancel(task.task_id)} disabled={cancelMutation.isPending} />
      )}
      {task.status === 'failed' && (
        <ActionBtn icon={RefreshCw} label={t('async.retry', '重试')} onClick={() => handleRetry(task.task_id)} disabled={retryMutation.isPending} />
      )}
    </div>
  );

  // 分页计算
  const pageCount = Math.max(1, Math.ceil(tasks.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedTasks = tasks.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <h3 className="text-sm font-medium">
          {t('async.title', '异步任务')}
          {tasks.length > 0 && (
            <span className="ml-2 text-muted-foreground">({tasks.length})</span>
          )}
        </h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('actions.refresh', '刷新')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* 任务列表 */}
      <ScrollArea className="flex-1">
        {isLoading && tasks.length === 0 ? (
          <div className="space-y-2.5 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState icon={Clock} title={t('async.empty', '暂无异步任务')} />
        ) : (
          <table className="dq-grid-table">
            <thead>
              <tr>
                <th className="w-16">{t('async.type', '类型')}</th>
                <th>{t('async.sql', 'SQL')}</th>
                <th className="w-[150px]">{t('async.tableName', '结果表')}</th>
                <th className="w-20 text-right">{t('async.time', '时间')}</th>
                <th className="w-20 text-right">{t('async.rows', '行数')}</th>
                <th className="w-24">{t('async.status', '状态')}</th>
                <th className="w-24 text-right">{t('async.actions', '操作')}</th>
              </tr>
            </thead>
            <tbody>
              {pagedTasks.map((task) => {
                const fed = isFederatedSQL(task.sql);
                const rowCount = getTaskRowCount(task);
                const displayName = getTaskDisplayName(task);
                return (
                  <tr key={task.task_id}>
                    {/* 类型 */}
                    <td>
                      {fed ? (
                        <span className="inline-block rounded-md border border-sky-500/30 bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-300">
                          {t('async.typeFederated', '联邦')}
                        </span>
                      ) : (
                        <span className="inline-block rounded-md border border-[var(--dg-border-color)] bg-[var(--dg-header-background)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--dg-header-foreground)]">
                          {t('async.typeLocal', '本地')}
                        </span>
                      )}
                    </td>
                    {/* SQL */}
                    <td>
                      {task.sql ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <span className="block max-w-[420px] cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs hover:underline">
                              {renderSQLInline(cleanSQL(task.sql))}
                            </span>
                          </PopoverTrigger>
                          <PopoverContent
                            side="bottom"
                            align="start"
                            className="w-[480px] max-w-[90vw] max-h-(--radix-popover-content-available-height) p-2"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">SQL</span>
                              <button
                                className="text-xs text-primary hover:underline"
                                onClick={() => {
                                  navigator.clipboard.writeText(task.sql!);
                                  showSuccessToast(t, undefined, t('common.copied', '已复制'));
                                }}
                              >
                                {t('common.copy', '复制')}
                              </button>
                            </div>
                            <SQLHighlight
                              sql={task.sql}
                              minHeight="4rem"
                              maxHeight="24rem"
                              scrollable
                              className="border-0 rounded-md min-w-[280px]"
                            />
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    {/* 结果表 */}
                    <td>
                      {displayName ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-xs flex items-center gap-1 cursor-help">
                                <Database className="h-3 w-3 text-muted-foreground" />
                                <span className="truncate max-w-[120px]">{displayName}</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <span className="font-mono text-xs">{displayName}</span>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    {/* 时间 */}
                    <td className="text-right text-xs text-muted-foreground tabular-nums">
                      {task.started_at
                        ? formatDuration(task.started_at, task.completed_at)
                        : formatTime(task.created_at)}
                    </td>
                    {/* 行数 */}
                    <td className="text-right text-xs tabular-nums">
                      {rowCount !== undefined ? rowCount.toLocaleString() : '-'}
                    </td>
                    {/* 状态 */}
                    <td>
                      <StatusDot status={task.status} />
                    </td>
                    {/* 操作 */}
                    <td className="text-right">{renderActions(task)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </ScrollArea>

      {/* 分页 */}
      {tasks.length > 0 && (
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground">
          <span>
            {t('async.totalCount', { count: tasks.length, defaultValue: '共 {{count}} 条' })}
            <span className="mx-1.5 opacity-40">·</span>
            <span className="tabular-nums">{safePage} / {pageCount}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <span className="mr-1">{t('async.perPage', '每页')}</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-7 rounded-md border border-border bg-transparent px-1.5 text-xs"
            >
              {[15, 30, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 下载结果对话框 */}
      {selectedTaskForDownload && (
        <DownloadResultDialog
          open={downloadDialogOpen}
          onOpenChange={setDownloadDialogOpen}
          taskId={selectedTaskForDownload.task_id}
          tableName={getTaskDisplayName(selectedTaskForDownload)}
          rowCount={getTaskRowCount(selectedTaskForDownload)}
        />
      )}
    </div>
  );
};

export default AsyncTaskPanel;
