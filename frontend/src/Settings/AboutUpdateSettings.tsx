/**
 * 关于与更新(仅桌面):当前版本号 + 手动检查更新。
 * 复用 desktop/UpdateChecker 的 checkForUpdate/promptUpdate——与启动时
 * 自动检查同一条链路,不另造轮子。Web/Docker 下整卡不渲染(无更新器)。
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Info } from 'lucide-react';
import { toast } from 'sonner';
import { getVersion } from '@tauri-apps/api/app';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { isTauri } from '@/desktop/openExternal';
import { checkForUpdate, promptUpdate } from '@/desktop/UpdateChecker';

export function AboutUpdateSettings() {
  const { t } = useTranslation('common');
  const [version, setVersion] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);

  const onDesktop = isTauri();

  React.useEffect(() => {
    if (!onDesktop) return;
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, [onDesktop]);

  const handleCheck = React.useCallback(async () => {
    setChecking(true);
    try {
      const update = await checkForUpdate();
      if (update) {
        promptUpdate(update);
      } else {
        toast.success(
          t('settings.about.upToDate', {
            defaultValue: '当前已是最新版本 v{{version}}',
            version: version ?? '',
          })
        );
      }
    } catch {
      toast.error(
        t('settings.about.checkFailed', '检查更新失败，请确认网络后重试')
      );
    } finally {
      setChecking(false);
    }
  }, [t, version]);

  // Web/Docker 无更新器,不渲染
  if (!onDesktop) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          {t('settings.about.title', '关于与更新')}
        </CardTitle>
        <CardDescription>
          {t('settings.about.description', '查看当前版本,手动检查并安装新版本')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">
              {t('settings.about.currentVersion', '当前版本')}
            </span>
            <span className="ml-2 font-mono">
              {version ? `v${version}` : '—'}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleCheck} disabled={checking}>
            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
            {checking
              ? t('settings.about.checking', '检查中…')
              : t('settings.about.checkUpdate', '检查更新')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default AboutUpdateSettings;
