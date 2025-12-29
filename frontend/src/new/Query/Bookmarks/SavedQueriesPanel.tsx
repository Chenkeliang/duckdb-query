import React, { useState } from 'react';
import { Star, Trash2, Play, Search, Calendar, Hash } from 'lucide-react';
import { Button } from '@/new/components/ui/button';
import { Input } from '@/new/components/ui/input';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/new/components/ui/sheet';
import { ScrollArea } from '@/new/components/ui/scroll-area';
import { Badge } from '@/new/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSavedQueries, SavedQuery } from '../hooks/useSavedQueries';

export interface SavedQueriesPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onLoad: (sql: string, type: string) => void;
}

function formatDate(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch (e) {
        return dateStr;
    }
}

const TypeBadge = ({ type }: { type: string }) => {
    // 简化的类型展示
    let displayType = type;
    let colorClass = 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';

    if (type === 'duckdb') {
        displayType = 'DuckDB';
        colorClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    } else if (type === 'mysql') {
        displayType = 'MySQL';
        colorClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    }

    return (
        <Badge variant="outline" className={cn("text-[10px] px-1 py-0 h-5 font-normal", colorClass)}>
            {displayType}
        </Badge>
    );
};

export const SavedQueriesPanel: React.FC<SavedQueriesPanelProps> = ({
    open,
    onOpenChange,
    onLoad,
}) => {
    const { favorites, isLoading, deleteQuery, useQuery, refresh } = useSavedQueries();
    const [search, setSearch] = useState('');

    // 打开时刷新列表
    React.useEffect(() => {
        if (open) {
            refresh();
        }
    }, [open, refresh]);

    const filteredFavorites = React.useMemo(() => {
        if (!search.trim()) return favorites;
        const lowerSearch = search.toLowerCase();
        return favorites.filter(fav =>
            fav.name.toLowerCase().includes(lowerSearch) ||
            fav.sql.toLowerCase().includes(lowerSearch)
        );
    }, [favorites, search]);

    const handleLoad = async (item: SavedQuery) => {
        await useQuery(item.id); // 增加计数
        onLoad(item.sql, item.type);
        onOpenChange(false);
    };

    const handleDelete = async (id: string) => {
        if (confirm('确定要删除这个收藏吗？')) {
            await deleteQuery(id);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0 gap-0">
                <SheetHeader className="px-6 py-4 border-b border-border">
                    <SheetTitle className="flex items-center gap-2 text-yellow-500">
                        <Star className="h-5 w-5 fill-yellow-500" />
                        SQL 收藏夹
                    </SheetTitle>
                    <SheetDescription>
                        管理您的常用查询语句
                    </SheetDescription>

                    <div className="mt-4 relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="搜索收藏..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </SheetHeader>

                <ScrollArea className="flex-1">
                    <div className="p-6">
                        {isLoading ? (
                            <div className="flex justify-center py-12">
                                <span className="loading loading-spinner loading-md"></span>
                            </div>
                        ) : filteredFavorites.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <Star className="h-12 w-12 mb-3 opacity-20" />
                                <p>{search ? '未找到相关收藏' : '暂无收藏记录'}</p>
                                <p className="text-xs mt-2 opacity-70">在编辑器中点击星标按钮添加收藏</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredFavorites.map((item) => (
                                    <div
                                        key={item.id}
                                        className="group relative p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-all shadow-sm hover:shadow-md"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex-1">
                                                <h3 className="font-medium text-base truncate pr-8" title={item.name}>
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

                                        <div className="font-mono text-xs text-muted-foreground bg-muted/50 p-3 rounded-md border border-border/50 mb-3 line-clamp-3">
                                            {item.sql}
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <div className="flex items-center gap-3">
                                                <span className="flex items-center gap-1" title="使用次数">
                                                    <Hash className="h-3 w-3" /> {item.usage_count}
                                                </span>
                                                <span className="flex items-center gap-1" title="创建日期">
                                                    <Calendar className="h-3 w-3" /> {formatDate(item.created_at)}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    className="h-7 px-3 text-xs"
                                                    onClick={() => handleLoad(item)}
                                                >
                                                    <Play className="h-3 w-3 mr-1" />
                                                    使用
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-foreground/70 hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleDelete(item.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
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
