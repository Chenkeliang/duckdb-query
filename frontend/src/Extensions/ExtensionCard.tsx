/**
 * 扩展目录单卡：名称 + 状态 + 说明 + 用法代码块(可复制) + 安装入口/进度
 */

import type { TFunction } from 'i18next';
import { Copy } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
    <Card data-testid={`extension-card-${item.name}`} className="flex flex-col">
      <CardHeader className="space-y-1.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <code className="truncate font-mono text-sm font-medium text-foreground">
            {item.name}
          </code>
          <div className="shrink-0">
            {item.bundled ? (
              <Badge variant="outline">{t('extensions.bundled', '已预置')}</Badge>
            ) : item.installed ? (
              <Badge variant="success">{t('extensions.installed', '已安装')}</Badge>
            ) : null}
          </div>
        </div>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 p-4 pt-0">
        {item.usage && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">
                {t('extensions.usage', '用法')}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5"
                onClick={handleCopy}
                aria-label={t('extensions.copy', '复制')}
                title={t('extensions.copy', '复制')}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <div className="overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1.5 font-mono text-xs">
              {item.usage}
            </div>
          </div>
        )}

        <div className="mt-auto">
          {isBusy ? (
            <div className="flex items-center gap-2">
              <Progress value={progress.progress} className="h-1.5 flex-1" />
              <span className="shrink-0 text-xs text-muted-foreground">
                {progress.status === 'verifying'
                  ? t('extensions.statusVerifying', '校验中')
                  : t('extensions.statusDownloading', '下载中')}{' '}
                {progress.progress}%
              </span>
            </div>
          ) : !item.bundled && !item.installed ? (
            <Button size="sm" className="w-full" onClick={onInstall}>
              {t('extensions.install', '安装')}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default ExtensionCard;
