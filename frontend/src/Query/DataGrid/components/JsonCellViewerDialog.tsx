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

  const formatted = React.useMemo(
    () => (value !== null && value !== undefined ? toFormattedJson(value) : ''),
    [value]
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
    (open: boolean) => {
      if (!open) {
        setCopied(false);
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Dialog open={value !== null && value !== undefined} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl w-full flex flex-col gap-3 max-h-[80vh]">
        <DialogHeader className="flex-row items-center justify-between pb-0">
          <DialogTitle className="text-sm font-medium">
            {t('query.json.viewerTitle', 'JSON 查看器')}
          </DialogTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1 mr-6"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                {t('query.json.copied', '已复制')}
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                {t('query.json.copy', '复制')}
              </>
            )}
          </Button>
        </DialogHeader>

        <div className="overflow-auto flex-1 rounded-md border border-border bg-muted/30 min-h-0">
          <pre className="font-mono text-xs leading-relaxed p-4 whitespace-pre-wrap break-all text-foreground">
            {formatted}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JsonCellViewerDialog;
