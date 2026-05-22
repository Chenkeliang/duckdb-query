import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, Code2, Play, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

  React.useEffect(() => {
    setEditedSQL(sql || '');
    setIsEditing(false);
  }, [sql]);

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
      <DialogContent className="max-w-3xl max-h-screen flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            {t('query.preview.title', 'SQL 预览')}
          </DialogTitle>
          <DialogDescription>
            {t('query.preview.description', '查看 SQL，可复制或直接执行')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          <div className="flex items-center justify-between">
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
                  disabled={isExecuting || !sql}
                >
                  <Play className="h-4 w-4 mr-1" />
                  {isExecuting
                    ? t('query.sql.executing', '执行中...')
                    : t('query.sql.execute', '执行')}
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {isEditing ? (
              <textarea
                value={editedSQL}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setEditedSQL(e.target.value)
                }
                className={cn(
                  'w-full min-h-72 p-4 font-mono text-sm resize-none',
                  'bg-input border border-border rounded-lg',
                  'text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-primary'
                )}
                placeholder={t('query.preview.placeholder', '输入 SQL...')}
              />
            ) : (
              <pre
                className={cn(
                  'p-4 bg-muted rounded-lg overflow-auto',
                  'font-mono text-sm whitespace-pre-wrap break-words',
                  'min-h-72 max-h-96',
                  'text-foreground border border-border'
                )}
              >
                {sql || t('query.preview.noSQL', '暂无 SQL')}
              </pre>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SQLPreview;
