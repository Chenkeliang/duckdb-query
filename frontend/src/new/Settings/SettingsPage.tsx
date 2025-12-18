/**
 * 设置页面
 */

import { useTranslation } from 'react-i18next';
import { Settings, Database, Palette, Globe, Shield } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/new/components/ui/card';
import { Button } from '@/new/components/ui/button';
import { Separator } from '@/new/components/ui/separator';
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
          {/* 数据库设置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                {t('settings.database.title', '数据库设置')}
              </CardTitle>
              <CardDescription>
                {t('settings.database.description', '管理数据库连接和配置')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{t('settings.database.connections', '数据库连接')}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.database.connectionsDesc', '管理 MySQL、PostgreSQL、SQLite 连接')}
                    </p>
                  </div>
                  <Button variant="outline" disabled>
                    {t('settings.database.manage', '管理连接')}
                  </Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{t('settings.database.cache', '查询缓存')}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.database.cacheDesc', '配置查询结果缓存策略')}
                    </p>
                  </div>
                  <Button variant="outline" disabled>
                    {t('settings.database.configure', '配置')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 快捷键设置 */}
          <ShortcutSettings />

          {/* 缓存设置 */}
          <CacheSettings />

          {/* 界面设置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                {t('settings.ui.title', '界面设置')}
              </CardTitle>
              <CardDescription>
                {t('settings.ui.description', '自定义界面外观和行为')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{t('settings.ui.theme', '主题')}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.ui.themeDesc', '选择浅色或深色主题')}
                    </p>
                  </div>
                  <Button variant="outline" disabled>
                    {t('settings.ui.changeTheme', '切换主题')}
                  </Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{t('settings.ui.layout', '布局')}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.ui.layoutDesc', '调整面板布局和大小')}
                    </p>
                  </div>
                  <Button variant="outline" disabled>
                    {t('settings.ui.resetLayout', '重置布局')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 语言设置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {t('settings.language.title', '语言设置')}
              </CardTitle>
              <CardDescription>
                {t('settings.language.description', '选择界面语言')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{t('settings.language.current', '当前语言')}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.language.currentDesc', '简体中文')}
                  </p>
                </div>
                <Button variant="outline" disabled>
                  {t('settings.language.change', '更改语言')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 安全设置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                {t('settings.security.title', '安全设置')}
              </CardTitle>
              <CardDescription>
                {t('settings.security.description', '管理安全和隐私设置')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{t('settings.security.password', '密码管理')}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.security.passwordDesc', '管理保存的数据库密码')}
                    </p>
                  </div>
                  <Button variant="outline" disabled>
                    {t('settings.security.manage', '管理')}
                  </Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{t('settings.security.audit', '审计日志')}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.security.auditDesc', '查看操作日志和安全事件')}
                    </p>
                  </div>
                  <Button variant="outline" disabled>
                    {t('settings.security.viewLogs', '查看日志')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

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
