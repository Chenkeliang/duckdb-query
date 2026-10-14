import { SettingsSectionHeader } from "./SettingsSectionHeader";
import { useTranslation } from 'react-i18next';
import { Table2 } from 'lucide-react';

import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useQueryResultSettings } from '@/hooks/useQueryResultSettings';
import { MAX_RESULT_TABS } from '@/Query/ResultPanel/resultTabUtils';
import { showSuccessToast, showErrorToast } from '@/utils/toastHelpers';

export function QueryResultSettings() {
  const { t } = useTranslation('common');
  const { retainQueryResults, updateSettings, isLoading } = useQueryResultSettings();

  const handleToggle = (checked: boolean) => {
    const ok = updateSettings({ retainQueryResults: checked });
    if (ok) {
      showSuccessToast(t, 'SETTINGS_SAVED', t('settings.queryResult.saveSuccess', '查询结果设置已保存'));
    } else {
      showErrorToast(t, 'SETTINGS_SAVE_FAILED', t('settings.queryResult.saveFailed', '保存失败'));
    }
  };

  return (
    <Card className="rounded-none border-0 bg-transparent shadow-none">
      <SettingsSectionHeader
        icon={Table2}
        title={<> {t('settings.queryResult.title', '查询结果')} </>}
        description={<> {t(
                'settings.queryResult.description',
                '类似 DataGrip：开启后每次成功的 SQL 执行会保留独立结果 Tab，便于对比历史结果。'
              )} </>}
        actions={<div className="flex shrink-0 items-center gap-2">
            <Label
              htmlFor="retain-query-results"
              className="text-xs text-muted-foreground font-normal"
            >
              {retainQueryResults
                ? t('settings.queryResult.on', '已开启')
                : t('settings.queryResult.off', '已关闭')}
            </Label>
            <Switch
              id="retain-query-results"
              checked={retainQueryResults}
              disabled={isLoading}
              onCheckedChange={handleToggle}
              className="data-[state=unchecked]:bg-muted border border-border shadow-sm"
              aria-label={t('settings.queryResult.retainLabel', '保留查询结果')}
            />
          </div>}
      />
      <CardContent className="px-0 pb-0">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t(
            'settings.queryResult.retainHint',
            '开启后最多保留 {{max}} 个结果 Tab（结果_1、结果_2…）；关闭时仅显示一个结果区，标题为表名。',
            { max: MAX_RESULT_TABS }
          )}
        </p>
      </CardContent>
    </Card>
  );
}
