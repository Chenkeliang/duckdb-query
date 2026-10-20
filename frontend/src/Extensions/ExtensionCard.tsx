/**
 * 扩展目录单卡：名称 + 状态 + 说明 + 用法代码块(可复制) + 安装入口/进度
 */

import type { TFunction } from 'i18next';
import { Copy, Download } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
    <div role="listitem" data-testid={`extension-card-${item.name}`} className="grid grid-cols-4 items-center gap-x-5 gap-y-2 px-4 py-4 md:grid-cols-12">
      <div className="col-span-2 flex min-h-7 min-w-0 items-center md:col-span-3">
        <div className="font-mono text-sm font-medium">{item.name}</div>
      </div>
      <p className="col-span-4 row-start-2 flex min-h-7 items-center text-sm leading-5 text-muted-foreground md:col-span-5 md:col-start-4 md:row-start-1">{description}</p>
      {(isBusy || item.installed) && <div className="col-span-2 row-start-3 flex min-h-7 items-center md:col-start-9 md:row-start-1">
        {isBusy ? <div className="space-y-1"><span className="text-xs text-muted-foreground">{t(progress.status === 'verifying' ? 'extensions.statusVerifying' : 'extensions.statusDownloading')} {progress.progress}%</span><Progress value={progress.progress} className="h-1" /></div>
          : item.bundled && item.installed ? <Badge variant="outline">{t('extensions.bundled')}</Badge>
          : item.installed ? <Badge variant="success">{t('extensions.installed')}</Badge> : null}
      </div>}
      <div className="col-span-2 col-start-3 row-start-1 flex min-h-7 items-center justify-end gap-1 md:col-start-11">
        {item.usage && <Button size="icon" className="size-7" variant="ghost" onClick={handleCopy} aria-label={t('extensions.copy')} title={t('extensions.copy')}><Copy className="size-3.5" /></Button>}
        {item.installable && !item.installed && !isBusy && <Button size="sm" variant="outline" disabled={isBusy} onClick={onInstall}><Download className="size-3.5" />{t('extensions.install')}</Button>}
      </div>
      {item.usage && <code className="col-span-4 block min-w-0 truncate font-mono text-xs leading-5 text-muted-foreground md:col-span-10" title={item.usage}>{item.usage}</code>}
    </div>
  );
}

export default ExtensionCard;
