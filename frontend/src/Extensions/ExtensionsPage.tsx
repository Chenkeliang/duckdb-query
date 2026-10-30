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
import { Database, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { showSuccessToast, showErrorToast } from '@/utils/toastHelpers';
import {
  listDuckDBExtensions,
  installDuckDBExtension,
  getDuckDBExtensionInstallStatus,
  type DuckDBExtensionItem,
  type ExtensionCategory,
  type ExtensionInstallStatus,
} from '@/api';
import { DUCKDB_CAPABILITIES_QUERY_KEY } from '@/hooks/useDuckDBCapabilities';
import { ExtensionCard } from './ExtensionCard';

const POLL_INTERVAL_MS = 500;

export function ExtensionsPage() {
  const { t, i18n } = useTranslation('common');
  const isZh = (i18n.language || 'zh').startsWith('zh');
  const queryClient = useQueryClient();
  const [installingNames, setInstallingNames] = React.useState<string[]>([]);
  const settledNames = React.useRef(new Set<string>());
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('all');
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
        void queryClient.invalidateQueries({ queryKey: DUCKDB_CAPABILITIES_QUERY_KEY });
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

  const items = extensionsQuery.data ?? [];
  const matchingItems = items.filter((item) => {
    const matchesState = filter === 'installed' ? item.installed : filter === 'available' ? !item.installed && item.installable : true;
    return matchesState && `${item.name} ${item.description} ${item.description_en}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  });
  const renderGroup = (
    category: ExtensionCategory,
    icon: React.ElementType,
    title: string
  ) => {
    const groupItems = matchingItems.filter(
      (item) => item.category === category
    );
    if (groupItems.length === 0) return null;

    const Icon = icon;
    return (
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium"><Icon className="size-4 text-muted-foreground" />{title}<span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{groupItems.length}</span></h2>
        <div role="list" className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {groupItems.map((item) => <ExtensionCard key={item.name} item={item} progress={progressByName[item.name]} isZh={isZh} onInstall={() => handleInstall(item)} t={t} />)}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t('extensions.title', '扩展')}
          </h1>
          <span className="text-xs tabular-nums text-muted-foreground">{t('extensions.catalogCount', { count: items.length })}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('extensions.subtitle', '扩展来自 DuckDB 官方仓库，安装后离线可用。')}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" /><Input className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('extensions.search')} aria-label={t('extensions.search')} /></div>
        <Tabs value={filter} onValueChange={setFilter}><TabsList aria-label={t('extensions.filter')}><TabsTrigger value="all">{t('extensions.all')}</TabsTrigger><TabsTrigger value="installed">{t('extensions.installed')}</TabsTrigger><TabsTrigger value="available">{t('extensions.available')}</TabsTrigger></TabsList></Tabs>
      </div>
      {extensionsQuery.isPending ? (
        <div role="status" className="text-sm text-muted-foreground">{t('actions.loading')}</div>
      ) : extensionsQuery.error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><span>{t('extensions.loadFailed')}</span><Button variant="outline" size="sm" onClick={() => void extensionsQuery.refetch()}>{t('extensions.retry')}</Button></div> : matchingItems.length === 0 ? <div className="space-y-3 py-8 text-center text-sm text-muted-foreground"><p>{t('extensions.noMatches')}</p><Button variant="outline" size="sm" onClick={() => { setSearch(''); setFilter('all'); }}>{t('extensions.clearFilters')}</Button></div> : (
        <>
          {renderGroup('datasource', Database, t('extensions.groupDatasource', '数据源'))}
          {renderGroup('capability', Sparkles, t('extensions.groupCapability', '能力增强'))}
        </>
      )}
    </div>
  );
}

export default ExtensionsPage;
