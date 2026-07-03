/**
 * 扩展目录单行：名称 + 说明 + 右侧状态(已预置 / 已安装 / 安装中进度 / 安装按钮)
 */

import type { TFunction } from 'i18next';
import { Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { DuckDBExtensionItem, ExtensionInstallStatus } from '@/api/extensionsApi';

export interface ExtensionRowProps {
  item: DuckDBExtensionItem;
  progress?: ExtensionInstallStatus;
  isZh: boolean;
  onInstall: () => void;
  t: TFunction;
}

export function ExtensionRow({ item, progress, isZh, onInstall, t }: ExtensionRowProps) {
  const description = isZh ? item.description : item.description_en;
  const isBusy = !!progress && (progress.status === 'downloading' || progress.status === 'verifying');

  return (
    <div
      data-testid={`extension-row-${item.name}`}
      className="flex items-center justify-between gap-4 rounded-md px-2 py-2.5 hover:bg-surface-hover"
    >
      <div className="min-w-0 flex-1">
        <code className="font-mono text-sm font-medium text-foreground">{item.name}</code>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
        {isBusy && (
          <div className="mt-2 flex max-w-xs items-center gap-2">
            <Progress value={progress.progress} className="h-1.5" />
            <span className="shrink-0 text-xs text-muted-foreground">
              {progress.status === 'verifying'
                ? t('extensions.statusVerifying', '校验中')
                : t('extensions.statusDownloading', '下载中')}{' '}
              {progress.progress}%
            </span>
          </div>
        )}
      </div>
      <div className="shrink-0">
        {item.bundled ? (
          <Badge variant="outline">{t('extensions.bundled', '已预置')}</Badge>
        ) : isBusy ? (
          <Button size="sm" variant="outline" disabled>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            {progress.progress}%
          </Button>
        ) : item.installed ? (
          <Badge variant="success">{t('extensions.installed', '已安装')}</Badge>
        ) : (
          <Button size="sm" onClick={onInstall}>
            {t('extensions.install', '安装')}
          </Button>
        )}
      </div>
    </div>
  );
}

export default ExtensionRow;
