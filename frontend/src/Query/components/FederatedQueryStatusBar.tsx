/**
 * 联邦查询状态栏组件
 *
 * 显示当前查询的类型（DuckDB / 外部 / 联邦）和连接的数据库
 *
 * @example
 * ```tsx
 * <FederatedQueryStatusBar
 *   queryType="federated"
 *   attachDatabases={[{ alias: 'mysql_orders', connectionId: '1' }]}
 * />
 * ```
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Link2, HardDrive, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AttachDatabase } from '@/utils/sqlUtils';

export type QueryType = 'duckdb' | 'external' | 'federated';

export interface FederatedQueryStatusBarProps {
  /** 查询类型 */
  queryType: QueryType;
  /** 附加数据库列表 */
  attachDatabases?: AttachDatabase[];
  /** 是否正在执行 */
  isExecuting?: boolean;
  /** 执行时间（毫秒） */
  executionTime?: number;
  /** 自定义类名 */
  className?: string;
}

/**
 * 联邦查询状态栏
 *
 * 显示查询类型和连接状态
 */
export const FederatedQueryStatusBar: React.FC<FederatedQueryStatusBarProps> = ({
  queryType,
  attachDatabases = [],
  isExecuting = false,
  executionTime,
  className = '',
}) => {
  const { t } = useTranslation('common');

  // 获取查询类型图标和标签
  const getQueryTypeInfo = () => {
    switch (queryType) {
      case 'duckdb':
        return {
          icon: <HardDrive className="h-3 w-3" />,
          label: t('query.federated.queryTypeDuckDB', 'DuckDB 本地'),
          variant: 'outline' as const,
          description: t('query.federated.queryTypeDuckDBDesc', '查询仅使用 DuckDB 本地数据'),
        };
      case 'external':
        return {
          icon: <Database className="h-3 w-3" />,
          label: t('query.federated.queryTypeExternal', '外部数据库'),
          variant: 'warning' as const,
          description: t('query.federated.queryTypeExternalDesc', '查询使用外部数据库'),
        };
      case 'federated':
        return {
          icon: <Link2 className="h-3 w-3" />,
          label: t('query.federated.queryTypeFederated', '联邦查询'),
          variant: 'default' as const,
          description: t('query.federated.queryTypeFederatedDesc', '查询跨多个数据源'),
        };
    }
  };

  const typeInfo = getQueryTypeInfo();

  // 格式化执行时间
  const formatExecutionTime = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div
      className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}
    >
      {/* 查询类型 */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Badge
                variant={typeInfo.variant}
                className="gap-1 cursor-help text-xs"
              >
                {typeInfo.icon}
                {typeInfo.label}
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">{typeInfo.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* 连接的数据库数量 */}
      {attachDatabases.length > 0 && (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 cursor-help hover:text-foreground transition-colors"
              >
                <Database className="h-3 w-3" />
                {t('query.federated.connectedDatabases', '{{count}} 个连接', {
                  count: attachDatabases.length,
                })}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              <div className="text-xs space-y-1">
                <div className="font-medium">
                  {t('query.federated.connectedDatabasesList', '连接的数据库:')}
                </div>
                {attachDatabases.map((db) => (
                  <div key={db.connectionId} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    {db.alias}
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* 执行状态 */}
      {isExecuting && (
        <span className="flex items-center gap-1 text-primary">
          <Zap className="h-3 w-3 animate-pulse" />
          {t('query.federated.executing', '执行中...')}
        </span>
      )}

      {/* 执行时间 */}
      {!isExecuting && executionTime !== undefined && (
        <span className="text-muted-foreground">
          {t('query.federated.executionTime', '耗时: {{time}}', {
            time: formatExecutionTime(executionTime),
          })}
        </span>
      )}
    </div>
  );
};

export default FederatedQueryStatusBar;
