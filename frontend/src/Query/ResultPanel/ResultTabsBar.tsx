import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { ResultTabEntry } from './resultTabUtils';

export interface ResultTabsBarProps {
  tabs: ResultTabEntry[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseToLeft: (id: string) => void;
  onCloseToRight: (id: string) => void;
}

export const ResultTabsBar: React.FC<ResultTabsBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCloseOthers,
  onCloseToLeft,
  onCloseToRight,
}) => {
  const { t } = useTranslation('common');

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="shrink-0 border-b border-border bg-muted/20 px-2 py-1">
      <div className="flex items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    'group flex max-w-48 shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs',
                    isActive
                      ? 'border-primary/40 bg-background text-foreground'
                      : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted'
                  )}
                >
                  <button
                    type="button"
                    className="truncate text-left"
                    onClick={() => onSelectTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 opacity-60 group-hover:opacity-100"
                    aria-label={t('query.result.closeTab', '关闭结果')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem onClick={() => onCloseTab(tab.id)}>
                  {t('query.result.closeTab', '关闭')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => onCloseOthers(tab.id)}>
                  {t('query.result.closeOthers', '关闭其他')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onCloseToLeft(tab.id)}>
                  {t('query.result.closeToLeft', '关闭左侧')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onCloseToRight(tab.id)}>
                  {t('query.result.closeToRight', '关闭右侧')}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
};
