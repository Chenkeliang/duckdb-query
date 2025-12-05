import * as React from 'react';
import { Eye, Info, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
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

/**
 * TableContextMenu 组件
 * 
 * 表项的右键菜单
 * 
 * Features:
 * - 预览数据（SELECT * LIMIT 100）
 * - 查看结构（显示列信息对话框）
 * - 删除表（确认对话框 + deleteDuckDBTableEnhanced）
 * - 外部表禁用删除选项（只能删除 DuckDB 表）
 */

interface TableContextMenuProps {
  children: React.ReactNode;
  tableName: string;
  canDelete?: boolean; // 是否可以删除（外部表不能删除）
  onPreview?: (tableName: string) => void;
  onDelete?: (tableName: string) => void;
}

export const TableContextMenu: React.FC<TableContextMenuProps> = ({
  children,
  tableName,
  canDelete = true,
  onPreview,
  onDelete,
}) => {
  const [showStructure, setShowStructure] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [structureData, setStructureData] = React.useState<any[]>([]);
  const [loadingStructure, setLoadingStructure] = React.useState(false);

  const handlePreview = () => {
    if (onPreview) {
      onPreview(tableName);
    } else {
      // 默认行为：执行预览查询
      toast.info(`预览表: ${tableName}`);
    }
  };

  const handleViewStructure = async () => {
    setShowStructure(true);
    setLoadingStructure(true);
    
    try {
      // 查询表结构
      const result = await executeDuckDBSQL(
        `DESCRIBE ${tableName}`,
        null,
        true
      );
      
      if (result?.data) {
        setStructureData(result.data);
      }
    } catch (error) {
      toast.error(`获取表结构失败: ${(error as Error).message}`);
      setShowStructure(false);
    } finally {
      setLoadingStructure(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      if (onDelete) {
        onDelete(tableName);
      } else {
        // 默认行为：调用删除 API
        const { deleteDuckDBTable } = await import('@/services/apiClient');
        await deleteDuckDBTable(tableName);
        toast.success(`表 ${tableName} 已删除`);
      }
      setShowDeleteConfirm(false);
    } catch (error) {
      toast.error(`删除失败: ${(error as Error).message}`);
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={handlePreview}>
            <Eye className="mr-2 h-4 w-4" />
            <span>预览数据</span>
          </ContextMenuItem>
          <ContextMenuItem onClick={handleViewStructure}>
            <Info className="mr-2 h-4 w-4" />
            <span>查看结构</span>
          </ContextMenuItem>
          {canDelete && onDelete && (
            <ContextMenuItem
              onClick={handleDelete}
              className="text-error focus:text-error"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span>删除表</span>
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* 查看结构对话框 */}
      <Dialog open={showStructure} onOpenChange={setShowStructure}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>表结构: {tableName}</DialogTitle>
            <DialogDescription>
              查看表的列信息和数据类型
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-96 overflow-auto">
            {loadingStructure ? (
              <div className="text-center py-8 text-muted-foreground">
                加载中...
              </div>
            ) : structureData.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">列名</th>
                    <th className="px-4 py-2 text-left font-medium">类型</th>
                    <th className="px-4 py-2 text-left font-medium">可空</th>
                  </tr>
                </thead>
                <tbody>
                  {structureData.map((row, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-foreground">
                        {row.column_name || row.Field}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {row.column_type || row.Type}
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
                无数据
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStructure(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除表 <span className="font-semibold text-foreground">{tableName}</span> 吗？
              此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
