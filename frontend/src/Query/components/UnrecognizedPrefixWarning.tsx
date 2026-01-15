/**
 * 未识别前缀警告组件
 *
 * 当 SQL 中包含无法匹配到已配置数据库连接的前缀时显示警告
 *
 * @example
 * ```tsx
 * <UnrecognizedPrefixWarning
 *   prefixes={['unknown_db', 'other_db']}
 *   onConfigureConnection={(prefix) => openConnectionDialog(prefix)}
 *   onIgnore={() => executeQuery()}
 * />
 * ```
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Settings, Play, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface UnrecognizedPrefixWarningProps {
  /** 未识别的前缀列表 */
  prefixes: string[];
  /** 点击"配置连接"时的回调 */
  onConfigureConnection?: (prefix: string) => void;
  /** 点击"忽略并执行"时的回调 */
  onIgnore?: () => void;
  /** 点击关闭时的回调 */
  onDismiss?: () => void;
  /** 是否可关闭 */
  dismissible?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 未识别前缀警告
 *
 * 显示 SQL 中无法识别的数据库前缀，并提供配置或忽略选项
 */
export const UnrecognizedPrefixWarning: React.FC<UnrecognizedPrefixWarningProps> = ({
  prefixes,
  onConfigureConnection,
  onIgnore,
  onDismiss,
  dismissible = true,
  className = '',
}) => {
  const { t } = useTranslation('common');

  // 如果没有未识别的前缀，不显示
  if (prefixes.length === 0) {
    return null;
  }

  return (
    <Alert variant="destructive" className={`relative ${className}`}>
      {dismissible && onDismiss && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-6 w-6"
          onClick={onDismiss}
          aria-label={t('common.close', '关闭')}
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {t('query.federated.unrecognizedPrefixTitle', '发现未识别的数据库前缀')}
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="space-y-3">
          {/* 前缀列表 */}
          <div className="flex flex-wrap gap-2">
            {prefixes.map((prefix) => (
              <Badge
                key={prefix}
                variant="outline"
                className="text-destructive border-destructive/50"
              >
                {prefix}
              </Badge>
            ))}
          </div>

          {/* 说明文本 */}
          <p className="text-sm text-muted-foreground">
            {t(
              'query.federated.unrecognizedPrefixDescription',
              '这些前缀在 SQL 中被引用，但未找到对应的数据库连接配置。您可以配置新连接或忽略此警告继续执行。'
            )}
          </p>

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-2 pt-1">
            {onConfigureConnection && prefixes.length === 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onConfigureConnection(prefixes[0])}
                className="gap-1"
              >
                <Settings className="h-3 w-3" />
                {t('query.federated.configureConnection', '配置连接')}
              </Button>
            )}

            {onConfigureConnection && prefixes.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onConfigureConnection(prefixes[0])}
                className="gap-1"
              >
                <Settings className="h-3 w-3" />
                {t('query.federated.configureConnections', '配置连接')}
              </Button>
            )}

            {onIgnore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onIgnore}
                className="gap-1"
              >
                <Play className="h-3 w-3" />
                {t('query.federated.ignoreAndExecute', '忽略并执行')}
              </Button>
            )}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default UnrecognizedPrefixWarning;
