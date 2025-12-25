/**
 * 异步任务面板组件
 * 显示异步任务列表和状态
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Play,
  StopCircle,
  Download,
  Database,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/new/components/ui/button';
import { Badge } from '@/new/components/ui/badge';
import { ScrollArea } from '@/new/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/new/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/new/components/ui/tooltip';
import { listAsyncTasks, cancelAsyncTask, retryAsyncTask } from '@/services/apiClient';
import { invalidateAllDataCaches } from '@/new/utils/cacheInvalidation';
import { useAppConfig } from '@/new/hooks/useAppConfig';
import { cn } from '@/lib/utils';
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

/**
 * 状态徽章
 */
function StatusBadge({ status }: { status: AsyncTask['status'] }) {
  const { t } = useTranslation('common');

  const config = {
    pending: { icon: Clock, variant: 'outline' as const, label: t('async.status.pending', '等待中') },
    running: { icon: Loader2, variant: 'default' as const, label: t('async.status.running', '运行中') },
    completed: { icon: CheckCircle, variant: 'success' as const, label: t('async.status.completed', '已完成') },
    failed: { icon: XCircle, variant: 'error' as const, label: t('async.status.failed', '失败') },
    cancelled: { icon: StopCircle, variant: 'outline' as const, label: t('async.status.cancelled', '已取消') },
    cancelling: { icon: Loader2, variant: 'outline' as const, label: t('async.status.cancelling', '取消中') },
  };

  const { icon: Icon, variant, label } = config[status] || config.pending;

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      {label}
    </Badge>
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

  // 获取任务列表
  const {
    data: tasks = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ASYNC_TASKS_QUERY_KEY,
    queryFn: async () => {
      const response = await listAsyncTasks();
      return (response.tasks || []) as AsyncTask[];
    },
    refetchInterval: 5000, // 每 5 秒自动刷新
    staleTime: 2000,
  });

  // 取消任务
  const cancelMutation = useMutation({
    mutationFn: cancelAsyncTask,
    onSuccess: () => {
      toast.success(t('async.cancelSuccess', '任务已取消'));
      queryClient.invalidateQueries({ queryKey: ASYNC_TASKS_QUERY_KEY });
    },
    onError: (error: Error) => {
      toast.error(t('async.cancelFailed', '取消失败: {{message}}', { message: error.message }));
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
      toast.success(t('async.retrySuccess', '任务已重试'));
      queryClient.invalidateQueries({ queryKey: ASYNC_TASKS_QUERY_KEY });
    },
    onError: (error: Error) => {
      toast.error(t('async.retryFailed', '重试失败: {{message}}', { message: error.message }));
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

  // 截断 SQL 显示
  const truncateSQL = (sql: string, maxLength: number = 50): string => {
    const singleLine = sql.replace(/\s+/g, ' ').trim();
    if (singleLine.length <= maxLength) return singleLine;
    return singleLine.substring(0, maxLength) + '...';
  };

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
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Clock className="h-10 w-10 mb-3 opacity-50" />
            <p>{t('async.empty', '暂无异步任务')}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">{t('async.status', '状态')}</TableHead>
                <TableHead>{t('async.sql', 'SQL')}</TableHead>
                <TableHead className="w-[140px]">{t('async.tableName', '结果表')}</TableHead>
                <TableHead className="w-[100px]">{t('async.time', '时间')}</TableHead>
                <TableHead className="w-[80px]">{t('async.rows', '行数')}</TableHead>
                <TableHead className="w-[120px] text-right">{t('async.actions', '操作')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.task_id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={task.status} />
                      {task.task_type && task.task_type !== 'query' && (
                        <Badge variant="outline" className="text-xs w-fit">
                          {task.task_type}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-mono text-xs cursor-help">
                            {task.sql ? truncateSQL(task.sql) : '-'}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md">
                          <pre className="text-xs whitespace-pre-wrap">{task.sql}</pre>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>
                    {getTaskDisplayName(task) ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-mono text-xs flex items-center gap-1 cursor-help">
                              <Database className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate max-w-[100px]">
                                {getTaskDisplayName(task)}
                              </span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span className="font-mono text-xs">{getTaskDisplayName(task)}</span>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {task.started_at ? (
                      formatDuration(task.started_at, task.completed_at)
                    ) : (
                      formatTime(task.created_at)
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {getTaskRowCount(task) !== undefined ? getTaskRowCount(task)!.toLocaleString() : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* 预览结果（已完成） */}
                      {onPreviewSQL && task.status === 'completed' && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handlePreview(task)}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('async.previewResult', '预览结果')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* 下载按钮（已完成） */}
                      {task.status === 'completed' && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleDownload(task)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('async.download', '下载')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* 取消按钮 */}
                      {(task.status === 'pending' || task.status === 'running') && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleCancel(task.task_id)}
                                disabled={cancelMutation.isPending}
                              >
                                <StopCircle className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('async.cancel', '取消')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* 重试按钮 */}
                      {task.status === 'failed' && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleRetry(task.task_id)}
                                disabled={retryMutation.isPending}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('async.retry', '重试')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ScrollArea>

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
