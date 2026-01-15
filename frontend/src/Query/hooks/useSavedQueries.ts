import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    listSqlFavorites,
    createSqlFavorite,
    deleteSqlFavorite,
    incrementFavoriteUsage
} from '@/api';

/**
 * SQL 收藏夹 Hook
 * 符合 TanStack Query 使用规范
 */

export const SAVED_QUERIES_QUERY_KEY = ['sql-favorites'] as const;

export interface SavedQuery {
    id: string;
    name: string;
    sql: string;
    type: string;
    description?: string;
    tags?: string[];
    created_at: string;
    updated_at: string;
    usage_count: number;
}

export const useSavedQueries = () => {
    const queryClient = useQueryClient();

    // 查询收藏列表
    const query = useQuery({
        queryKey: SAVED_QUERIES_QUERY_KEY,
        queryFn: listSqlFavorites,
        staleTime: 5 * 60 * 1000, // 5 分钟
        refetchOnWindowFocus: true,
    });

    const favorites = (Array.isArray(query.data) ? query.data : []) as SavedQuery[];

    // 刷新方法
    const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_QUERY_KEY });
        return query.refetch();
    };

    // 创建收藏 Mutation
    const createMutation = useMutation({
        mutationFn: createSqlFavorite,
        onSuccess: () => {
            toast.success('收藏成功');
            queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_QUERY_KEY });
        },
        onError: (error: Error) => {
            toast.error('收藏失败: ' + error.message);
        }
    });

    // 删除收藏 Mutation
    const deleteMutation = useMutation({
        mutationFn: deleteSqlFavorite,
        onSuccess: () => {
            toast.success('已删除收藏');
            queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_QUERY_KEY });
        },
        onError: (error: Error) => {
            toast.error('删除失败: ' + error.message);
        }
    });

    // 使用收藏 Mutation (增加计数)
    const useMutationReq = useMutation({
        mutationFn: incrementFavoriteUsage,
        onSuccess: () => {
            // 静默刷新列表以更新计数
            queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_QUERY_KEY });
        }
    });

    return {
        favorites,
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
        refresh,
        saveQuery: createMutation.mutateAsync,
        isSaving: createMutation.isPending,
        deleteQuery: deleteMutation.mutateAsync,
        isDeleting: deleteMutation.isPending,
        useQuery: useMutationReq.mutateAsync,
    };
};
