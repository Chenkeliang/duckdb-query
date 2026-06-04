/**
 * JSON 单元格查看器弹窗
 *
 * 在网格根层级渲染一次，由 onViewJson 回调触发。
 * 显示格式化 JSON，带复制按钮。
 */

import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toFormattedJson } from '../utils/jsonCell';

export interface JsonCellViewerDialogProps {
  /** 要展示的值（null 表示关闭） */
  value: unknown;
  /** 关闭回调 */
  onClose: () => void;
}

export const JsonCellViewerDialog: React.FC<JsonCellViewerDialogProps> = ({
  value,
  onClose,
}) => {
  const { t } = useTranslation('common');
  const [copied, setCopied] = React.useState(false);
  const open = value !== null && value !== undefined;

  const formatted = React.useMemo(
    () => (open ? toFormattedJson(value) : ''),
    [open, value]
  );

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard 不可用时静默失败
    }
  }, [formatted]);

  // 弹窗关闭时重置 copied 状态
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        setCopied(false);
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-3">
        {/* 标题独占头部；pr-8 给右上角自带的关闭 × 留出空间 */}
        <DialogHeader className="space-y-0 pr-8">
          <DialogTitle className="text-sm font-medium">
            {t('query.json.viewerTitle', 'JSON 查看器')}
          </DialogTitle>
        </DialogHeader>

        {/* 内容卡片：顶部小工具条（复制）+ 可滚动 JSON，复制按钮不再与关闭 × 冲突 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-muted/30">
          <div className="flex shrink-0 items-center justify-end border-b border-border/60 px-2 py-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? t('query.json.copied', '已复制') : t('query.json.copy', '复制')}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-foreground">
              {formatted}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JsonCellViewerDialog;
