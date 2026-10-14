/**
 * 异步任务面板组件
 * 显示异步任务列表和状态
 */

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  RefreshCw,
  Eye,
  MoreHorizontal,
  Loader2,
  StopCircle,
  Download,
  Database,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SQLHighlight } from '@/components/SQLHighlight';
import type { TableSource } from '@/types/queryWorkspace';
import { Input } from '@/components/ui/input';
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
import { listAsyncTasks, cancelAsyncTask, retryAsyncTask, getBackgroundQueryResult, executeDuckDBSQL, type QueryResponse } from '@/api';
import { invalidateAllDataCaches } from '@/utils/cacheInvalidation';
import { showSuccessToast, handleApiErrorToast } from '@/utils/toastHelpers';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useDuckDBTables } from '@/hooks/useDuckDBTables';
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
    result_kind?: string;
    available?: boolean;
    table_name?: string;
    row_count?: number;
    custom_table_name?: string;
    display_name?: string;
  };
  metadata?: { datasource?: { id: string; name?: string; type?: TableSource['databaseType'] }; attach_databases?: Array<{ alias: string; connection_id: string }>; original_started_at?: string; is_federated?: boolean; custom_table_name?: string };
}

export interface AsyncTaskPanelProps {
  active?: boolean;
  onClose?: () => void;
  /** 自定义类名 */
  className?: string;
  /** 任务完成回调 */
  onTaskComplete?: (task: AsyncTask) => void;
  onPreviewResult?: (response: QueryResponse, sql: string, source: TableSource) => void;
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

/** 是否联邦查询（SQL 带「联邦查询」注释标记） */
function isFederatedSQL(sql?: string): boolean {
  return !!sql && /联邦查询/.test(sql);
}

/** Resolve the persisted result table when historical metadata is sufficient. */
function getResultTableName(task: AsyncTask): string | undefined {
  const explicitName = task.result_info?.table_name || task.result_table;
  if (explicitName) return explicitName;

  const hasHistoricalCustomName = task.result_info?.custom_table_name
    || task.result_info?.display_name
    || task.custom_table_name
    || task.display_name
    || task.metadata?.custom_table_name;
  if (hasHistoricalCustomName) return undefined;

  return task.task_id ? `async_result_${task.task_id.replace(/-/g, '_')}` : undefined;
}

/** 状态圆点 + 文字 */
function StatusDot({ status }: { status: AsyncTask['status'] }) {
  const { t } = useTranslation('common');
  const meta: Record<string, { dot: string; text: string; label: string }> = {
    pending: { dot: 'bg-muted-foreground', text: 'text-muted-foreground', label: t('async.status.pending', '等待中') },
    running: { dot: 'bg-primary animate-pulse', text: 'text-primary-ink', label: t('async.status.running', '运行中') },
    completed: { dot: 'bg-success', text: 'text-success', label: t('async.status.completed', '已完成') },
    failed: { dot: 'bg-error', text: 'text-error', label: t('async.status.failed', '失败') },
    cancelled: { dot: 'bg-muted-foreground', text: 'text-muted-foreground', label: t('async.status.cancelled', '已取消') },
    cancelling: { dot: 'bg-warning animate-pulse', text: 'text-warning', label: t('async.status.cancelling', '取消中') },
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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
          >
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
  active = true,
  onClose,
  onTaskComplete: _onTaskComplete,
  onPreviewResult,
}) => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const { maxQueryRows } = useAppConfig();
  const {
    tables: duckDBTables,
    isLoading: isLoadingDuckDBTables,
    isError: isDuckDBTablesError,
  } = useDuckDBTables();

  // 下载对话框状态
  const previewRequest = useRef(0);
  const [previewingTaskId, setPreviewingTaskId] = useState<string | null>(null);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [selectedTaskForDownload, setSelectedTaskForDownload] = useState<AsyncTask | null>(null);
  const [resubmittedTaskIds, setResubmittedTaskIds] = useState<Set<string>>(() => new Set());

  useLayoutEffect(() => {
    if (!active) setPreviewingTaskId(null);
    return () => { previewRequest.current += 1; };
  }, [active]);

