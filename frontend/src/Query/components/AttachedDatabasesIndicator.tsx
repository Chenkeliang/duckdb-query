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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Database, AlertCircle, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AttachDatabase, DatabaseConnection } from '@/utils/sqlUtils';

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
  variant?: 'default' | 'compact' | 'detailed' | 'expandable';
  /** 可用的数据库连接（用于手动添加） */
  availableConnections?: DatabaseConnection[];
  /** 手动添加数据库回调 */
  onAddDatabase?: (database: AttachDatabase) => void;
  /** 手动移除数据库回调 */
  onRemoveDatabase?: (connectionId: string) => void;
  /** 是否允许编辑 */
  editable?: boolean;
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
  availableConnections = [],
  onAddDatabase,
  onRemoveDatabase,
  editable = false,
}) => {
  const { t } = useTranslation('common');
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');

  // 获取连接状态图标
  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'connected':
        return <span className="w-2 h-2 rounded-full bg-success" />;
      case 'connecting':
        return <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-destructive" />;
      case 'disconnected':
      default:
        return <span className="w-2 h-2 rounded-full bg-muted-foreground" />;
    }
  };

  // 获取未添加的连接
  const getAvailableToAdd = () => {
    const addedIds = new Set(attachDatabases.map((db) => db.connectionId));
    return availableConnections.filter((conn) => !addedIds.has(conn.id));
  };

  // 处理添加数据库
  const handleAddDatabase = () => {
    if (!selectedConnectionId || !onAddDatabase) return;

    const connection = availableConnections.find((c) => c.id === selectedConnectionId);
    if (connection) {
      onAddDatabase({
        alias: connection.name,
        connectionId: connection.id,
      });
      setSelectedConnectionId('');
    }
  };

  // 如果没有附加数据库且不可编辑，不显示
  if (attachDatabases.length === 0 && !editable) {
    return null;
  }

  // 紧凑模式
  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Badge variant="outline" className={`text-primary border-primary/50 cursor-help ${className}`}>
                <Link2 className="w-3 h-3 mr-1" />
                {attachDatabases.length}
              </Badge>
            </span>
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
              {editable && onRemoveDatabase && (
                <button
                  onClick={() => onRemoveDatabase(db.connectionId)}
                  className="ml-1 hover:text-destructive"
                  aria-label={t('common.remove', '移除')}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  // 可展开模式
  if (variant === 'expandable') {
    const availableToAdd = getAvailableToAdd();

    return (
      <Popover open={isExpanded} onOpenChange={setIsExpanded}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-primary border-primary/50 cursor-pointer hover:bg-primary/10 ${className}`}
          >
            <Link2 className="w-3 h-3 mr-1" />
            {attachDatabases.length > 0
              ? t('query.federated.attachedDatabases', '{{count}} 个外部数据库', {
                  count: attachDatabases.length,
                })
              : t('query.federated.noAttachedDatabases', '无外部数据库')}
            {isExpanded ? (
              <ChevronUp className="w-3 h-3 ml-1" />
            ) : (
              <ChevronDown className="w-3 h-3 ml-1" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-3">
            <div className="font-medium text-sm">
              {t('query.federated.manageDatabases', '管理外部数据库')}
            </div>

            {/* 已添加的数据库列表 */}
            {attachDatabases.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  {t('query.federated.connectedDatabasesList', '已连接:')}
                </div>
                <div className="space-y-1">
                  {attachDatabases.map((db) => (
                    <div
                      key={db.connectionId}
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        {connectionStatus && getStatusIcon(connectionStatus[db.connectionId])}
                        <Database className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{db.alias}</span>
                      </div>
                      {editable && onRemoveDatabase && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => onRemoveDatabase(db.connectionId)}
                          aria-label={t('common.remove', '移除')}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 添加新数据库 */}
            {editable && onAddDatabase && availableToAdd.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <div className="text-xs text-muted-foreground">
                  {t('query.federated.addDatabase', '添加数据库:')}
                </div>
                <div className="flex gap-2">
                  <Select
                    value={selectedConnectionId}
                    onValueChange={setSelectedConnectionId}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue
                        placeholder={t('query.federated.selectConnection', '选择连接')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableToAdd.map((conn) => (
                        <SelectItem key={conn.id} value={conn.id}>
                          <div className="flex items-center gap-2">
                            <Database className="w-4 h-4" />
                            {conn.name}
                            <span className="text-xs text-muted-foreground">
                              ({conn.type})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleAddDatabase}
                    disabled={!selectedConnectionId}
                    aria-label={t('common.add', '添加')}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* 无可用连接提示 */}
            {editable && availableToAdd.length === 0 && attachDatabases.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-2">
                {t('query.federated.noConnectionsAvailable', '暂无可用的数据库连接')}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // 默认模式
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Badge
              variant="outline"
              className={`text-primary border-primary/50 cursor-help ${className}`}
            >
              <Link2 className="w-3 h-3 mr-1" />
              {t('query.federated.attachedDatabases', '{{count}} 个外部数据库', {
                count: attachDatabases.length,
              })}
            </Badge>
          </span>
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
