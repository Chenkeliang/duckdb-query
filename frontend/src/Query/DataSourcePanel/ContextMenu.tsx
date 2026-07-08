import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  Trash2,
  Eye,
  Info,
  RefreshCw,
  Database,
  Download,
  BarChart3
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { executeDuckDBSQL, getExternalTableDetail } from '@/api';
import { openExternal } from '@/desktop/openExternal';
import { exportQueryResults, getQueryExportDownloadUrl } from '@/api/queryExportApi';
import type { SelectedTableObject } from '@/types/SelectedTable';
import { invalidateDuckDBTables } from '@/hooks/useDuckDBTables';
import { invalidateDataSources } from '@/hooks/useDataSources';
import { invalidateAfterTableDelete } from '@/utils/cacheInvalidation';
import { showSuccessToast, showErrorToast, showDownloadStartedToast } from '@/utils/toastHelpers';

/**
 * TableContextMenu 组件
 *
 * 表项的右键菜单
 *
 * Features:
 * - 预览数据（SELECT * LIMIT 100）
 * - 查看结构（显示列信息对话框）- 仅 DuckDB 表
 * - 删除表（确认对话框 + deleteDuckDBTable）- 仅 DuckDB 表
 * - 导入到 DuckDB - 仅外部表
 * - 外部表只显示 Preview 和 Import 选项
 */

interface TableContextMenuProps {
  children: React.ReactNode;
  table: SelectedTableObject;
  canDelete?: boolean; // 是否可以删除（外部表不能删除）
  onPreview?: () => void;
  onProfile?: () => void;
  onDelete?: (tableName: string) => Promise<void> | void;
  onImport?: (table: SelectedTableObject) => void;
}

