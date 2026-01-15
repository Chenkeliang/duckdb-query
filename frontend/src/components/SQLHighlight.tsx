/**
 * SQL 语法高亮组件
 * 使用 CodeMirror 6 实现只读的 SQL 语法高亮显示
 */

import React, { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { sql as sqlLang, SQLDialect, StandardSQL } from '@codemirror/lang-sql';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { cn } from '@/lib/utils';

export interface SQLHighlightProps {
  /** SQL 内容 */
  sql: string;
  /** 自定义类名 */
  className?: string;
  /** 最小高度 */
  minHeight?: string;
  /** 最大高度 */
  maxHeight?: string;
}

// DuckDB SQL 方言配置
const duckDBDialect = SQLDialect.define({
  keywords:
    StandardSQL.spec.keywords +
    ' COPY EXPORT IMPORT PIVOT UNPIVOT QUALIFY SAMPLE TABLESAMPLE ATTACH DETACH',
  types: StandardSQL.spec.types + ' HUGEINT UTINYINT USMALLINT UINTEGER UBIGINT',
  builtin: 'read_csv read_parquet read_json list_value struct_pack',
});

/**
 * SQL 语法高亮组件
 * 只读模式，用于显示 SQL 预览
 */
export const SQLHighlight: React.FC<SQLHighlightProps> = ({
  sql,
  className,
  minHeight = '100px',
  maxHeight = '300px',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());

  // 动态检测深色模式
  const [isDarkMode, setIsDarkMode] = React.useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  // 监听主题变化
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      setIsDarkMode(dark);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  // 初始化编辑器
  useEffect(() => {
    if (!containerRef.current) return;

    // 创建编辑器状态
    const state = EditorState.create({
      doc: sql,
      extensions: [
        EditorView.editable.of(false), // 只读
        EditorView.lineWrapping, // 自动换行
        sqlLang({
          dialect: duckDBDialect,
          upperCaseKeywords: true,
        }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        themeCompartment.current.of(isDarkMode ? oneDark : []),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '14px',
            fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
            backgroundColor: 'transparent',
          },
          '.cm-scroller': {
            minHeight,
            maxHeight,
            overflow: 'auto',
          },
          '.cm-content': {
            padding: '8px 0',
          },
          '.cm-line': {
            padding: '0 8px',
          },
          '&.cm-focused': {
            outline: 'none',
          },
        }),
      ],
    });

    // 创建编辑器视图
    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    editorRef.current = view;

    // 清理
    return () => {
      view.destroy();
      editorRef.current = null;
    };
  }, []); // 只在挂载时初始化

  // 更新 SQL 内容
  useEffect(() => {
    if (!editorRef.current) return;

    const currentDoc = editorRef.current.state.doc.toString();
    if (currentDoc !== sql) {
      editorRef.current.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: sql,
        },
      });
    }
  }, [sql]);

  // 更新主题
  useEffect(() => {
    if (!editorRef.current) return;

    editorRef.current.dispatch({
      effects: themeCompartment.current.reconfigure(isDarkMode ? oneDark : []),
    });
  }, [isDarkMode]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'border border-border rounded-lg overflow-hidden',
        'bg-background',
        className
      )}
    />
  );
};

export default SQLHighlight;
