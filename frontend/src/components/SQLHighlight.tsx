/**
 * SQL 语法高亮组件（只读）
 * 与 SQLEditor 共用 duckDBDialect + sqlEditorThemeExtensions
 */
import React, { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { duckDBDialect } from '@/Query/SQLQuery/sqlDialect';
import {
  getSqlEditorIsDarkMode,
  sqlEditorThemeExtensions,
} from '@/Query/SQLQuery/sqlEditorTheme';
import { createSqlEditorLayoutTheme } from '@/Query/SQLQuery/sqlEditorLayoutTheme';
import { useSqlEditorDarkMode } from '@/Query/SQLQuery/useSqlEditorDarkMode';
import { cn } from '@/lib/utils';

export interface SQLHighlightProps {
  sql: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  /** 列表卡片等紧凑场景 */
  compact?: boolean;
  /** 弹窗等大段预览：允许滚轮滚动（默认 false 以免挡住列表点击） */
  scrollable?: boolean;
  'data-testid'?: string;
}

export const SQLHighlight: React.FC<SQLHighlightProps> = ({
  sql,
  className,
  minHeight = '100px',
  maxHeight = '300px',
  compact = false,
  scrollable = false,
  'data-testid': dataTestId,
}) => {
  const layoutOptions = compact
    ? {
        minHeight,
        maxHeight,
        fontSize: '12px',
        contentPadding: '4px 0',
        linePadding: '0 6px',
      }
    : { minHeight, maxHeight };
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const layoutCompartment = useRef(new Compartment());
  const isDarkMode = useSqlEditorDarkMode();

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: sql,
      extensions: [
        EditorView.editable.of(false),
        EditorView.lineWrapping,
        layoutCompartment.current.of(createSqlEditorLayoutTheme(layoutOptions)),
        sqlLang({
          dialect: duckDBDialect,
          upperCaseKeywords: true,
        }),
        themeCompartment.current.of(sqlEditorThemeExtensions(getSqlEditorIsDarkMode())),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    editorRef.current = view;

    return () => {
      view.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    view.dispatch({
      effects: layoutCompartment.current.reconfigure(
        createSqlEditorLayoutTheme(layoutOptions)
      ),
    });
  }, [minHeight, maxHeight, compact]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc !== sql) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: sql,
        },
      });
    }
  }, [sql]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    view.dispatch({
      effects: themeCompartment.current.reconfigure(
        sqlEditorThemeExtensions(isDarkMode)
      ),
    });
  }, [isDarkMode]);

  return (
    <div
      ref={containerRef}
      data-testid={dataTestId}
      className={cn(
        'border border-border rounded-lg h-full',
        scrollable ? 'overflow-hidden pointer-events-auto' : 'overflow-hidden pointer-events-none',
        isDarkMode ? 'bg-transparent' : 'bg-background',
        className
      )}
    />
  );
};

export default SQLHighlight;
