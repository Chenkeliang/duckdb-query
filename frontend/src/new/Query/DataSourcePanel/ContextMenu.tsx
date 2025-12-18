import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, Info, Trash2, Download, RefreshCw } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/new/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/new/components/ui/dialog';
import { Button } from '@/new/components/ui/button';
import { toast } from 'sonner';
import { executeDuckDBSQL } from '@/services/apiClient';
import type { SelectedTableObject } from '@/new/types/SelectedTable';
import { invalidateDuckDBTables } from '@/new/hooks/useDuckDBTables';
import { invalidateDataSources } from '@/new/hooks/useDataSources';

/**
 * TableContextMenu 组件
 * 
 * 表项的右键菜单
 * 
 * Features:
 * - 预览数据（SELECT * LIMIT 100）
 * - 查看结构（显示列信息对话框）- 仅 DuckDB 表
 * - 删除表（确认对话框 + deleteDuckDBTableEnhanced）- 仅 DuckDB 表
 * - 导入到 DuckDB - 仅外部表
 * - 外部表只显示 Preview 和 Import 选项
 */

interface TableContextMenuProps {
  children: React.ReactNode;
  table: SelectedTableObject;
  canDelete?: boolean; // 是否可以删除（外部表不能删除）
  onPreview?: () => void;
  onDelete?: (tableName: string) => Promise<void> | void;
  onImport?: (table: SelectedTableObject) => void; // 导入到 DuckDB
}

export const TableContextMenu: React.FC<TableContextMenuProps> = ({
  children,
  table,
  canDelete = true,
  onPreview,
  onDelete,
  onImport,
}) => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [showStructure, setShowStructure] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [structureData, setStructureData] = React.useState<any[]>([]);
  const [loadingStructure, setLoadingStructure] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const isExternal = table.source === 'external';

  const handlePreview = () => {
    if (onPreview) {
      onPreview();
    } else {
      // 默认行为：执行预览查询
      toast.info(t('dataSource.previewTable', { tableName: table.name }));
    }
  };

  const handleViewStructure = async () => {
    setShowStructure(true);
    setLoadingStructure(true);
    
    try {
      if (isExternal && table.connection?.id) {
        const params = new URLSearchParams();
        if (table.schema) params.set('schema', table.schema);
        const resp = await fetch(
          `/api/database_table_details/${table.connection.id}/${encodeURIComponent(table.name)}${params.toString() ? `?${params.toString()}` : ''}`
        );
        if (!resp.ok) {
          throw new Error(await resp.text());
        }
        const data = await resp.json();
        setStructureData(data?.columns || []);
      } else {
        // DuckDB: 查询表结构 - 使用双引号包裹表名以支持特殊字符
        // 注意：DESCRIBE 语句不需要 LIMIT，所以 is_preview 设为 false
        const result = await executeDuckDBSQL(`DESCRIBE "${table.name}"`, null, false);
        if (result?.data) {
          setStructureData(result.data);
        }
      }
    } catch (error) {
      toast.error(t('dataSource.getStructureFailed', { error: (error as Error).message }));
      setShowStructure(false);
    } finally {
      setLoadingStructure(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  /**
   * 刷新表信息
   * 清除该表相关的缓存并重新获取
   */
  const handleRefreshTableInfo = async () => {
    setIsRefreshing(true);
    try {
      // 清除表列表和数据源缓存
      await Promise.all([
        invalidateDuckDBTables(queryClient),
        invalidateDataSources(queryClient),
      ]);
      toast.success(t('dataSource.refreshSuccess', { tableName: table.name }));
    } catch (error) {
      toast.error(
        t('dataSource.refreshFailed', { error: (error as Error).message })
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const confirmDelete = async () => {
    try {
      if (onDelete) {
        await onDelete(table.name);
      } else {
        // 默认行为：调用删除 API（使用增强版本）
        const { deleteDuckDBTableEnhanced } = await import('@/services/apiClient');
        await deleteDuckDBTableEnhanced(table.name);
        toast.success(t('dataSource.tableDeleted', { tableName: table.name }));
      }
      setShowDeleteConfirm(false);
    } catch (error) {
      toast.error(t('dataSource.deleteFailed', { error: (error as Error).message }));
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {/* 预览数据 - 所有表都可用 */}
          <ContextMenuItem onClick={handlePreview}>
            <Eye className="mr-2 h-4 w-4" />
            <span>{t('dataSource.previewData')}</span>
          </ContextMenuItem>

          {/* 刷新表信息 - 所有表都可用 */}
          <ContextMenuItem onClick={handleRefreshTableInfo} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{t('dataSource.refreshTableInfo')}</span>
          </ContextMenuItem>

          {/* 外部表特有选项 */}
          {isExternal && onImport && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onImport(table)}>
                <Download className="mr-2 h-4 w-4" />
                <span>{t('dataSource.importToDuckDB')}</span>
              </ContextMenuItem>
            </>
          )}

          {/* DuckDB 表特有选项 */}
          {!isExternal && (
            <>
              <ContextMenuItem onClick={handleViewStructure}>
                <Info className="mr-2 h-4 w-4" />
                <span>{t('dataSource.viewStructure')}</span>
              </ContextMenuItem>
              {canDelete && onDelete && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={handleDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>{t('dataSource.deleteTable')}</span>
                  </ContextMenuItem>
                </>
              )}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* 查看结构对话框 */}
      <Dialog open={showStructure} onOpenChange={setShowStructure}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('dataSource.tableStructure', { tableName: table.name })}</DialogTitle>
            <DialogDescription>
              {t('dataSource.viewColumnInfo')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-96 overflow-auto">
            {loadingStructure ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : structureData.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">{t('dataSource.columnName')}</th>
                    <th className="px-4 py-2 text-left font-medium">{t('dataSource.columnType')}</th>
                    <th className="px-4 py-2 text-left font-medium">{t('dataSource.nullable')}</th>
                  </tr>
                </thead>
                <tbody>
                  {structureData.map((row, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-foreground">
                        {row.column_name || row.Field || row.name}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {row.column_type || row.Type || row.type}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {row.null || row.Null || 'YES'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t('common.noData')}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStructure(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.confirmDelete')}</DialogTitle>
            <DialogDescription>
              {t('dataSource.confirmDeleteTable', { tableName: table.name })}
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
