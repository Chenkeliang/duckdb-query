/**
 * 附加数据库指示器组件
 *
 * 显示联邦查询中将要连接的外部数据库列表
 *
 * @example
 * ```tsx
 * <AttachedDatabasesIndicator
 *   attachDatabases={[
 *     { alias: 'mysql_orders', connectionId: '1' },
 *     { alias: 'postgres_users', connectionId: '2' },
 *   ]}
 * />
 * ```
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Database, AlertCircle } from 'lucide-react';
import { Badge } from '@/new/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/new/components/ui/tooltip';
import type { AttachDatabase } from '@/new/utils/sqlUtils';

export interface AttachedDatabasesIndicatorProps {
  /** 附加数据库列表 */
  attachDatabases: AttachDatabase[];
  /** 是否显示详细信息 */
  showDetails?: boolean;
  /** 连接状态（可选） */
  connectionStatus?: Record<string, 'connected' | 'disconnected' | 'connecting' | 'error'>;
  /** 自定义类名 */
  className?: string;
  /** 变体样式 */
  variant?: 'default' | 'compact' | 'detailed';
}

/**
 * 附加数据库指示器
 *
 * 显示联邦查询中将要连接的外部数据库
 */
export const AttachedDatabasesIndicator: React.FC<AttachedDatabasesIndicatorProps> = ({
  attachDatabases,
  showDetails = true,
  connectionStatus,
  className = '',
  variant = 'default',
}) => {
  const { t } = useTranslation('common');

  // 如果没有附加数据库，不显示
  if (attachDatabases.length === 0) {
    return null;
  }

  // 获取连接状态图标
  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'connected':
        return <span className="w-2 h-2 rounded-full bg-success" />;
      case 'connecting':
        return <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-error" />;
      case 'disconnected':
      default:
        return <span className="w-2 h-2 rounded-full bg-muted-foreground" />;
    }
  };

  // 紧凑模式
  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`text-primary border-primary/50 cursor-help ${className}`}>
              <Link2 className="w-3 h-3 mr-1" />
              {attachDatabases.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="text-xs space-y-1">
              <div className="font-medium mb-1">
                {t('query.federated.attachedDatabasesTitle', '将连接的数据库:')}
              </div>
              {attachDatabases.map((db) => (
                <div key={db.connectionId} className="flex items-center gap-2">
                  {connectionStatus && getStatusIcon(connectionStatus[db.connectionId])}
                  <Database className="w-3 h-3 text-muted-foreground" />
                  <span>{db.alias}</span>
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // 详细模式
  if (variant === 'detailed') {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="w-4 h-4 text-primary" />
          {t('query.federated.attachedDatabases', '{{count}} 个外部数据库', {
            count: attachDatabases.length,
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {attachDatabases.map((db) => (
            <Badge
              key={db.connectionId}
              variant="outline"
              className="text-xs flex items-center gap-1"
            >
              {connectionStatus && getStatusIcon(connectionStatus[db.connectionId])}
              <Database className="w-3 h-3" />
              {db.alias}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  // 默认模式
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`text-primary border-primary/50 cursor-help ${className}`}
          >
            <Link2 className="w-3 h-3 mr-1" />
            {t('query.federated.attachedDatabases', '{{count}} 个外部数据库', {
              count: attachDatabases.length,
            })}
          </Badge>
        </TooltipTrigger>
        {showDetails && (
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="text-xs space-y-1">
              <div className="font-medium mb-1">
                {t('query.federated.attachedDatabasesTitle', '将连接的数据库:')}
              </div>
              {attachDatabases.map((db) => (
                <div key={db.connectionId} className="flex items-center gap-2">
                  {connectionStatus && getStatusIcon(connectionStatus[db.connectionId])}
                  <Database className="w-3 h-3 text-muted-foreground" />
                  <span>{db.alias}</span>
                </div>
              ))}
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
};

export default AttachedDatabasesIndicator;
