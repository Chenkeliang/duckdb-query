import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Trash2, Play, Search, Calendar, Hash, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/ui/input';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { SQLSnippet } from '@/components/SQLSnippet';
import { useSavedQueries, SavedQuery } from '../hooks/useSavedQueries';
import { extractJoinWorkspaceFromSql } from '@/Query/JoinQuery/joinWorkspaceSnapshot';

export interface SavedQueriesPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onLoad: (sql: string, type: string) => void;
}

function formatDate(dateStr: string, locale: string): string {
    try {
        // Backend incorrectly appends "Z" to local time, so we need to strip it
        const cleanedDateStr = dateStr.endsWith('Z') ? dateStr.slice(0, -1) : dateStr;
        const date = new Date(cleanedDateStr);
        return date.toLocaleDateString(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

const TypeBadge = ({ type }: { type: string }) => {
    const { t } = useTranslation('common');
    const labels: Record<string, string> = {
        duckdb: 'DuckDB', mysql: 'MySQL', postgresql: 'PostgreSQL', sqlite: 'SQLite',
        sql: t('query.tabs.sql'), join: t('query.tabs.join'), set: t('query.tabs.set'), pivot: t('query.tabs.pivot'),
    };
    return (
        <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 py-0 font-normal text-muted-foreground">
            {labels[type] || type}
        </Badge>
    );
};

export const SavedQueriesPanel: React.FC<SavedQueriesPanelProps> = ({
    open,
    onOpenChange,
    onLoad,
}) => {
    const { t, i18n } = useTranslation('common');
    const { favorites, isLoading, deleteQuery, markQueryUsed, refresh } = useSavedQueries();
    const [search, setSearch] = useState('');

    // 打开时刷新列表
    React.useEffect(() => {
        if (open) {
            refresh();
        }
    }, [open, refresh]);

    const filteredFavorites = React.useMemo(() => {
        // Sort by created_at descending (newest first)
        const sorted = [...favorites].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        if (!search.trim()) return sorted;

        const lowerSearch = search.toLowerCase();
        return sorted.filter(fav =>
            fav.name.toLowerCase().includes(lowerSearch) ||
            fav.sql.toLowerCase().includes(lowerSearch)
        );
    }, [favorites, search]);

    // Helper to localize SQL comments
    const formatSqlPreview = (sql: string) => {
        const { sql: withoutWorkspace } = extractJoinWorkspaceFromSql(sql);
        return withoutWorkspace.replace(
            /-- 联邦查询:/g,
            `-- ${t('query.sql.federatedQuery', '联邦查询')}:`
        );
    };

    const handleLoad = (item: SavedQuery) => {
        void markQueryUsed(item.id);
        onLoad(item.sql, item.type);
        onOpenChange(false);
    };

    const handleDelete = async (id: string) => {
        if (confirm(t('query.bookmark.confirmDelete', '确定要删除这个收藏吗？'))) {
            await deleteQuery(id);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
                <SheetHeader className="border-b border-border px-5 py-4 text-left">
                    <SheetTitle className="flex items-center gap-2 text-base">
                        <Star className="size-4 text-muted-foreground" />
                        {t('query.bookmark.title', 'SQL 收藏夹')}
                    </SheetTitle>
                    <SheetDescription className="sr-only">
                        {t('query.bookmark.description', '管理您的常用查询语句')}
                    </SheetDescription>

                    <div className="relative mt-3">
                        <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            aria-label={t('query.bookmark.searchPlaceholder', '搜索收藏...')}
                            placeholder={t('query.bookmark.searchPlaceholder', '搜索收藏...')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </SheetHeader>

                <ScrollArea className="min-h-0 flex-1">
                    <div>
                        {isLoading ? (
                            <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" />{t('actions.loading')}
                            </div>
                        ) : filteredFavorites.length === 0 ? (
                            <EmptyState className="p-5"
                                icon={Star}
                                title={search ? t('query.bookmark.notFound', '未找到相关收藏') : t('query.bookmark.empty', '暂无收藏记录')}
                                description={t('query.bookmark.hint', '在编辑器中点击星标按钮添加收藏')}
                            />
                        ) : (
                            <div className="divide-y divide-border">
                                {filteredFavorites.map((item) => (
                                    <article
                                        key={item.id}
                                        className="min-w-0 space-y-3 p-5 transition-colors hover:bg-surface-hover/40"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <h3 className="truncate text-sm font-medium text-foreground" title={item.name}>
                                                    {item.name}
                                                </h3>
                                                {item.description && (
                                                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>
                                            <TypeBadge type={item.type} />
                                        </div>

                                        <SQLSnippet
                                            sql={formatSqlPreview(item.sql)}
                                            maxHeight="9rem"
                                            className="border-border bg-background text-foreground"
                                        />

                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <span className="flex items-center gap-1" title={t('query.bookmark.usageCount', '使用次数')}>
                                                    <Hash className="h-3 w-3" /> {item.usage_count}
                                                </span>
                                                <span className="flex items-center gap-1" title={t('query.bookmark.createdDate', '创建日期')}>
                                                    <Calendar className="h-3 w-3" /> {formatDate(item.created_at, i18n.language)}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="subtle"
                                                    onClick={() => handleLoad(item)}
                                                >
                                                    <Play className="size-3.5" />
                                                    {t('query.bookmark.use', '使用')}
                                                </Button>
                                                <Button
                                                    variant="quiet"
                                                    size="icon"
                                                    aria-label={t('actions.delete')}
                                                    className="size-7 text-muted-foreground hover:bg-error-bg hover:text-error"
                                                    onClick={() => handleDelete(item.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
};
