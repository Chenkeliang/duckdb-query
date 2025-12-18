/**
 * 缓存设置组件
 *
 * 用于配置 TanStack Query 的缓存有效期
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/new/components/ui/card';
import { Button } from '@/new/components/ui/button';
import { Input } from '@/new/components/ui/input';
import { Label } from '@/new/components/ui/label';
import { Separator } from '@/new/components/ui/separator';
import {
  useCacheSettings,
  DEFAULT_CACHE_DURATION,
  MIN_CACHE_DURATION,
  MAX_CACHE_DURATION,
} from '@/new/hooks/useCacheSettings';

/**
 * 缓存设置组件
 */
export function CacheSettings() {
  const { t } = useTranslation('common');
  const { settings, updateSettings, resetToDefaults, clearAllCache, isLoading } =
    useCacheSettings();

  const [inputValue, setInputValue] = React.useState<string>(
    String(settings.cacheDuration)
  );

  // 同步外部设置变化
  React.useEffect(() => {
    setInputValue(String(settings.cacheDuration));
  }, [settings.cacheDuration]);

  /**
   * 处理输入变化
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  /**
   * 处理输入失焦时保存
   */
  const handleInputBlur = () => {
    const numValue = parseInt(inputValue, 10);

    if (isNaN(numValue) || numValue < MIN_CACHE_DURATION) {
      // 无效输入，恢复为当前设置
      setInputValue(String(settings.cacheDuration));
      return;
    }

    // 限制最大值
    const clampedValue = Math.min(numValue, MAX_CACHE_DURATION);

    if (clampedValue !== settings.cacheDuration) {
      const success = updateSettings({ cacheDuration: clampedValue });
      if (success) {
        toast.success(
          t('settings.cache.saveSuccess', '缓存设置已保存')
        );
      } else {
        toast.error(t('settings.cache.saveFailed', '保存缓存设置失败'));
        setInputValue(String(settings.cacheDuration));
      }
    }

    setInputValue(String(clampedValue));
  };

  /**
   * 处理回车键保存
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  /**
   * 重置为默认值
   */
  const handleReset = () => {
    const success = resetToDefaults();
    if (success) {
      setInputValue(String(DEFAULT_CACHE_DURATION));
      toast.success(
        t('settings.cache.resetSuccess', '已重置为默认值')
      );
    } else {
      toast.error(t('settings.cache.resetFailed', '重置失败'));
    }
  };

  /**
   * 清除所有缓存
   */
  const handleClearCache = async () => {
    try {
      await clearAllCache();
      toast.success(
        t('settings.cache.clearSuccess', '已清除所有缓存')
      );
    } catch {
      toast.error(t('settings.cache.clearFailed', '清除缓存失败'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          {t('settings.cache.title', '缓存设置')}
        </CardTitle>
        <CardDescription>
          {t('settings.cache.description', '配置查询数据的缓存有效期')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* 缓存有效期配置 */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="cache-duration">
                {t('settings.cache.duration', '缓存有效期')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t(
                  'settings.cache.durationDesc',
                  '数据在缓存中保持新鲜的时间（分钟）'
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="cache-duration"
                type="number"
                min={MIN_CACHE_DURATION}
                max={MAX_CACHE_DURATION}
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleKeyDown}
                className="w-20 text-center"
              />
              <span className="text-sm text-muted-foreground">
                {t('settings.cache.minutes', '分钟')}
              </span>
            </div>
          </div>

          <Separator />

          {/* 操作按钮 */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t(
                'settings.cache.actionsDesc',
                '重置设置或清除所有缓存数据'
              )}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={settings.cacheDuration === DEFAULT_CACHE_DURATION}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('settings.cache.reset', '重置为默认值')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearCache}
                disabled={isLoading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('settings.cache.clear', '清除所有缓存')}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CacheSettings;
