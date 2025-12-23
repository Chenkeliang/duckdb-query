/**
 * 设置页面
 */

import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';

import { Card, CardContent } from '@/new/components/ui/card';
import { ShortcutSettings } from './shortcuts';
import { CacheSettings } from './CacheSettings';

export interface SettingsPageProps {
  // 可以添加 props
}

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

          {/* 缓存设置 */}
          <CacheSettings />

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
