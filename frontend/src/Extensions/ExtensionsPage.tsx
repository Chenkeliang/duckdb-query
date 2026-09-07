/**
 * DuckDB 扩展管理页
 *
 * 展示精选扩展目录（数据源 / 能力增强两组），支持一键联网安装并轮询进度。
 * 桌面端预置的扩展（v1.2.0 起仅 excel）标注「已预置」，不可重复安装；
 * 徽标与安装按钮完全由后端返回的 bundled/installed 字段驱动。
 */

import * as React from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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
} from '@/api';
import { ExtensionCard } from './ExtensionCard';

const POLL_INTERVAL_MS = 500;

export function ExtensionsPage() {
  const { t, i18n } = useTranslation('common');
  const isZh = (i18n.language || 'zh').startsWith('zh');
  const queryClient = useQueryClient();
  const [installingNames, setInstallingNames] = React.useState<string[]>([]);
  const settledNames = React.useRef(new Set<string>());
  const extensionsQuery = useQuery({
    queryKey: ['duckdb-extensions'],
    queryFn: listDuckDBExtensions,
  });
  const statusQueries = useQueries({
    queries: installingNames.map((name) => ({
      queryKey: ['duckdb-extension-install', name],
      queryFn: () => getDuckDBExtensionInstallStatus(name),
      refetchInterval: (query: { state: { data?: ExtensionInstallStatus } }) => {
        const status = query.state.data?.status;
        return status === 'done' || status === 'error' ? false : POLL_INTERVAL_MS;
      },
    })),
  });
  const progressByName = Object.fromEntries(
    installingNames.map((name, index) => [
      name,
      statusQueries[index]?.data ?? { status: 'downloading', progress: 0, error: null },
    ])
  ) as Record<string, ExtensionInstallStatus>;
  const installMutation = useMutation({
    mutationFn: (name: string) => installDuckDBExtension(name),
    onSuccess: (_data, name) => {
      queryClient.removeQueries({ queryKey: ['duckdb-extension-install', name], exact: true });
      settledNames.current.delete(name);
      setInstallingNames((current) => current.includes(name) ? current : [...current, name]);
    },
  });

  React.useEffect(() => {
    if (extensionsQuery.error) {
      showErrorToast(
        t,
        extensionsQuery.error as Error,
        t('extensions.loadFailed', '获取扩展列表失败')
      );
    }
  }, [extensionsQuery.error, t]);

  React.useEffect(() => {
    installingNames.forEach((name, index) => {
      const queryError = statusQueries[index]?.error;
      if (queryError && !settledNames.current.has(name)) {
        settledNames.current.add(name);
        showErrorToast(
          t,
          queryError as Error,
          t('extensions.installFailed', '{{name}} 安装失败', { name })
        );
        setInstallingNames((current) => current.filter((item) => item !== name));
        return;
      }
      const status = statusQueries[index]?.data;
      if (!status || settledNames.current.has(name)) return;
      if (status.status === 'done') {
        settledNames.current.add(name);
        showSuccessToast(
          t,
          undefined,
          t('extensions.installSuccess', '{{name}} 安装成功', { name })
        );
        void queryClient.invalidateQueries({ queryKey: ['duckdb-extensions'] });
        setInstallingNames((current) => current.filter((item) => item !== name));
      } else if (status.status === 'error') {
        settledNames.current.add(name);
        showErrorToast(
          t,
          undefined,
          status.error || t('extensions.installFailed', '{{name}} 安装失败', { name })
        );
        setInstallingNames((current) => current.filter((item) => item !== name));
      }
    });
  }, [installingNames, queryClient, statusQueries, t]);

  const handleInstall = async (item: DuckDBExtensionItem) => {
    try {
      await installMutation.mutateAsync(item.name);
    } catch (e) {
      showErrorToast(
        t,
        e as Error,
        t('extensions.installFailed', '{{name}} 安装失败', { name: item.name })
      );
    }
  };

  const renderGroup = (
    category: ExtensionCategory,
    icon: React.ElementType,
    title: string
  ) => {
    const groupItems = (extensionsQuery.data ?? []).filter(
      (item) => !(item.bundled && item.installed) && item.category === category
    );
    if (groupItems.length === 0) return null;

    const Icon = icon;
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groupItems.map((item) => (
              <ExtensionCard
                key={item.name}
                item={item}
                progress={progressByName[item.name]}
                isZh={isZh}
                onInstall={() => handleInstall(item)}
                t={t}
              />
            ))}
          </div>
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

      {extensionsQuery.isPending ? (
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
