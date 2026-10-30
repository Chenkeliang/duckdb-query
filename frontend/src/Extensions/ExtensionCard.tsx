/**
 * 扩展目录单卡：名称 + 状态 + 说明 + 用法代码块(可复制) + 安装入口/进度
 */

import { useId, useState } from 'react';
import type { TFunction } from 'i18next';
import { ChevronDown, Copy, Download } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { SQLHighlight } from '@/components/SQLHighlight';
import { showSuccessToast } from '@/utils/toastHelpers';
import type { DuckDBExtensionItem, ExtensionInstallStatus } from '@/api';

export interface ExtensionCardProps {
  item: DuckDBExtensionItem;
  progress?: ExtensionInstallStatus;
  isZh: boolean;
  onInstall: () => void;
  t: TFunction;
}

export function ExtensionCard({ item, progress, isZh, onInstall, t }: ExtensionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const usageId = useId();
  const description = isZh ? item.description : item.description_en;
  const isBusy = !!progress && (progress.status === 'downloading' || progress.status === 'verifying');

  const handleCopy = async () => {
    if (!item.usage) return;
    try {
      await navigator.clipboard.writeText(item.usage);
      showSuccessToast(t, undefined, t('extensions.copied', '已复制'));
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div role="listitem" data-testid={`extension-card-${item.name}`}>
      <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-12">
      <div className="min-w-0 sm:col-span-2">
        <div className="font-mono text-sm font-medium">{item.name}</div>
      </div>
      <p className="col-span-2 row-start-2 min-w-0 text-sm leading-5 text-muted-foreground sm:col-span-5 sm:col-start-3 sm:row-start-1 sm:truncate" title={description}>{description}</p>
      <div className="col-start-2 row-start-1 flex justify-end sm:col-span-2 sm:col-start-8 sm:justify-start">
        {isBusy ? <div className="w-full space-y-1"><span className="text-xs tabular-nums text-muted-foreground">{t(progress.status === 'verifying' ? 'extensions.statusVerifying' : 'extensions.statusDownloading')} {progress.progress}%</span><Progress aria-label={t('extensions.installProgress', { name: item.name })} value={progress.progress} className="h-1" /></div>
          : item.bundled && item.installed ? <Badge variant="outline">{t('extensions.bundled')}</Badge>
          : item.installed ? <Badge variant="success">{t('extensions.installed')}</Badge> : <span className="text-xs text-muted-foreground">{t('extensions.notInstalled')}</span>}
      </div>
      <div className="col-span-2 row-start-3 flex items-center justify-end gap-1 sm:col-span-3 sm:col-start-10 sm:row-start-1">
        {item.usage && <Button size="sm" variant="quiet" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={usageId} aria-label={t(expanded ? 'extensions.hideUsage' : 'extensions.showUsage', { name: item.name })}>{t('extensions.usage')}<ChevronDown className={expanded ? 'size-3.5 rotate-180' : 'size-3.5'} /></Button>}
        {item.installable && !item.installed && !isBusy && <Button size="sm" variant="outline" disabled={isBusy} onClick={onInstall}><Download className="size-3.5" />{t('extensions.install')}</Button>}
      </div>
      </div>
      {expanded && item.usage && <section id={usageId} className="space-y-2 border-t border-border bg-background/50 px-3 py-3">
        <div className="flex items-center justify-between"><span className="text-xs font-medium">{t('extensions.usage')}</span><Button size="icon" className="size-7" variant="ghost" onClick={handleCopy} aria-label={t('extensions.copy')}><Copy className="size-3.5" /></Button></div>
        <SQLHighlight sql={item.usage} minHeight="32px" maxHeight="120px" />
      </section>}
    </div>
  );
}

export default ExtensionCard;
