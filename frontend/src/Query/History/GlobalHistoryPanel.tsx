import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Trash2, Play, AlertCircle, CheckCircle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import type { GlobalHistoryItem } from '../hooks/useGlobalHistory';

export interface GlobalHistoryPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    history: GlobalHistoryItem[];
    onLoad: (item: GlobalHistoryItem) => void;
    onDelete: (id: string) => void;
    onClear: () => void;
}

function formatTimestamp(timestamp: number, t: (key: string, fallback: string) => string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;

    if (diff < 60 * 1000) return t('query.history.justNow', '刚刚');
    if (diff < 60 * 60 * 1000) return t('query.history.minutesAgo', '{{count}} 分钟前').replace('{{count}}', String(Math.floor(diff / (60 * 1000))));
    if (diff < 24 * 60 * 60 * 1000) return t('query.history.hoursAgo', '{{count}} 小时前').replace('{{count}}', String(Math.floor(diff / (60 * 60 * 1000))));

    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function truncateSQL(sql: string, maxLength: number = 100): string {
    const singleLine = sql.replace(/\s+/g, ' ').trim();
    if (singleLine.length <= maxLength) return singleLine;
    return singleLine.substring(0, maxLength) + '...';
}

const TypeBadge = ({ type }: { type: string }) => {
    const colors: Record<string, string> = {
        sql: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        join: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
        set: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
        pivot: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    };

    return (
        <Badge variant="outline" className={cn("text-[10px] px-1 py-0 h-5 font-normal uppercase", colors[type] || '')}>
            {type}
        </Badge>
    );
};

export const GlobalHistoryPanel: React.FC<GlobalHistoryPanelProps> = ({
    open,
    onOpenChange,
    history,
    onLoad,
    onDelete,
    onClear,
}) => {
    const { t } = useTranslation('common');
    const [search, setSearch] = React.useState('');

    const filteredHistory = React.useMemo(() => {
        if (!search.trim()) return history;
        return history.filter(h => h.sql.toLowerCase().includes(search.toLowerCase()));
    }, [history, search]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0 gap-0">
                <SheetHeader className="px-6 py-4 border-b border-border">
                    <SheetTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        {t('query.history.title', '全平台查询历史')}
                    </SheetTitle>
                    <SheetDescription>
                        {t('query.history.description', '所有查询模式的历史记录')}
                    </SheetDescription>

                    <div className="mt-4 flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={t('query.history.searchPlaceholder', '搜索 SQL...')}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                        {history.length > 0 && (
                            <Button variant="ghost" size="icon" onClick={onClear} title={t('query.history.clearAll', '清空历史')}>
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                        )}
                    </div>
                </SheetHeader>

                <ScrollArea className="flex-1">
                    <div className="p-6">
                        {filteredHistory.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <Clock className="h-12 w-12 mb-3 opacity-50" />
                                <p>{search ? t('query.history.notFound', '未找到相关记录') : t('query.history.empty', '暂无历史记录')}</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {filteredHistory.map((item) => (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            'group p-3 rounded-lg border border-border bg-card hover:bg-accent/50',
                                            'transition-all cursor-pointer shadow-sm hover:shadow-md'
                                        )}
                                        onClick={() => onLoad(item)}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <TypeBadge type={item.type} />
                                            {item.error ? (
                                                <span className="flex items-center gap-1 text-xs text-destructive">
                                                    <AlertCircle className="h-3 w-3" />
                                                    {t('query.history.failed', '失败')}
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-xs text-success">
                                                    <CheckCircle className="h-3 w-3" />
                                                    {item.rowCount !== undefined ? t('query.history.rowCount', '{{count}} 行').replace('{{count}}', String(item.rowCount)) : t('query.history.success', '成功')}
                                                </span>
                                            )}
                                            <span className="text-xs text-muted-foreground ml-auto">
                                                {formatTimestamp(item.timestamp, t)}
                                            </span>
                                        </div>

                                        <div className="font-mono text-sm text-foreground mb-2 bg-muted/30 p-2 rounded border border-border/50 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                                            {item.sql}
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                                            <div className="flex items-center gap-3">
                                                {item.executionTime !== undefined && (
                                                    <span>⏱️ {item.executionTime}ms</span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 text-xs"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onLoad(item);
                                                    }}
                                                >
                                                    <Play className="h-3 w-3 mr-1" />
                                                    {t('query.history.load', '加载')}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 hover:text-destructive"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDelete(item.id);
                                                    }}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
};
