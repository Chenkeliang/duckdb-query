/**
 * 设置页面（graphite redesign）：左侧分区导航 + 右侧独立设置分区。
 * AI 模型配置也在这里（原侧栏「AI 模型」页并入设置，AI 对话在工作台右侧面板）。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { isTauri } from '@/desktop/openExternal';
import { IS_DEMO } from '@/demo/isDemo';
import { ShortcutSettings } from './shortcuts';
import { CacheSettings } from './CacheSettings';
import { QueryResultSettings } from './QueryResultSettings';
import { DataGridSettings } from './DataGridSettings';
import { EngineCompatSettings } from './EngineCompatSettings';
import { AboutUpdateSettings } from './AboutUpdateSettings';
import { StorageUpgradeSettings } from './StorageUpgradeSettings';

const AISettings = React.lazy(() => import('./AISettings').then((m) => ({ default: m.AISettings })));

export type SettingsSectionId =
  | 'ai'
  | 'shortcuts'
  | 'queryResult'
  | 'dataGrid'
  | 'engineCompat'
  | 'storageUpgrade'
  | 'cache'
  | 'about';

export interface SettingsPageProps {
  /** Scroll this section into view when the page opens (e.g. from「配置 AI」). */
  focusSection?: SettingsSectionId | null;
  /** Bumped by the caller to re-trigger focus on the same section. */
  focusToken?: number;
}

export function SettingsPage({ focusSection, focusToken }: SettingsPageProps) {
  const { t } = useTranslation('common');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SettingsSectionId>(focusSection ?? (IS_DEMO ? 'queryResult' : 'ai'));

  const sections: Array<{ id: SettingsSectionId; label: string; node: React.ReactNode }> = [
    // Demo 无后端：AI 配置需要服务端保存 Key，不展示
    ...(IS_DEMO
      ? []
      : [
          {
            id: 'ai' as const,
            label: t('settings.ai.title', 'AI / 模型'),
            node: (
              <React.Suspense fallback={<div className="p-4 text-sm text-muted-foreground">{t('actions.loading')}</div>}>
                <AISettings />
              </React.Suspense>
            ),
          },
        ]),
    { id: 'shortcuts', label: t('shortcuts.title', '键盘快捷键'), node: <ShortcutSettings /> },
    { id: 'queryResult', label: t('settings.queryResult.title', '查询结果'), node: <QueryResultSettings /> },
    { id: 'dataGrid', label: t('settings.dataGrid.title', '结果表显示'), node: <DataGridSettings /> },
    { id: 'engineCompat', label: t('settings.engineCompat.title', '引擎兼容性'), node: <EngineCompatSettings /> },
    { id: 'storageUpgrade', label: t('settings.storageUpgrade.title', '数据库存储'), node: <StorageUpgradeSettings /> },
    { id: 'cache', label: t('settings.cache.title', '缓存设置'), node: <CacheSettings /> },
    // 关于与更新只在桌面端渲染内容，网页版不放导航项
    ...(isTauri() ? [{ id: 'about' as const, label: t('settings.about.title', '关于与更新'), node: <AboutUpdateSettings /> }] : []),
  ];

  const scrollTo = useCallback((id: SettingsSectionId) => {
    setActive(id);
    scrollRef.current?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (focusSection) scrollTo(focusSection);
  }, [focusSection, focusToken, scrollTo]);

  return (
    <div ref={scrollRef} className="h-full overflow-auto px-4 md:px-8">
      <div className="mx-auto max-w-6xl pb-16 pt-7">
        <h1 className="mb-8 text-xl font-semibold tracking-tight text-foreground">{t('nav.settings')}</h1>
        <div className="flex flex-col gap-8 md:flex-row">
        <nav aria-label={t('nav.settings')} className="flex flex-col gap-0.5 md:sticky md:top-0 md:w-52 md:shrink-0 md:self-start">
          <div className="flex gap-0.5 overflow-x-auto md:flex-col">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                aria-current={active === s.id ? 'true' : undefined}
                className={cn(
                  'h-8 shrink-0 whitespace-nowrap rounded-md px-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                  active === s.id && 'bg-muted text-foreground',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>
        <div className="min-w-0 flex-1">
          {sections.map((s) => (
            <section key={s.id} data-settings-section={s.id} className={active === s.id ? 'block' : 'hidden'}>
              {s.node}
            </section>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
