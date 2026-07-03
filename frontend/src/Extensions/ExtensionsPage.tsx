/**
 * DuckDB 扩展管理页
 *
 * 展示精选扩展目录（数据源 / 能力增强两组），支持一键联网安装并轮询进度。
 * 桌面端预置的扩展（excel/httpfs/mysql/postgres）标注「已预置」，不可重复安装。
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Blocks, Database, Sparkles } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccessToast, showErrorToast } from '@/utils/toastHelpers';
import {
  listDuckDBExtensions,
  installDuckDBExtension,
  getDuckDBExtensionInstallStatus,
  type DuckDBExtensionItem,
  type ExtensionCategory,
  type ExtensionInstallStatus,
} from '@/api/extensionsApi';
import { ExtensionRow } from './ExtensionRow';

const POLL_INTERVAL_MS = 500;

export function ExtensionsPage() {
  const { t, i18n } = useTranslation('common');
  const isZh = (i18n.language || 'zh').startsWith('zh');

  const [items, setItems] = React.useState<DuckDBExtensionItem[] | null>(null);
  const [progressByName, setProgressByName] = React.useState<
    Record<string, ExtensionInstallStatus>
  >({});
  const pollersRef = React.useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const loadList = React.useCallback(() => {
    listDuckDBExtensions()
      .then(setItems)
      .catch((e) => showErrorToast(t, e as Error, t('extensions.loadFailed', '获取扩展列表失败')));
  }, [t]);

  React.useEffect(() => {
    loadList();
    // 仅挂载时加载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 卸载时清理所有轮询定时器，避免内存泄漏
  React.useEffect(() => {
    const pollers = pollersRef.current;
    return () => {
      Object.values(pollers).forEach(clearInterval);
    };
  }, []);

  const clearProgress = (name: string) => {
    setProgressByName((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const stopPolling = (name: string) => {
    const timer = pollersRef.current[name];
    if (timer) {
      clearInterval(timer);
      delete pollersRef.current[name];
    }
  };

  const handleInstall = async (item: DuckDBExtensionItem) => {
    try {
      await installDuckDBExtension(item.name);
    } catch (e) {
      showErrorToast(
        t,
        e as Error,
        t('extensions.installFailed', '{{name}} 安装失败', { name: item.name })
      );
      return;
    }

    setProgressByName((prev) => ({
      ...prev,
      [item.name]: { status: 'downloading', progress: 0, error: null },
    }));

    stopPolling(item.name);
    pollersRef.current[item.name] = setInterval(async () => {
      try {
        const status = await getDuckDBExtensionInstallStatus(item.name);

        if (status.status === 'done') {
          stopPolling(item.name);
          clearProgress(item.name);
          showSuccessToast(
            t,
            undefined,
            t('extensions.installSuccess', '{{name}} 安装成功', { name: item.name })
          );
          loadList();
          return;
        }

        if (status.status === 'error') {
          stopPolling(item.name);
          clearProgress(item.name);
          showErrorToast(
            t,
            undefined,
            status.error || t('extensions.installFailed', '{{name}} 安装失败', { name: item.name })
          );
          return;
        }

        setProgressByName((prev) => ({ ...prev, [item.name]: status }));
      } catch (e) {
        stopPolling(item.name);
        clearProgress(item.name);
        showErrorToast(
          t,
          e as Error,
          t('extensions.installFailed', '{{name}} 安装失败', { name: item.name })
        );
      }
    }, POLL_INTERVAL_MS);
  };

  const renderGroup = (
    category: ExtensionCategory,
    icon: React.ElementType,
    title: string
  ) => {
    if (!items) return null;
    const groupItems = items.filter((i) => i.category === category);
    if (groupItems.length === 0) return null;

    const Icon = icon;
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Icon className="h-[18px] w-[18px] text-primary" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {groupItems.map((item) => (
            <ExtensionRow
              key={item.name}
              item={item}
              progress={progressByName[item.name]}
              isZh={isZh}
              onInstall={() => handleInstall(item)}
              t={t}
            />
          ))}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Blocks className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            {t('extensions.title', '扩展')}
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('extensions.subtitle', '扩展来自 DuckDB 官方仓库，安装后离线可用。')}
        </p>
      </div>

      {items === null ? (
        <div className="text-sm text-muted-foreground">{t('actions.loading')}</div>
      ) : (
        <>
          {renderGroup('datasource', Database, t('extensions.groupDatasource', '数据源'))}
          {renderGroup('capability', Sparkles, t('extensions.groupCapability', '能力增强'))}
        </>
      )}
    </div>
  );
}

export default ExtensionsPage;
