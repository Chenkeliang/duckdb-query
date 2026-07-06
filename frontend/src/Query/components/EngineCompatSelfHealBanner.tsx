/**
 * 引擎兼容性自愈横幅
 *
 * 当 SQL 执行错误命中 engineCompatSelfHeal 匹配表中的已知场景时（目前仅 SQLite
 * 类型不一致一种），显示横幅提示，并提供一键"开启兼容模式并重跑"按钮。
 *
 * @example
 * ```tsx
 * <EngineCompatSelfHealBanner
 *   errorMessage={error.message}
 *   onRerun={() => refreshQuery()}
 * />
 * ```
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Wrench, Loader2, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { saveEngineCompat } from '@/api/engineCompatApi';
import { matchEngineCompatSelfHeal } from '@/utils/engineCompatSelfHeal';
import { showErrorToast } from '@/utils/toastHelpers';

export interface EngineCompatSelfHealBannerProps {
  /** 查询执行失败的错误 message */
  errorMessage: string;
  /** 兼容模式保存成功后调用，用同一 SQL 重跑（由父组件提供，如"刷新结果"） */
  onRerun: () => void | Promise<void>;
  /** 手动关闭横幅 */
  onDismiss?: () => void;
  className?: string;
}

export const EngineCompatSelfHealBanner: React.FC<EngineCompatSelfHealBannerProps> = ({
  errorMessage,
  onRerun,
  onDismiss,
  className = '',
}) => {
  const { t } = useTranslation('common');
  const [dismissed, setDismissed] = React.useState(false);
  const [healing, setHealing] = React.useState(false);

  const scenario = React.useMemo(
    () => matchEngineCompatSelfHeal(errorMessage),
    [errorMessage]
  );

  // 错误内容变化（新的一次执行）时，重新展示横幅
  React.useEffect(() => {
    setDismissed(false);
  }, [errorMessage]);

  if (!scenario || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const handleHeal = async () => {
    setHealing(true);
    try {
      await saveEngineCompat({ [scenario.configKey]: true });
      await onRerun();
    } catch (e) {
      showErrorToast(
        t,
        e as Error,
        t('query.result.selfHeal.saveFailed', '开启兼容模式失败')
      );
    } finally {
      setHealing(false);
    }
  };

  return (
    <Alert variant="destructive" className={`relative ${className}`}>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6"
        onClick={handleDismiss}
        aria-label={t('common.close', '关闭')}
      >
        <X className="h-4 w-4" />
      </Button>

      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t(scenario.titleKey, scenario.titleFallback)}</AlertTitle>
      <AlertDescription className="mt-2">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t(scenario.descriptionKey, scenario.descriptionFallback)}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={healing}
            onClick={handleHeal}
            className="gap-1"
          >
            {healing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Wrench className="h-3 w-3" />
            )}
            {t(scenario.actionKey, scenario.actionFallback)}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default EngineCompatSelfHealBanner;