  // 分页（前端分页，数据本来就一次拉全）
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
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
      const response = await listAsyncTasks({ limit: 50 });
      return (response.tasks || []) as unknown as AsyncTask[];
    },
    refetchInterval: 5000, // 每 5 秒自动刷新
    staleTime: 2000,
  });

  // 取消任务
  const cancelMutation = useMutation({
    mutationFn: cancelAsyncTask,
    onSuccess: () => {
      showSuccessToast(t, undefined, t('async.cancelRequested', '已提交取消请求'));
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
    onError: (error: Error, taskId: string) => {
      setResubmittedTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      handleApiErrorToast(t, error, t('async.retryFailed', '重试失败'));
    },
  });

  const handleRetry = useCallback((taskId: string) => {
    if (resubmittedTaskIds.has(taskId)) return;
    setResubmittedTaskIds((current) => new Set(current).add(taskId));
    retryMutation.mutate(taskId);
  }, [resubmittedTaskIds, retryMutation]);

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

  const handlePreview = useCallback(async (task: AsyncTask) => {
    if (!active || !onPreviewResult || previewingTaskId) return;
    const request = ++previewRequest.current;
    const isSnapshot = task.result_info?.result_kind === 'snapshot';
    const table = getResultTableName(task);
    if (!isSnapshot && !table) return;
    setPreviewingTaskId(task.task_id);
    try {
      const result = await queryClient.fetchQuery({
        queryKey: ['async-task-result', task.task_id, maxQueryRows],
        staleTime: 0,
        queryFn: () => isSnapshot
          ? getBackgroundQueryResult(task.task_id)
          : executeDuckDBSQL({ sql: `SELECT * FROM ${quoteDuckDBTable(table!)} LIMIT ${maxQueryRows}`, isPreview: true }),
      });
      if (request !== previewRequest.current) return;
      const attachments = task.metadata?.attach_databases ?? [];
      const source: TableSource = attachments.length
        ? { type: 'federated', connectionId: attachments[0].connection_id, connectionName: attachments[0].alias,
          attachDatabases: attachments.map((item) => ({ alias: item.alias, connectionId: item.connection_id })) }
        : { type: 'duckdb' };
      const datasource = task.metadata?.datasource;
      if (datasource && source.type === 'federated') {
        source.connectionId = datasource.id;
        source.connectionName = datasource.name || source.connectionName;
        source.databaseType = datasource.type;
      }
      onPreviewResult(result, task.sql || (table ? `SELECT * FROM ${quoteDuckDBTable(table)}` : ''), source);
    } catch (error) {
      if (request === previewRequest.current) handleApiErrorToast(t, error as Error);
    } finally {
      if (request === previewRequest.current) setPreviewingTaskId(null);
    }
  }, [active, onPreviewResult, previewingTaskId, queryClient, maxQueryRows, t]);

  // 处理下载
  const handleDownload = useCallback((task: AsyncTask) => {
    setSelectedTaskForDownload(task);
    setDownloadDialogOpen(true);
  }, []);

  // 获取任务显示名称
  const getTaskDisplayName = useCallback((task: AsyncTask): string => {
    // 优先使用 display_name，其次是 custom_table_name，最后是 result_table
    if (task.task_type === 'foreground_query' || task.result_info?.result_kind === 'snapshot') return t(task.result_info?.available === false ? 'async.snapshotMissing' : 'async.snapshot');
    return task.result_info?.display_name
      || task.result_info?.custom_table_name
      || task.display_name
      || task.custom_table_name
      || task.result_info?.table_name
      || task.result_table
      || '';
  }, [t]);

  // 获取任务行数
  const getTaskRowCount = useCallback((task: AsyncTask): number | undefined => {
    return task.result_info?.row_count ?? task.row_count;
  }, []);

  // 行内操作按钮
  const renderActions = (task: AsyncTask) => {
    const isSnapshot = task.result_info?.result_kind === 'snapshot';
    const resultTableName = isSnapshot ? undefined : getResultTableName(task);
    const catalogCheckable = !!resultTableName
      && !resultTableName.toLowerCase().startsWith('system_');
    const availabilityKnown = !isLoadingDuckDBTables
      && !isDuckDBTablesError
      && catalogCheckable;
    const resultMissing = task.status === 'completed'
      && (isSnapshot ? task.result_info?.available === false
        : availabilityKnown && !duckDBTables.some((table) => table.name === resultTableName));
    const resultUsable = task.status === 'completed'
      && (isSnapshot || !isLoadingDuckDBTables)
      && !resultMissing;
    const previewUsable = resultUsable && (isSnapshot ? !!onPreviewResult : !!resultTableName);

    return (
      <div className="flex items-center justify-end gap-0.5">
        {onPreviewResult && previewUsable && (
          <Button variant="subtle" size="sm" className="h-7 gap-1.5 text-xs" disabled={previewingTaskId !== null} onClick={() => void handlePreview(task)}>
            {previewingTaskId === task.task_id ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
            {t('async.previewResult', '预览结果')}
          </Button>
        )}
        {resultUsable && !isSnapshot && (
          <ActionBtn icon={Download} label={t('async.downloadBtn', '下载')} onClick={() => handleDownload(task)} />
        )}
        {(task.status === 'pending' || task.status === 'running') && (
          <ActionBtn icon={StopCircle} label={t('async.cancel', '取消')} onClick={() => handleCancel(task.task_id)} disabled={cancelMutation.isPending} />
        )}
        {(task.status === 'failed' || resultMissing) && (
          <ActionBtn
            icon={RefreshCw}
            label={resultMissing ? t('async.rerun', '重新运行') : t('async.retry', '重试')}
            onClick={() => handleRetry(task.task_id)}
            disabled={retryMutation.isPending || resubmittedTaskIds.has(task.task_id)}
          />
        )}
      </div>
    );
  };

  // 分页计算
  const filteredTasks = tasks.filter((task) =>
    (statusFilter === 'all' || (statusFilter === 'running' ? ['pending', 'running', 'cancelling'].includes(task.status) : task.status === statusFilter))
    && `${task.sql || ''} ${getTaskDisplayName(task)}`.toLowerCase().includes(search.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedTasks = filteredTasks.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <header className="shrink-0 space-y-3 border-b border-border p-4">
        <div className="flex items-center justify-between gap-3" data-aligned-row>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t('async.panelTitle')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('async.panelSummary', {
              running: tasks.filter((task) => ['pending', 'running', 'cancelling'].includes(task.status)).length,
              completed: tasks.filter((task) => task.status === 'completed').length,
            })}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="quiet" size="icon" className="h-7 w-7" onClick={handleRefresh} disabled={isLoading} aria-label={t('actions.refresh')} title={t('actions.refresh')}>
              <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
            </Button>
            {onClose && <Button variant="quiet" size="icon" className="h-7 w-7" onClick={onClose} aria-label={t('common.close')}><X className="size-4" /></Button>}
          </div>
        </div>
        <div className="flex items-center gap-2" data-aligned-row>
          <Input className="h-7 min-w-0 flex-1 text-xs" aria-label={t('async.search')} placeholder={t('async.search')} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          <select className="h-7 w-28 shrink-0 rounded-md border border-border bg-input px-2 text-xs" aria-label={t('async.statusLabel')} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
            {['all', 'running', 'completed', 'failed', 'cancelled'].map((status) => <option key={status} value={status}>{t(`async.filter.${status}`)}</option>)}
          </select>
        </div>
      </header>
      {/* Compact rows keep primary actions visible without horizontal scrolling. */}
      <ScrollArea className="min-h-0 flex-1">
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
        ) : filteredTasks.length === 0 ? (
          <EmptyState icon={Clock} title={tasks.length === 0 ? t('async.empty', '暂无异步任务') : t('async.noMatches')} />
        ) : (
          <div className="divide-y divide-border">
            {pagedTasks.map((task) => {
              const fed = task.metadata?.is_federated ?? isFederatedSQL(task.sql);
              const rowCount = getTaskRowCount(task);
              const displayName = getTaskDisplayName(task) || task.task_id;
              return <article key={task.task_id} className="min-w-0 space-y-2 px-4 py-3" aria-label={displayName}>
                <div className="flex h-7 min-w-0 items-center justify-between gap-3" data-aligned-row>
                  <div className="flex min-w-0 items-center gap-2 text-xs" title={displayName}>
                    <Database className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono">{displayName}</span>
                  </div>
                  <div className="shrink-0"><StatusDot status={task.status} /></div>
                </div>
                <div className="flex min-h-7 items-center justify-between gap-2" data-aligned-row>
                  <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{fed ? t('async.typeFederated', '联邦') : t('async.typeLocal', '本地')}</span>
                    <span className="truncate tabular-nums">{task.started_at ? formatDuration(task.metadata?.original_started_at || task.started_at, task.completed_at) : formatTime(task.created_at)}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {renderActions(task)}
                    <Popover>
                      <PopoverTrigger asChild><Button variant="quiet" size="icon" className="h-7 w-7" aria-label={t('async.taskDetails')}><MoreHorizontal className="size-4" /></Button></PopoverTrigger>
                      <PopoverContent side="bottom" align="end" className="w-80 max-w-full space-y-3">
                        <div className="flex h-7 items-center justify-between gap-2" data-aligned-row>
                          <span className="text-xs font-medium">{t('async.taskDetails')}</span>
                          <Button variant="quiet" size="sm" className="h-7" disabled={!task.sql} onClick={() => {
                            void navigator.clipboard.writeText(task.sql || '').then(() => showSuccessToast(t, undefined, t('common.copied'))).catch((error: Error) => handleApiErrorToast(t, error));
                          }}>{t('common.copy')}</Button>
                        </div>
                        <dl className="grid grid-cols-2 gap-2 text-xs">
                          <dt className="text-muted-foreground">{t('async.rows')}</dt><dd className="text-right tabular-nums">{rowCount?.toLocaleString() ?? '—'}</dd>
                          <dt className="text-muted-foreground">{t('async.time')}</dt><dd className="text-right">{formatTime(task.created_at)}</dd>
                          <dt className="text-muted-foreground">{t('async.type')}</dt><dd className="text-right">{fed ? t('async.typeFederated', '联邦') : t('async.typeLocal', '本地')}</dd>
                        </dl>
                        {task.error && <p className="break-words text-xs text-error">{task.error}</p>}
                        {task.sql && <SQLHighlight sql={task.sql} minHeight="4rem" maxHeight="20rem" scrollable />}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </article>;
            })}
          </div>
        )}
      </ScrollArea>

      {/* 分页 */}
      {tasks.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>
            {t('async.totalCount', { count: filteredTasks.length, defaultValue: '共 {{count}} 条' })}
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
              variant="quiet"
              size="icon"
              className="h-7 w-7"
              aria-label={t('actions.previousPage')}
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="quiet"
              size="icon"
              className="h-7 w-7"
              aria-label={t('actions.nextPage')}
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