export const TableContextMenu: React.FC<TableContextMenuProps> = ({
  children,
  table,
  canDelete = true,
  onPreview,
  onProfile,
  onDelete,
  onImport,
}) => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [showStructure, setShowStructure] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [structureData, setStructureData] = React.useState<any[]>([]);
  const [indexData, setIndexData] = React.useState<any[]>([]); // 外部表索引（DuckDB 表无索引概念，不展示）
  const [tableComment, setTableComment] = React.useState<string | null>(null); // Added tableComment state
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
    setStructureData([]);
    setIndexData([]);
    setTableComment(null);

    try {
      if (isExternal && table.connection?.id) {
        const tableData = await getExternalTableDetail(
          table.connection.id,
          table.name,
          table.schema ?? undefined
        );
        const extended = tableData as {
          columns?: unknown[];
          indexes?: unknown[];
          table_comment?: string | null;
        };
        setStructureData(extended.columns ?? []);
        setIndexData(extended.indexes ?? []);
        setTableComment(extended.table_comment ?? null);
      } else {
        // DuckDB: 查询表结构 - 使用双引号包裹表名以支持特殊字符
        // 注意：DESCRIBE 语句不需要 LIMIT，所以 is_preview 设为 false
        const result = await executeDuckDBSQL({
          sql: `DESCRIBE "${table.name}"`,
          isPreview: false
        });
        if (result?.data) {
          setStructureData(result.data);
        }
      }
    } catch (error) {
      showErrorToast(
        t,
        error as Error,
        t('dataSource.getStructureFailed', { error: (error as Error).message })
      );
      setShowStructure(false);
    } finally {
      setLoadingStructure(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const [isExporting, setIsExporting] = React.useState(false);

  const handleExport = async (format: 'csv' | 'parquet') => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const result = await exportQueryResults({
        sql: `SELECT * FROM "${table.name}"`,
        format,
      });
      // 传表名做友好下载文件名(否则浏览器下到的是 query_export.csv)
      const base = getQueryExportDownloadUrl(result.download_url);
      const url = `${base}${base.includes('?') ? '&' : '?'}filename=${encodeURIComponent(table.name)}`;
      openExternal(url);
      showDownloadStartedToast(t, `${table.name}.${format}`);
    } catch (error) {
      showErrorToast(
        t,
        error as Error,
        t('dataSource.exportFailed', { error: (error as Error).message })
      );
    } finally {
      setIsExporting(false);
    }
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
      showSuccessToast(t, 'TABLE_REFRESHED', t('dataSource.refreshSuccess', { tableName: table.name }));
    } catch (error) {
      showErrorToast(
        t,
        error as Error,
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
        const { deleteDuckDBTable } = await import('@/api');
        await deleteDuckDBTable(table.name);
        showSuccessToast(t, 'TABLE_DELETED', t('dataSource.tableDeleted', { tableName: table.name }));

        // 刷新缓存
        await invalidateAfterTableDelete(queryClient);
      }
      setShowDeleteConfirm(false);
    } catch (error) {
      showErrorToast(
        t,
        error as Error,
        t('dataSource.deleteFailed', { error: (error as Error).message })
      );
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

          {/* 导入到 DuckDB - 仅外部表可用 */}
          {isExternal && onImport && (
            <ContextMenuItem onClick={() => onImport(table)}>
              <Database className="mr-2 h-4 w-4" />
              <span>{t('dataSource.importToDuckDB')}</span>
            </ContextMenuItem>
          )}

          {/* 查看结构 - 所有表都可用 */}
          <ContextMenuItem onClick={handleViewStructure}>
            <Info className="mr-2 h-4 w-4" />
            <span>{t('dataSource.viewStructure')}</span>
          </ContextMenuItem>

          {/* 数据画像 - 仅 DuckDB 表（SUMMARIZE，结果进结果网格） */}
          {!isExternal && onProfile && (
            <ContextMenuItem onClick={onProfile}>
              <BarChart3 className="mr-2 h-4 w-4" />
              <span>{t('dataSource.profile')}</span>
            </ContextMenuItem>
          )}

          {/* 导出 - 仅 DuckDB 表（服务端 COPY，支持 CSV / Parquet） */}
          {!isExternal && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Download className="mr-2 h-4 w-4" />
                <span>{t('dataSource.exportTable')}</span>
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem disabled={isExporting} onClick={() => handleExport('csv')}>
                  CSV
                </ContextMenuItem>
                <ContextMenuItem disabled={isExporting} onClick={() => handleExport('parquet')}>
                  Parquet
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}

          {/* DuckDB 表特有选项 - 删除 */}
          {!isExternal && canDelete && onDelete && (
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
        </ContextMenuContent>
      </ContextMenu>

      {/* 查看结构对话框 */}
      <Dialog open={showStructure} onOpenChange={setShowStructure}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col p-0">
          <Tabs defaultValue="columns" className="flex flex-col h-full overflow-hidden">
            <div className="flex flex-col px-6 pt-6 gap-2 shrink-0">
              <DialogTitle className="text-lg font-semibold">{t('dataSource.tableStructure', { tableName: table.name })}</DialogTitle>
              {tableComment && (
                <div className="text-sm text-muted-foreground break-all bg-muted/30 p-2 rounded-md border text-xs max-h-[100px] overflow-y-auto">
                  {tableComment}
                </div>
              )}
            </div>
            <div className="px-6 pb-2 shrink-0">
              <TabsList className="w-full justify-start border-b border-border rounded-none h-auto p-0 bg-transparent">
                <TabsTrigger
                  value="columns"
                  className="rounded-none border-b-2 border-transparent px-4 py-2 hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground bg-transparent shadow-none"
                >
                  {t('dataSource.columns')}
                </TabsTrigger>
                {isExternal && (
                  <TabsTrigger
                    value="indexes"
                    className="rounded-none border-b-2 border-transparent px-4 py-2 hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground bg-transparent shadow-none"
                  >
                    {t('dataSource.indexes')}
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <div className="p-6 pt-2 h-[400px]">
              <TabsContent value="columns" className="h-full m-0">
                <DialogDescription className="sr-only">
                  {t('dataSource.viewColumnInfo')}
                </DialogDescription>
                <div className="h-full overflow-auto border rounded-md">
                  {loadingStructure ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {t('common.loading')}
                    </div>
                  ) : structureData.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 sticky top-0 z-10 backdrop-blur-xs">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('dataSource.columnName')}</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('dataSource.columnType')}</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('dataSource.nullable')}</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('dataSource.key')}</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('dataSource.comment')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {structureData.map((row, idx) => (
                          <tr key={idx} className="border-t border-border hover:bg-muted/20">
                            <td className="px-4 py-2 font-mono text-foreground">
                              {row.column_name || row.Field || row.name}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {row.column_type || row.Type || row.type}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {row.null || row.Null || 'YES'}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground font-mono text-xs">
                              {row.key === 'PRI' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20">
                                  PRI
                                </span>
                              ) : row.key === 'UNI' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                  UNI
                                </span>
                              ) : row.key || row.Key || ''}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground text-xs break-all max-w-[200px]">
                              {row.comment || row.Comment || ''}
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
              </TabsContent>

              {isExternal && (
              <TabsContent value="indexes" className="h-full m-0">
                <div className="h-full overflow-auto border rounded-md">
                  {loadingStructure ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {t('common.loading')}
                    </div>
                  ) : indexData.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 sticky top-0 z-10 backdrop-blur-xs">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('dataSource.indexName')}</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('dataSource.indexType')}</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('dataSource.indexColumns')}</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('dataSource.unique')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {indexData.map((idx, i) => (
                          <tr key={i} className="border-t border-border hover:bg-muted/20">
                            <td className="px-4 py-2 font-mono text-foreground font-medium">{idx.name}</td>
                            <td className="px-4 py-2 text-muted-foreground">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${idx.type === 'PRIMARY' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' :
                                idx.type === 'UNIQUE' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' :
                                  'bg-muted/50 text-muted-foreground border-border'
                                }`}>
                                {idx.type}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-muted-foreground font-mono text-xs break-all max-w-[200px]">{idx.columns}</td>
                            <td className="px-4 py-2 text-muted-foreground">{idx.unique ? 'YES' : 'NO'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      {t('dataSource.noIndexes')}
                    </div>
                  )}
                </div>
              </TabsContent>
              )}
            </div>
            <DialogFooter className="px-6 pb-6 pt-2">
              <Button variant="outline" onClick={() => setShowStructure(false)}>
                {t('common.close')}
              </Button>
            </DialogFooter>
          </Tabs>
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
