import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Database, ExternalLink, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { OPEN_STORAGE_UPGRADE_EVENT } from '@/components/MajorVersionNotice';
import { useStorageUpgrade } from '@/hooks/useStorageUpgrade';
import { useDuckDBCapabilities } from '@/hooks/useDuckDBCapabilities';
import { inspectStorageBackup, openStorageBackup, getResourceBudget } from '@/api';
import { isTauri } from '@/desktop/openExternal';
import { showErrorToast } from '@/utils/toastHelpers';

export function StorageUpgradeSettings() {
  const { t, i18n } = useTranslation('common');
  const { data, isPending } = useStorageUpgrade();
  const capabilities = useDuckDBCapabilities();
  const [showReport, setShowReport] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const backup = useQuery({ queryKey: ['storage-backup'], queryFn: inspectStorageBackup, enabled: showRecovery, retry: false });
  const budget = useQuery({ queryKey: ['resource-budget'], queryFn: getResourceBudget, staleTime: 60000 });
  const openBackup = useMutation({ mutationFn: openStorageBackup,
    onError: (error) => showErrorToast(t, error, t('settings.storageUpgrade.openFailed')) });
  if (isPending) return null;

  const openUpgrade = () => window.dispatchEvent(new Event(OPEN_STORAGE_UPGRADE_EVENT));
  const report = data?.last_report;
  const complete = data ? !data.required : false;
  const completedDate = report?.completed_at ? new Date(report.completed_at) : null;
  const completedTime = completedDate && !Number.isNaN(completedDate.getTime())
    ? completedDate.toLocaleString(i18n.language, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" />
          {t('settings.storageUpgrade.title', 'DuckDB 数据库存储')}
        </CardTitle>
        <CardDescription>
          {t('settings.storageUpgrade.description', '查看 main/system 实际格式，并管理 DuckDB 2.0 storage 迁移。')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {capabilities.data && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
            <div className="font-medium">
              {t('settings.storageUpgrade.capabilityTitle')}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t('settings.storageUpgrade.capabilityRuntime', {
                version: capabilities.data.engine.version,
                stage: t(
                  capabilities.data.engine.release_stage === 'preview'
                    ? 'settings.storageUpgrade.stagePreview'
                    : 'settings.storageUpgrade.stageStable'
                ),
              })}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t(
                capabilities.data.optimizer_policy.remote_pushdown?.status === 'supported'
                  ? 'settings.storageUpgrade.optimizerVerified'
                  : 'settings.storageUpgrade.optimizerSafe'
              )}
            </div>
          </div>
        )}
        {budget.data && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
            <div className="font-medium">{t('settings.storageUpgrade.budgetTitle')}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t('settings.storageUpgrade.budgetValues', {
              memory: (budget.data.memory_limit_bytes / 1024 ** 3).toFixed(1),
              temp: (budget.data.temp_limit_bytes / 1024 ** 3).toFixed(1),
              concurrent: budget.data.max_connections,
              reserve: Math.round(budget.data.min_free_disk_bytes / 1024 ** 2),
            })}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t('settings.storageUpgrade.budgetHint')}</div>
          </div>
        )}
        {data && <div className="grid gap-2 sm:grid-cols-2">
          {(['main', 'system'] as const).map((name) => (
            <div key={name} className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
              <div><div className="text-xs text-muted-foreground">{name}.db</div><div className="font-mono text-sm">{data[name].version}</div></div>
              {data[name].version.startsWith(data.target_storage) && <CheckCircle2 className="h-4 w-4 text-success" />}
            </div>
          ))}
        </div>}

        <div className="space-y-3">
          <div className="text-sm">
            <div className="font-medium">
              {!data ? t('settings.storageUpgrade.statusUnavailable') : data.pending_restart
                ? t('settings.storageUpgrade.pending', '等待重启迁移')
                : complete
                  ? t('settings.storageUpgrade.complete', '已使用 v2.0.0 storage')
                  : t('settings.storageUpgrade.required', '存在待升级数据库')}
            </div>
            {completedTime && <div className="text-xs text-muted-foreground">{t('settings.storageUpgrade.completedAt', { time: completedTime })}</div>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
          {data?.required && !data.pending_restart && (
            <Button size="sm" onClick={openUpgrade}><RotateCcw className="mr-2 h-4 w-4" />{t('settings.storageUpgrade.action', '升级到 v2 storage')}</Button>
          )}
          {report && (
            <Button size="sm" variant="outline" aria-expanded={showReport} onClick={() => setShowReport((value) => !value)}><ExternalLink className="mr-2 h-4 w-4" />{t('settings.storageUpgrade.report')}</Button>
          )}
          <Button size="sm" variant="outline" aria-expanded={showRecovery} onClick={() => setShowRecovery(v => !v)}>
            {t('settings.storageUpgrade.recovery')}
          </Button>
          </div>
        </div>
        {showRecovery && (
          <section className="space-y-3 rounded-lg border border-border p-4 text-sm">
            <div className="font-medium">{t('settings.storageUpgrade.recovery')}</div>
            <p className="text-muted-foreground">{t(backup.isFetching ? 'settings.storageUpgrade.checkingBackup' : backup.data?.available ? 'settings.storageUpgrade.backupReady' : 'settings.storageUpgrade.backupUnavailable')}</p>
            {backup.data?.directory && <p className="break-all font-mono text-xs">{backup.data.directory}</p>}
            <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
              <li>{t('settings.storageUpgrade.recoverStop')}</li>
              <li>{t('settings.storageUpgrade.recoverCopy')}</li>
              <li>{t('settings.storageUpgrade.recoverWal')}</li>
              <li>{t('settings.storageUpgrade.recoverVerify')}</li>
            </ol>
            <p className="text-xs text-warning">{t('settings.storageUpgrade.recoverWarning')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={backup.isFetching} onClick={() => void backup.refetch()}>{t('settings.storageUpgrade.recheckBackup')}</Button>
              {isTauri() && <Button size="sm" disabled={!backup.data?.available || openBackup.isPending} onClick={() => openBackup.mutate()}>{t('settings.storageUpgrade.openBackup')}</Button>}
            </div>
          </section>
        )}
        {showReport && report && (
          <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
            <div>{t('settings.storageUpgrade.reportStatus', '结果：{{status}}', { status: report.status })}</div>
            <div className="text-xs text-muted-foreground">{t('settings.storageUpgrade.reportTarget', '目标：{{target}}', { target: report.target_storage })}</div>
            {report.backup_directory && <div className="break-all text-xs text-muted-foreground">{report.backup_directory}</div>}
            {report.error && <div className="text-xs text-destructive">{report.error}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
