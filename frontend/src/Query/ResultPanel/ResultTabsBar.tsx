import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pin, PinOff, X } from 'lucide-react';
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
  onTogglePin?: (id: string) => void;
}

export const ResultTabsBar: React.FC<ResultTabsBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCloseOthers,
  onCloseToLeft,
  onCloseToRight,
  onTogglePin,
}) => {
  const { t } = useTranslation('common');

  // 默认跟随最新/激活标签：激活项变化或新增标签时滚动到可见
  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeTabId, tabs.length]);

  if (tabs.length === 0) {
    return null;
  }

  // 固定项已排在最前；在固定区与普通区之间插入一条分隔竖线
  const firstUnpinnedIdx = tabs.findIndex((t) => !t.pinned);

  return (
    <div className="flex items-center gap-1 px-2 py-1">
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTabId;
        const showPinDivider = idx === firstUnpinnedIdx && firstUnpinnedIdx > 0;
        return (
          <React.Fragment key={tab.id}>
            {showPinDivider && (
              <div className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
            )}
            <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                ref={isActive ? activeRef : null}
                className={cn(
                  'group flex max-w-48 shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium',
                  isActive
                    ? 'border-primary/40 bg-background text-foreground'
                    : 'border-transparent bg-muted/40 text-foreground/70 hover:bg-muted hover:text-foreground'
                )}
              >
                {tab.pinned && (
                  <button
                    type="button"
                    className="shrink-0 text-primary/80 hover:text-primary"
                    aria-label={t('query.result.unpinTab', '取消固定')}
                    title={t('query.result.unpinTab', '取消固定')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin?.(tab.id);
                    }}
                  >
                    <Pin className="h-3 w-3 fill-current" />
                  </button>
                )}
                <button
                  type="button"
                  className="truncate text-left"
                  onClick={() => onSelectTab(tab.id)}
                >
                  {tab.labelSeq != null
                    ? t('query.result.tabLabel', { n: tab.labelSeq })
                    : tab.label}
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
              {onTogglePin && (
                <>
                  <ContextMenuItem onClick={() => onTogglePin(tab.id)}>
                    {tab.pinned ? (
                      <>
                        <PinOff className="mr-2 h-3.5 w-3.5" />
                        {t('query.result.unpinTab', '取消固定')}
                      </>
                    ) : (
                      <>
                        <Pin className="mr-2 h-3.5 w-3.5" />
                        {t('query.result.pinTab', '固定标签')}
                      </>
                    )}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                </>
              )}
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
          </React.Fragment>
        );
      })}
    </div>
  );
};
