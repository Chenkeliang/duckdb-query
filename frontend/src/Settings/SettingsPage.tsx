/**
 * 设置页面
 */

import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { ShortcutSettings } from './shortcuts';
import { CacheSettings } from './CacheSettings';
import { QueryResultSettings } from './QueryResultSettings';
import { DataGridSettings } from './DataGridSettings';
import { EngineCompatSettings } from './EngineCompatSettings';
import { AboutUpdateSettings } from './AboutUpdateSettings';

// 目前无 props，保留占位类型以便后续扩展
export type SettingsPageProps = Record<string, never>;

/**
 * 设置页面组件
 */
export function SettingsPage({}: SettingsPageProps) {
  const { t } = useTranslation('common');

  return (
    <div className="flex flex-col h-full">
      {/* 设置内容 - 外层 Header 已经显示标题，这里不再重复 */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 快捷键设置 */}
          <ShortcutSettings />

          {/* 查询结果 */}
          <QueryResultSettings />

          {/* 结果表显示 */}
          <DataGridSettings />

          {/* 引擎兼容性 */}
          <EngineCompatSettings />

          {/* 缓存设置 */}
          <CacheSettings />

          {/* 关于与更新(仅桌面渲染) */}
          <AboutUpdateSettings />

          {/* 开发中提示 */}
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground">
                <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {t('settings.comingSoon', '更多设置功能正在开发中...')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
