import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Database,
  ExternalLink,
  Info,
  RotateCcw,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IS_DEMO } from '@/demo/isDemo';
import { isTauri, openExternal } from '@/desktop/openExternal';
import { useStorageUpgrade } from '@/hooks/useStorageUpgrade';
import { showErrorToast, showSuccessToast } from '@/utils/toastHelpers';

const OFFICIAL_DUCKDB_20_URL = 'https://duckdb.org/2026/09/02/try-duckdb-20-alpha';
export const OPEN_STORAGE_UPGRADE_EVENT = 'duckquery:open-storage-upgrade';

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

export function MajorVersionNotice() {
  const { t } = useTranslation('common');
  const { data, isPending, isError, schedule } = useStorageUpgrade();
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [step, setStep] = useState<'overview' | 'details' | 'confirm'>('overview');
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [downgradeConfirmed, setDowngradeConfirmed] = useState(false);

  useEffect(() => {
    if (!IS_DEMO && data?.required && !data.pending_restart && !deferred) setOpen(true);
  }, [data?.pending_restart, data?.required, deferred]);

  useEffect(() => {
    const reopen = () => {
      setStep('overview');
      setOpen(true);
    };
    window.addEventListener(OPEN_STORAGE_UPGRADE_EVENT, reopen);
    return () => window.removeEventListener(OPEN_STORAGE_UPGRADE_EVENT, reopen);
  }, []);

  if (IS_DEMO || isPending || isError || !data) return null;

  const defer = () => {
    setDeferred(true);
    setOpen(false);
    setStep('overview');
  };

  const submit = async () => {
    try {
      await schedule.mutateAsync();
      setOpen(false);
      showSuccessToast(
        t,
        undefined,
        t('majorUpgrade.scheduled', '已登记迁移，将在下次启动、连接数据库前执行。')
      );
      if (isTauri()) {
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      }
    } catch (error) {
      showErrorToast(t, error as Error, t('majorUpgrade.scheduleFailed', '登记迁移失败'));
    }
  };

  const canSubmit = backupConfirmed && downgradeConfirmed
    && data.free_bytes >= data.required_bytes && data.active_queries === 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => next ? setOpen(true) : defer()}>
        <DialogContent className="max-h-screen max-w-2xl gap-0 overflow-y-auto p-0 text-foreground">
          {step === 'overview' ? (
            <>
              <DialogHeader className="space-y-0 px-6 pt-6 pb-5 text-left">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                  <span className="grid size-6 place-items-center rounded-md border border-primary/30 bg-primary/10">
                    <Database className="size-3.5" />
                  </span>
                  {t('majorUpgrade.badge', 'DuckDB 2.0 · Storage')}
                </div>
                <DialogTitle className="mt-3 text-2xl font-semibold tracking-tight">
                  {t('majorUpgrade.storageTitle', '升级数据库存储')}
                </DialogTitle>
                <DialogDescription className="mt-2">
                  {t('majorUpgrade.storageDescription', '旧库仍可正常使用；迁移后启用 DuckDB 2.0 存储格式。')}
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 pb-6">
                <section className="overflow-hidden rounded-xl border border-border bg-muted/20">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs font-medium text-foreground">
                    <span>{t('majorUpgrade.currentStatus', '当前状态')}</span>
                    <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success">
                      {t('majorUpgrade.optional', '可稍后处理')}
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-3">
                    <div className="border-b border-border px-4 py-3 sm:border-r sm:border-b-0">
                      <div className="text-xs text-muted-foreground">Engine</div>
                      <div className="mt-1 flex items-center gap-1.5 font-mono text-sm font-medium text-foreground">
                        <span>v2.0.0</span><Check className="size-3.5 text-success" />
                      </div>
                    </div>
                    <div className="border-b border-border px-4 py-3 sm:border-r sm:border-b-0">
                      <div className="text-xs text-muted-foreground">main.db</div>
                      <div className="mt-1 flex items-center gap-1.5 font-mono text-sm font-medium text-foreground">
                        <span>{data.main.version}</span><ArrowRight className="size-3 text-muted-foreground" /><span>{data.target_storage}</span>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      <div className="text-xs text-muted-foreground">system.db</div>
                      <div className="mt-1 flex items-center gap-1.5 font-mono text-sm font-medium text-foreground">
                        <span>{data.system.version}</span><ArrowRight className="size-3 text-muted-foreground" /><span>{data.target_storage}</span>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="flex gap-3 rounded-xl border border-border bg-background/40 p-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
                      <Check className="size-4" />
                    </span>
                    <div>
                      <div className="font-medium text-foreground">{t('majorUpgrade.notRequiredTitle', '现在不升级')}</div>
                      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t('majorUpgrade.notRequiredDescription', '2.0 引擎与新 SQL 仍可正常使用。')}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning">
                      <AlertTriangle className="size-4" />
                    </span>
                    <div>
                      <div className="font-medium text-foreground">{t('majorUpgrade.noDowngradeTitle', '完成迁移后')}</div>
                      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t('majorUpgrade.noDowngradeDescription', 'DuckDB 1.5.3 无法直接打开，降级需恢复备份。')}
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter className="mt-5 flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" onClick={() => setStep('details')}>
                    {t('majorUpgrade.releaseNotes', '查看迁移影响')}<ChevronRight className="ml-1 size-3.5" />
                  </Button>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={defer}>{t('majorUpgrade.defer', '稍后处理')}</Button>
                    <Button onClick={() => setStep('confirm')}>{t('majorUpgrade.backupAndUpgrade', '备份并升级')}</Button>
                  </div>
                </DialogFooter>
              </div>
            </>
          ) : step === 'details' ? (
            <>
              <DialogHeader className="space-y-0 px-6 pt-6 pb-5 text-left">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                  <span className="grid size-6 place-items-center rounded-md border border-primary/30 bg-primary/10">
                    <Info className="size-3.5" />
                  </span>
                  {t('majorUpgrade.detailsBadge', '升级前须知')}
                </div>
                <DialogTitle className="mt-3 text-2xl font-semibold tracking-tight">
                  {t('majorUpgrade.detailsTitle', '迁移影响')}
                </DialogTitle>
                <DialogDescription className="mt-2">
                  {t('majorUpgrade.detailsDescription', '三件事看完再决定；应用不会自动升级数据库。')}
                </DialogDescription>
              </DialogHeader>
              <div className="px-6 pb-6">
                <div className="flex gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <div className="text-xs font-medium text-foreground">{t('majorUpgrade.detailsSummaryTitle', '迁移不是必选项')}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {t('majorUpgrade.detailsSummaryDescription', '保留旧格式不影响 DuckDB 2.0 引擎与新 SQL。')}
                    </div>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border border-border bg-muted/20">
                  <div className="flex flex-col gap-1 border-b border-border p-4 sm:flex-row sm:gap-3">
                    <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">01</span>
                    <div className="shrink-0 font-medium text-foreground sm:w-32">{t('majorUpgrade.detailsStorageTitle', '旧库可以直接用')}</div>
                    <div className="text-xs leading-relaxed text-muted-foreground">{t('majorUpgrade.detailsStorageDescription', 'DuckDB 2.0 可原样读取，应用不会静默改写。')}</div>
                  </div>
                  <div className="flex flex-col gap-1 border-b border-border p-4 sm:flex-row sm:gap-3">
                    <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">02</span>
                    <div className="shrink-0 font-medium text-foreground sm:w-32">{t('majorUpgrade.detailsBackupTitle', '迁移会先备份')}</div>
                    <div className="text-xs leading-relaxed text-muted-foreground">{t('majorUpgrade.detailsBackupDescription', 'DuckDB 1.5.3 无法直接打开迁移后的数据库；如需降级，恢复备份即可。')}</div>
                  </div>
                  <div className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-3">
                    <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">03</span>
                    <div className="shrink-0 font-medium text-foreground sm:w-32">{t('majorUpgrade.detailsCompatibilityTitle', '检查 SQL 与扩展')}</div>
                    <div className="text-xs leading-relaxed text-muted-foreground">{t('majorUpgrade.detailsCompatibilityDescription', '外部扩展需匹配 2.0；旧 lambda 写法改用 lambda x: ...。')}</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-1.5 shrink-0 rounded-full bg-warning" />
                  <span><strong className="font-medium text-foreground">{t('majorUpgrade.detailsAlphaTitle', '官方 Alpha')}</strong> · {t('majorUpgrade.detailsAlphaDescription', '重要数据库建议先备份并验证。')}</span>
                </div>

                <DialogFooter className="mt-5 flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" onClick={() => void openExternal(OFFICIAL_DUCKDB_20_URL)}>
                    {t('majorUpgrade.officialNotes', 'DuckDB 官方说明')}<ExternalLink className="ml-1 size-3.5" />
                  </Button>
                  <Button variant="outline" onClick={() => setStep('overview')}>{t('actions.back', '返回')}</Button>
                </DialogFooter>
              </div>
            </>
          ) : (
            <>
              <DialogHeader className="px-6 pt-6 pb-5 text-left">
                <DialogTitle>{t('majorUpgrade.confirmTitle', '准备在重启时迁移数据库')}</DialogTitle>
                <DialogDescription>{t('majorUpgrade.confirmDescription', '迁移只在所有连接关闭后执行；失败不会覆盖当前数据库。')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 px-6 pb-6">
                <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                  <dt className="text-muted-foreground">{t('majorUpgrade.target', '目标格式')}</dt><dd className="text-right font-mono">{data.target_storage}</dd>
                  <dt className="text-muted-foreground">{t('majorUpgrade.requiredSpace', '预计需要空间')}</dt><dd className="text-right font-mono">{formatBytes(data.required_bytes)}</dd>
                  <dt className="text-muted-foreground">{t('majorUpgrade.freeSpace', '当前可用空间')}</dt><dd className="text-right font-mono">{formatBytes(data.free_bytes)}</dd>
                  <dt className="text-muted-foreground">{t('majorUpgrade.activeQueries', '正在运行的查询')}</dt><dd className="text-right font-mono">{data.active_queries}</dd>
                </dl>
                <label className="flex gap-2 rounded-lg border border-border p-3 text-sm">
                  <input type="checkbox" checked={backupConfirmed} onChange={(event) => setBackupConfirmed(event.target.checked)} />
                  <span>{t('majorUpgrade.confirmBackup', '我确认迁移会先创建完整备份。')}</span>
                </label>
                <label className="flex gap-2 rounded-lg border border-border p-3 text-sm">
                  <input type="checkbox" checked={downgradeConfirmed} onChange={(event) => setDowngradeConfirmed(event.target.checked)} />
                  <span>{t('majorUpgrade.confirmDowngrade', '我确认迁移后不能直接使用 DuckQuery 1.x。')}</span>
                </label>
                {(data.free_bytes < data.required_bytes || data.active_queries > 0) && (
                  <Alert variant="destructive" className="text-foreground"><AlertTriangle className="h-4 w-4" /><AlertDescription>{t('majorUpgrade.blocked', '空间不足或仍有查询运行，当前不能登记迁移。')}</AlertDescription></Alert>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStep('overview')}>{t('actions.back', '返回')}</Button>
                  <Button disabled={!canSubmit || schedule.isPending} onClick={submit}>
                    <RotateCcw className="mr-2 h-4 w-4" />{t('majorUpgrade.scheduleAndRestart', '登记迁移并重启')}
                  </Button>
                </DialogFooter>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
