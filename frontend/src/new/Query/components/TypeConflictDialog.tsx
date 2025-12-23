/**
 * 类型冲突解决对话框
 * 
 * 用于显示和解决 JOIN 条件中的类型冲突：
 * - 冲突列表表格
 * - 类型选择器（支持推荐标签）
 * - "应用所有推荐"按钮
 * - SQL 预览区域
 * - TRY_CAST NULL 值警告
 * - 快捷键支持（Enter 确认, Escape 取消, Ctrl+A 应用所有推荐）
 * 
 * 可用于：JoinQueryPanel、VisualQuery、SetOperations 等
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Wand2, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/new/components/ui/dialog';
import { Button } from '@/new/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/new/components/ui/select';
import { Alert, AlertDescription } from '@/new/components/ui/alert';
import { Badge } from '@/new/components/ui/badge';
import { cn } from '@/lib/utils';
import { DUCKDB_CAST_TYPES } from '@/new/utils/duckdbTypes';
import type { TypeConflict } from '@/new/hooks/useTypeConflict';

export interface TypeConflictDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 冲突列表 */
  conflicts: TypeConflict[];
  /** 解决单个冲突 */
  onResolve: (key: string, targetType: string) => void;
  /** 一键应用所有推荐 */
  onResolveAll: () => void;
  /** 关闭对话框 */
  onClose: () => void;
  /** 确认并继续 */
  onConfirm: () => void;
  /** SQL 预览（可选） */
  sqlPreview?: string;
  /** 对话框标题（可选） */
  title?: string;
  /** 确认按钮文本（可选） */
  confirmText?: string;
}

/**
 * 通用类型冲突解决对话框
 */
export const TypeConflictDialog: React.FC<TypeConflictDialogProps> = ({
  open,
  conflicts,
  onResolve,
  onResolveAll,
  onClose,
  onConfirm,
  sqlPreview,
  title,
  confirmText,
}) => {
  const { t } = useTranslation('common');
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // 计算统计信息
  const unresolvedCount = conflicts.filter(c => !c.resolvedType).length;
  const allResolved = conflicts.length > 0 && unresolvedCount === 0;

  // 快捷键处理
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter - 确认（仅当所有冲突已解决）
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && allResolved) {
        e.preventDefault();
        onConfirm();
      }
      // Escape - 取消
      else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      // Ctrl/Cmd + A - 应用所有推荐
      else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        // 只在对话框内部处理，避免影响其他输入
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          onResolveAll();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, allResolved, onConfirm, onClose, onResolveAll]);

  // 默认标题
  const dialogTitle = title || (
    allResolved
      ? t('query.typeConflict.allResolved', '所有类型冲突已解决')
      : t('query.typeConflict.detected', '检测到 {{count}} 个类型冲突', {
        count: unresolvedCount,
      })
  );

  // 默认确认按钮文本
  const confirmButtonText = confirmText || t('query.typeConflict.applyAndContinue', '应用转换并继续');

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        ref={dialogRef}
        className="max-w-2xl max-h-[85vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {allResolved ? (
              <CheckCircle2 className="w-5 h-5 text-success" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-warning" />
            )}
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>
            {t(
              'query.typeConflict.description',
              '请选择一个统一的类型来对齐左右两侧字段，以避免 DuckDB 类型转换错误。'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* TRY_CAST NULL 值警告 */}
        <Alert className="border-warning/50 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning text-xs">
            {t(
              'query.typeConflict.tryCastWarning',
              '注意：TRY_CAST 转换失败的行将返回 NULL，这些行将被排除在 JOIN 结果之外。'
            )}
          </AlertDescription>
        </Alert>

        {/* 冲突列表 */}
        <div className="flex-1 overflow-auto">
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t('query.typeConflict.joinCondition', 'JOIN 条件')}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t('query.typeConflict.leftType', '左侧类型')}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t('query.typeConflict.rightType', '右侧类型')}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t('query.typeConflict.convertTo', '转换为')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((conflict) => (
                  <ConflictRow
                    key={conflict.key}
                    conflict={conflict}
                    onResolve={onResolve}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 应用所有推荐按钮 */}
        <div className="flex justify-start">
          <Button
            variant="outline"
            size="sm"
            onClick={onResolveAll}
            className="gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" />
            {t('query.typeConflict.applyAllRecommendations', '应用所有推荐')}
          </Button>
          <span className="ml-2 text-xs text-muted-foreground self-center">
            {t('query.typeConflict.shortcutHint', '快捷键: Ctrl+A')}
          </span>
        </div>

        {/* SQL 预览 */}
        {sqlPreview && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('query.typeConflict.sqlPreview', 'SQL 预览')}
            </label>
            <pre className="bg-muted border border-border rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-32 text-foreground">
              {sqlPreview}
            </pre>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', '取消')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!allResolved}
            className={cn(
              allResolved && 'bg-success hover:bg-success/90'
            )}
          >
            {confirmButtonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * 冲突行组件
 */
interface ConflictRowProps {
  conflict: TypeConflict;
  onResolve: (key: string, targetType: string) => void;
}

const ConflictRow: React.FC<ConflictRowProps> = ({ conflict, onResolve }) => {
  const { t } = useTranslation('common');
  const isResolved = !!conflict.resolvedType;

  return (
    <tr className={cn(
      'border-t border-border',
      isResolved ? 'bg-success/5' : 'bg-warning/5'
    )}>
      {/* JOIN 条件 */}
      <td className="px-3 py-2">
        <div className="space-y-0.5">
          <div className="font-medium text-foreground">
            {conflict.leftLabel}.{conflict.leftColumn}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              =
            </Badge>
            <span className="font-medium text-foreground">
              {conflict.rightLabel}.{conflict.rightColumn}
            </span>
          </div>
        </div>
      </td>

      {/* 左侧类型 */}
      <td className="px-3 py-2">
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
          {conflict.leftTypeDisplay}
        </code>
      </td>

      {/* 右侧类型 */}
      <td className="px-3 py-2">
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
          {conflict.rightTypeDisplay}
        </code>
      </td>

      {/* 类型选择器 */}
      <td className="px-3 py-2">
        <Select
          value={conflict.resolvedType || ''}
          onValueChange={(value) => onResolve(conflict.key, value)}
        >
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder={t('query.typeConflict.selectType', '选择类型')} />
          </SelectTrigger>
          <SelectContent
            position="popper"
            sideOffset={4}
            className="z-[1000]"
          >
            {DUCKDB_CAST_TYPES.map((type) => (
              <SelectItem key={type} value={type} className="text-xs">
                <span className="flex items-center gap-2">
                  {type}
                  {type === conflict.recommendedType && (
                    <Badge variant="outline" className="text-xs px-1 py-0 bg-primary/10 text-primary">
                      {t('query.typeConflict.recommended', '推荐')}
                    </Badge>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
    </tr>
  );
};

export default TypeConflictDialog;
