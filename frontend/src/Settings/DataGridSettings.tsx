import { useTranslation } from 'react-i18next';
import { Table2 } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDataGridSettings } from '@/hooks/useDataGridSettings';
import type { DataGridRowHeight } from '@/utils/dataGridSettingsStorage';
import { showSuccessToast, showErrorToast } from '@/utils/toastHelpers';

export function DataGridSettings() {
  const { t } = useTranslation('common');
  const { settings, updateSettings, isLoading } = useDataGridSettings();

  const persist = (patch: Parameters<typeof updateSettings>[0]) => {
    const ok = updateSettings(patch);
    if (ok) {
      showSuccessToast(t, 'SETTINGS_SAVED', t('settings.dataGrid.saveSuccess', '结果表设置已保存'));
    } else {
      showErrorToast(t, 'SETTINGS_SAVE_FAILED', t('settings.dataGrid.saveFailed', '保存失败'));
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Table2 className="h-4 w-4 shrink-0" />
          {t('settings.dataGrid.title', '结果表显示')}
        </CardTitle>
        <CardDescription>
          {t('settings.dataGrid.description', '调整查询结果表格的显示方式。')}
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {/* 双色斑马行 */}
        <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
          <div className="space-y-0.5 min-w-0">
            <Label htmlFor="dg-zebra" className="text-sm font-medium">
              {t('settings.dataGrid.zebraLabel', '双色斑马行')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.dataGrid.zebraHint', '相邻行用浅色背景交替，便于横向阅读。')}
            </p>
          </div>
          <Switch
            id="dg-zebra"
            checked={settings.zebraStripes}
            disabled={isLoading}
            onCheckedChange={(checked) => persist({ zebraStripes: checked })}
            className="data-[state=unchecked]:bg-muted border border-border shadow-sm"
            aria-label={t('settings.dataGrid.zebraLabel', '双色斑马行')}
          />
        </div>

        {/* 行高 */}
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="space-y-0.5 min-w-0">
            <Label className="text-sm font-medium">
              {t('settings.dataGrid.rowHeightLabel', '行高')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.dataGrid.rowHeightHint', '更小的行高可在一屏内看到更多数据。')}
            </p>
          </div>
          <Select
            value={String(settings.rowHeight)}
            disabled={isLoading}
            onValueChange={(v) => persist({ rowHeight: Number(v) as DataGridRowHeight })}
          >
            <SelectTrigger className="h-8 w-32 shrink-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="28">{t('settings.dataGrid.rowHeightCompact', '紧凑')}</SelectItem>
              <SelectItem value="32">{t('settings.dataGrid.rowHeightNormal', '默认')}</SelectItem>
              <SelectItem value="40">{t('settings.dataGrid.rowHeightComfortable', '宽松')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 自动列宽 */}
        <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
          <div className="space-y-0.5 min-w-0">
            <Label htmlFor="dg-autofit" className="text-sm font-medium">
              {t('settings.dataGrid.autoFitLabel', '自动列宽')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.dataGrid.autoFitHint', '新结果加载时按内容自动调整列宽；关闭后用固定默认宽度。')}
            </p>
          </div>
          <Switch
            id="dg-autofit"
            checked={settings.autoFitOnLoad}
            disabled={isLoading}
            onCheckedChange={(checked) => persist({ autoFitOnLoad: checked })}
            className="data-[state=unchecked]:bg-muted border border-border shadow-sm"
            aria-label={t('settings.dataGrid.autoFitLabel', '自动列宽')}
          />
        </div>
      </CardContent>
    </Card>
  );
}
