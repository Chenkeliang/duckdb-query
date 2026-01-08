
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { listAsyncTasks } from '@/api';
import { invalidateAllDataCaches } from '@/new/utils/cacheInvalidation';
import { AsyncTask } from '@/new/Query/AsyncTasks/AsyncTaskPanel';

const ASYNC_TASKS_QUERY_KEY = ['async-tasks'] as const;

export function useAsyncTaskMonitor() {
    const { t } = useTranslation('common');
    const queryClient = useQueryClient();

    // 记录正在运行的任务ID
    const runningTaskIdsRef = useRef<Set<string>>(new Set());
    const isFirstLoadRef = useRef(true);

    const {
        data: tasks = [],
        isLoading,
    } = useQuery({
        queryKey: ASYNC_TASKS_QUERY_KEY,
        queryFn: async () => {
            const response = await listAsyncTasks({ limit: 50 }); // 增加 limit 以防止遗漏
            return (response.tasks || []) as unknown as AsyncTask[];
        },
        refetchInterval: 5000,
        staleTime: 2000,
    });

    useEffect(() => {
        if (isLoading) return;

        const currentRunningIds = new Set<string>();
        let hasCompletedTask = false;

        tasks.forEach((task) => {
            // 收集当前正在运行的任务
            if (['running', 'pending', 'cancelling'].includes(task.status)) {
                currentRunningIds.add(task.task_id);
            }

            // 检查是否有任务从运行变为完成
            if (!isFirstLoadRef.current) {
                if (task.status === 'completed' && runningTaskIdsRef.current.has(task.task_id)) {
                    hasCompletedTask = true;
                }
            }
        });

        runningTaskIdsRef.current = currentRunningIds;
        isFirstLoadRef.current = false;

        if (hasCompletedTask) {
            invalidateAllDataCaches(queryClient);
            toast.success(t('async.taskCompletedRefresh', '异步任务完成，已自动刷新数据源'));
        }
    }, [tasks, isLoading, queryClient, t]);
}
