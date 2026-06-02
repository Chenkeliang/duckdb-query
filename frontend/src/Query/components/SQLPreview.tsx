import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, Code2, Play, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SQLHighlight } from '@/components/SQLHighlight';
import { SQLEditor } from '@/Query/SQLQuery/SQLEditor';
import { cn } from '@/lib/utils';

export interface SQLPreviewProps {
  sql: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExecute?: (sql: string) => void;
  isExecuting?: boolean;
  allowEdit?: boolean;
}

/** SQL 预览对话框（收藏/历史加载等） */
export const SQLPreview: React.FC<SQLPreviewProps> = ({
  sql,
  open,
  onOpenChange,
  onExecute,
  isExecuting = false,
  allowEdit = true,
}) => {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSQL, setEditedSQL] = useState(sql || '');
  /** 先展示可滚动的纯文本，下一帧再挂 CodeMirror，避免阻塞弹窗打开 */
  const [highlightReady, setHighlightReady] = useState(false);

  useEffect(() => {
    setEditedSQL(sql || '');
    setIsEditing(false);
  }, [sql, open]);

  useEffect(() => {
    if (!open || !sql || isEditing) {
      setHighlightReady(false);
      return;
    }
    const frame = requestAnimationFrame(() => setHighlightReady(true));
    return () => {
      cancelAnimationFrame(frame);
      setHighlightReady(false);
    };
  }, [open, sql, isEditing]);

  const handleCopy = useCallback(async () => {
    const textToCopy = isEditing ? editedSQL : sql;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [sql, editedSQL, isEditing]);

  const handleExecute = useCallback(() => {
    const sqlToExecute = isEditing ? editedSQL : sql;
    if (sqlToExecute && onExecute) {
      onExecute(sqlToExecute);
    }
  }, [sql, editedSQL, isEditing, onExecute]);

  const toggleEdit = useCallback(() => {
    if (isEditing) {
      setEditedSQL(sql || '');
    }
    setIsEditing(!isEditing);
  }, [isEditing, sql]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[min(90vh,900px)] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            {t('query.preview.title', 'SQL 预览')}
          </DialogTitle>
          <DialogDescription>
            {t('query.preview.description', '查看 SQL，可复制或直接执行')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 min-h-0 flex-1">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              {allowEdit && (
                <Button
                  variant={isEditing ? 'default' : 'outline'}
                  size="sm"
                  onClick={toggleEdit}
                >
                  <Edit3 className="h-4 w-4 mr-1" />
                  {isEditing
                    ? t('query.preview.editing', '编辑中')
                    : t('query.preview.edit', '编辑')}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-1 text-success" />
                    {t('query.preview.copied', '已复制')}
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" />
                    {t('query.preview.copy', '复制')}
                  </>
                )}
              </Button>
              {onExecute && (
                <Button
                  size="sm"
                  onClick={handleExecute}
                  disabled={isExecuting || !(isEditing ? editedSQL : sql)}
                >
                  <Play className="h-4 w-4 mr-1" />
                  {isExecuting
                    ? t('query.sql.executing', '执行中...')
                    : t('query.sql.execute', '执行')}
                </Button>
              )}
            </div>
          </div>

          <div
            className={cn(
              'flex-1 min-h-48 max-h-[min(60vh,32rem)] min-w-0',
              'rounded-lg border border-border overflow-hidden'
            )}
          >
            {isEditing ? (
              <SQLEditor
                value={editedSQL}
                onChange={setEditedSQL}
                minHeight="100%"
                maxHeight="100%"
                className="h-full"
                placeholder={t('query.preview.placeholder', '输入 SQL...')}
              />
            ) : sql ? (
              highlightReady ? (
                <SQLHighlight
                  sql={sql}
                  scrollable
                  minHeight="12rem"
                  maxHeight="min(60vh, 32rem)"
                  className="h-full border-0 rounded-lg"
                />
              ) : (
                <pre
                  className={cn(
                    'h-full min-h-48 max-h-[min(60vh,32rem)] overflow-auto',
                    'p-3 text-sm font-mono whitespace-pre-wrap wrap-break-word',
                    'bg-muted/30 text-foreground rounded-lg'
                  )}
                >
                  {sql}
                </pre>
              )
            ) : (
              <p className="text-sm text-muted-foreground p-4">
                {t('query.preview.noSQL', '暂无 SQL')}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SQLPreview;
