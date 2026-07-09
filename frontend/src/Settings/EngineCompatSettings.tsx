/**
 * 引擎兼容性设置
 *
 * 四个布尔开关，对应 DuckDB 各扩展注册的 SET GLOBAL 选项，默认全 false，
 * 保存即通过后端生效（无需重启）。
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { showSuccessToast, showErrorToast } from '@/utils/toastHelpers';
import { getEngineCompat, saveEngineCompat, type EngineCompatFlags } from '@/api';
import { cn } from '@/lib/utils';

interface Row {
  key: keyof EngineCompatFlags;
  labelKey: string;
  labelFallback: string;
  hintKey: string;
  hintFallback: string;
}

const ROWS: Row[] = [
  {
    key: 'sqlite_all_varchar',
    labelKey: 'settings.engineCompat.sqliteAllVarcharLabel',
    labelFallback: 'SQLite 全文本读取',
    hintKey: 'settings.engineCompat.sqliteAllVarcharHint',
    hintFallback: 'SQLite 列全部按文本读，规避声明类型与实际存储不符的报错；数字列聚合需 CAST',
  },
  {
    key: 'mysql_incomplete_dates_as_nulls',
    labelKey: 'settings.engineCompat.mysqlIncompleteDatesLabel',
    labelFallback: 'MySQL 非法日期读为 NULL',
    hintKey: 'settings.engineCompat.mysqlIncompleteDatesHint',
    hintFallback: '0000-00-00 等零日期不再报错',
  },
  {
    key: 'pg_array_as_varchar',
    labelKey: 'settings.engineCompat.pgArrayLabel',
    labelFallback: 'Postgres 数组按文本读取',
    hintKey: 'settings.engineCompat.pgArrayHint',
    hintFallback: '兼容混合维度数组',
  },
  {
    key: 'unsafe_enable_version_guessing',
    labelKey: 'settings.engineCompat.icebergVersionLabel',
    labelFallback: 'Iceberg 版本推断',
    hintKey: 'settings.engineCompat.icebergVersionHint',
    hintFallback: '读取无 catalog 的本地 Iceberg 目录（unsafe）',
  },
];

export function EngineCompatSettings() {
  const { t } = useTranslation('common');
  const [flags, setFlags] = React.useState<EngineCompatFlags | null>(null);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    getEngineCompat()
      .then(setFlags)
      .catch((e) =>
        showErrorToast(t, e as Error, t('settings.engineCompat.loadFailed', '获取引擎兼容性配置失败'))
      );
  }, [t]);

  if (!flags) return null;

  const handleToggle = async (key: keyof EngineCompatFlags, checked: boolean) => {
    setSavingKey(key);
    const previous = flags[key];
    // 乐观更新
    setFlags((prev) => (prev ? { ...prev, [key]: checked } : prev));
    try {
      const saved = await saveEngineCompat({ [key]: checked });
      setFlags(saved);
      showSuccessToast(t, 'SETTINGS_SAVED', t('settings.engineCompat.saveSuccess', '已保存并生效'));
    } catch (e) {
      setFlags((prev) => (prev ? { ...prev, [key]: previous } : prev));
      showErrorToast(t, e as Error, t('settings.engineCompat.saveFailed', '保存失败'));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4 shrink-0" />
          {t('settings.engineCompat.title', '引擎兼容性')}
        </CardTitle>
        <CardDescription>
          {t(
            'settings.engineCompat.description',
            '兼容脏数据/非标准数据源的读取行为，按需开启，保存后立即生效。'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {ROWS.map((row, idx) => (
          <div
            key={row.key}
            className={cn(
              'flex items-center justify-between gap-4 py-3',
              idx === 0 && 'first:pt-0',
              idx === ROWS.length - 1 && 'last:pb-0'
            )}
          >
            <div className="space-y-0.5 min-w-0">
              <Label htmlFor={`engine-compat-${row.key}`} className="text-sm font-medium">
                {t(row.labelKey, row.labelFallback)}
              </Label>
              <p className="text-xs text-muted-foreground">{t(row.hintKey, row.hintFallback)}</p>
            </div>
            <Switch
              id={`engine-compat-${row.key}`}
              checked={flags[row.key]}
              disabled={savingKey === row.key}
              onCheckedChange={(checked) => handleToggle(row.key, checked)}
              className="data-[state=unchecked]:bg-muted border border-border shadow-sm"
              aria-label={t(row.labelKey, row.labelFallback)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default EngineCompatSettings;
