/**
 * JSON 单元格查看器弹窗
 *
 * 在网格根层级渲染一次，由 onViewJson 回调触发。
 * 显示格式化 JSON，带复制按钮。
 */

import * as React from 'react';
import { Copy, Check, Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  getJsonViewerText,
  listJsonPointerPaths,
  toRawJsonText,
} from '../utils/jsonCell';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const [pathCopied, setPathCopied] = React.useState(false);
  const [selectedPathId, setSelectedPathId] = React.useState('');
  const open = value !== null && value !== undefined;

  const viewer = React.useMemo(
    () => (open
      ? getJsonViewerText(value)
      : { text: '', truncated: false, totalCharacters: 0 }),
    [open, value]
  );
  const raw = React.useMemo(
    () => (open ? toRawJsonText(value) : ''),
    [open, value]
  );
  const paths = React.useMemo(
    () => (open ? listJsonPointerPaths(value) : []),
    [open, value]
  );
  const selectedPath = paths.find((entry) => entry.id === selectedPathId) ?? paths[0];

  React.useEffect(() => {
    setSelectedPathId(paths[0]?.id ?? '');
    setPathCopied(false);
  }, [paths]);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard 不可用时静默失败
    }
  }, [raw]);

  const handleCopyPath = React.useCallback(async () => {
    if (!selectedPath) return;
    try {
      await navigator.clipboard.writeText(selectedPath.pointer);
      setPathCopied(true);
      setTimeout(() => setPathCopied(false), 2000);
    } catch {
      // clipboard 不可用时静默失败
    }
  }, [selectedPath]);

  // 弹窗关闭时重置 copied 状态
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        setCopied(false);
        setPathCopied(false);
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
          <DialogDescription className="sr-only">
            {t('query.json.viewerDescription', '查看 JSON 内容并复制原文或路径')}
          </DialogDescription>
        </DialogHeader>

        {/* 内容卡片：顶部小工具条（复制）+ 可滚动 JSON，复制按钮不再与关闭 × 冲突 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-muted/30">
          <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-1">
            {selectedPath && (
              <>
                <Select value={selectedPath.id} onValueChange={setSelectedPathId}>
                  <SelectTrigger
                    className="h-7 min-w-0 flex-1 font-mono text-xs"
                    aria-label={t('query.json.path', 'JSON 路径')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paths.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id} className="font-mono text-xs">
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleCopyPath}
                >
                  {pathCopied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Route className="h-3.5 w-3.5" />
                  )}
                  {pathCopied
                    ? t('query.json.pathCopied', '路径已复制')
                    : t('query.json.copyPath', '复制路径')}
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
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
            {viewer.truncated && (
              <p className="border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
                {t('query.json.previewTruncated', {
                  count: viewer.totalCharacters,
                  defaultValue: `仅显示前 ${viewer.totalCharacters.toLocaleString()} 个字符中的一部分；复制仍包含完整原文`,
                })}
              </p>
            )}
            <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-foreground">
              {viewer.text}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JsonCellViewerDialog;
