import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { sql, StandardSQL } from '@codemirror/lang-sql';
import { MergeView } from '@codemirror/merge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createSqlEditorLayoutTheme } from '../sqlEditorLayoutTheme';
import { getSqlEditorIsDarkMode, sqlEditorThemeExtensions } from '../sqlEditorTheme';
import './sqlChangePreview.css';

interface SQLChangePreviewDialogProps {
  beforeSql: string;
  afterSql: string;
  targetLabel: string;
  stale: boolean;
  targetClosed: boolean;
  onCancel: () => void;
  onApply: () => void;
}

export function SQLChangePreviewDialog({ beforeSql, afterSql, targetLabel, stale, targetClosed, onCancel, onApply }: SQLChangePreviewDialogProps) {
  const { t } = useTranslation('common');
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!host) return;
    const extensions = [sql({ dialect: StandardSQL }), lineNumbers(), EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.lineWrapping,
      sqlEditorThemeExtensions(getSqlEditorIsDarkMode()), createSqlEditorLayoutTheme({ minHeight: '140px' }), EditorView.theme({ '&': { height: 'auto' } })];
    const merge = new MergeView({ parent: host, a: { doc: beforeSql, extensions }, b: { doc: afterSql, extensions }, gutter: true });
    for (const [view, label] of [[merge.a, t('query.ai.changePreview.before')], [merge.b, t('query.ai.changePreview.after')]] as const) {
      const heading = document.createElement('div');
      heading.className = 'sql-change-pane-label';
      heading.textContent = label;
      view.dom.parentElement?.prepend(heading);
      view.contentDOM.setAttribute('aria-label', label);
    }
    return () => merge.destroy();
  }, [host, beforeSql, afterSql, t]);

  return <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
    <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-5xl flex-col gap-4 p-5">
      <DialogHeader className="pr-6 text-left">
        <DialogTitle>{t('query.ai.changePreview.title')}</DialogTitle>
        <DialogDescription>{t('query.ai.changePreview.description', { target: targetLabel })}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap gap-4 text-xs">
        <span className="text-error">{t('query.ai.changePreview.removed')}</span>
        <span className="text-success">{t('query.ai.changePreview.added')}</span>
      </div>
      <div ref={setHost} className="sql-change-preview max-h-[46dvh] shrink-0 overflow-auto rounded-md border border-border bg-background" />
      {(targetClosed || stale || beforeSql === afterSql) && <p role="status" className="text-sm text-muted-foreground">
        {t(targetClosed ? 'query.ai.changePreview.closed' : stale ? 'query.ai.changePreview.stale' : 'query.ai.changePreview.same')}
      </p>}
      <DialogFooter className="flex-row items-center justify-end gap-2 space-x-0">
        <Button variant="subtle" size="sm" className="h-8" onClick={onCancel}>{t('actions.cancel')}</Button>
        <Button size="sm" className="h-8" disabled={targetClosed || beforeSql === afterSql} onClick={onApply}>{t('query.ai.changePreview.apply')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
