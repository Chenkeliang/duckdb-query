/**
 * SQL 编辑器组件
 * 使用 CodeMirror 6 实现 SQL 语法高亮和自动补全
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { sql } from '@codemirror/lang-sql';
import { duckDBDialect } from './sqlDialect';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { completionKeymap } from '@codemirror/autocomplete';
import { getSqlEditorIsDarkMode, sqlEditorThemeExtensions } from './sqlEditorTheme';
import { createSqlEditorLayoutTheme } from './sqlEditorLayoutTheme';
import { useSqlEditorDarkMode } from './useSqlEditorDarkMode';
import { lintKeymap } from '@codemirror/lint';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { cn } from '@/lib/utils';
import { buildSqlAutocompletion, triggerCompletionIfFocused } from './sqlColumnCompletion';

export interface SQLEditorProps {
  /** SQL 内容 */
  value: string;
  /** 内容变化回调 */
  onChange?: (value: string) => void;
  /** 执行回调 (Ctrl+Enter) */
  onExecute?: () => void;
  /** 是否只读 */
  readOnly?: boolean;
  /** 占位符文本 */
  placeholder?: string;
  /** 自定义类名 */
  className?: string;
  /** 最小高度 */
  minHeight?: string;
  /** 最大高度 */
  maxHeight?: string;
  /** 表名列表（用于自动补全） */
  tables?: string[];
  /** 列名映射（表名 -> 列名列表，用于自动补全） */
  columns?: Record<string, string[]>;
  /** 当前 SQL 涉及表的列名（用于 WHERE 等位置的列前缀补全，含中文列名） */
  columnNameHints?: string[];
  /** FROM 主表名（提升 schema 补全对当前表的列识别） */
  defaultTable?: string;
  /** 是否自动聚焦 */
  autoFocus?: boolean;
}

/**
 * SQL 编辑器组件
 */
export const SQLEditor: React.FC<SQLEditorProps> = ({
  value,
  onChange,
  onExecute,
  readOnly = false,
  placeholder = '',
  className,
  minHeight = '200px',
  maxHeight = '400px',
  tables = [],
  columns = {},
  columnNameHints = [],
  defaultTable,
  autoFocus = false,
}) => {
  const { t } = useTranslation('common');
  const isDarkMode = useSqlEditorDarkMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const layoutCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const sqlCompartment = useRef(new Compartment());
  const columnHintsRef = useRef<string[]>(columnNameHints);
  const defaultTableRef = useRef(defaultTable);
  const schemaRef = useRef<Record<string, string[]>>({});

  const buildSqlExtensions = () => [
    sql({
      dialect: duckDBDialect,
      upperCaseKeywords: true,
    }),
    buildSqlAutocompletion({
      schema: schemaRef.current,
      dialect: duckDBDialect,
      defaultTable: defaultTableRef.current,
      getColumnNames: () => columnHintsRef.current,
    }),
  ];

  // 使用 ref 保存最新的 onExecute 回调，避免闭包陷阱
  // 因为 CodeMirror 的 keymap 初始化后不会随组件 props 更新而重建
  const onExecuteRef = useRef(onExecute);
  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);

  useEffect(() => {
    columnHintsRef.current = columnNameHints;
  }, [columnNameHints]);

  useEffect(() => {
    defaultTableRef.current = defaultTable;
  }, [defaultTable]);

  // 构建自动补全的 schema
  // CodeMirror SQL 的 schema 格式: { tableName: [columnName1, columnName2, ...] }
  const schema = useMemo(() => {
    const result: Record<string, string[]> = {};
    // 确保所有表都在 schema 中，即使没有列信息
    tables.forEach((table) => {
      result[table] = columns[table] || [];
    });
    schemaRef.current = result;
    return result;
  }, [tables, columns]);

  // 创建执行快捷键
  const executeKeymap = useMemo(() => {
    const run = () => {
      if (onExecuteRef.current) {
        onExecuteRef.current();
        return true;
      }
      return false;
    };

    return [
      {
        key: 'Mod-Enter', // Mac: Cmd-Enter, Win: Ctrl-Enter
        run,
      },
      {
        key: 'Ctrl-Enter', // Explicit support for Ctrl-Enter on Mac to match placeholder text
        run,
      },
      {
        key: 'F8', // Common DBeaver/Datagrip shortcut
        run,
      }
    ];
  }, []);

  // 获取实际的 placeholder 文本
  const placeholderText = placeholder || t('query.sql.placeholder', '输入 SQL，Ctrl+Space 补全，Ctrl+Enter 执行');

  // 初始化编辑器
  useEffect(() => {
    if (!containerRef.current) return;

    // 如果编辑器已存在，先销毁
    if (editorRef.current) {
      editorRef.current.destroy();
    }

    // 创建编辑器状态
    const state = EditorState.create({
      doc: value,
      extensions: [
        // 基础功能
        history(),
        highlightSelectionMatches(),

        // 快捷键
        keymap.of([
          ...executeKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...lintKeymap,
          ...searchKeymap,
        ]),

        // 占位符
        placeholderExt(placeholderText),

        layoutCompartment.current.of(
          createSqlEditorLayoutTheme({ minHeight, maxHeight })
        ),

        sqlCompartment.current.of(buildSqlExtensions()),

        themeCompartment.current.of(sqlEditorThemeExtensions(getSqlEditorIsDarkMode())),

        // 只读模式
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),

        // 更新监听
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) {
            onChange(update.state.doc.toString());
          }
        }),

      ],
    });

    // 创建编辑器视图
    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    editorRef.current = view;

    // 自动聚焦
    if (autoFocus) {
      view.focus();
    }

    return () => {
      view.destroy();
    };
  }, [placeholderText]); // 当 placeholder 变化时重新初始化

  // 同步外部值变化
  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    view.dispatch({
      effects: layoutCompartment.current.reconfigure(
        createSqlEditorLayoutTheme({ minHeight, maxHeight })
      ),
    });
  }, [minHeight, maxHeight]);

  // 同步主题变化
  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    const checkTheme = () => {
      view.dispatch({
        effects: themeCompartment.current.reconfigure(
          sqlEditorThemeExtensions(getSqlEditorIsDarkMode())
        ),
      });
    };

    checkTheme();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          checkTheme();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // 同步只读状态
  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  // 同步 schema / 列名 / 默认表（补全配置）
  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    schemaRef.current = schema;
    view.dispatch({
      effects: sqlCompartment.current.reconfigure(buildSqlExtensions()),
    });
  }, [schema, defaultTable]);

  // 列名加载完成后，聚焦时重新弹出补全（如已输入「手机」）
  useEffect(() => {
    if (columnNameHints.length === 0) return;
    triggerCompletionIfFocused(editorRef.current);
  }, [columnNameHints]);



  return (
    <div
      ref={containerRef}
      className={cn(
        'border border-border rounded-md overflow-hidden',
        isDarkMode ? 'bg-transparent' : 'bg-background',
        'focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background',
        className
      )}
      style={{
        // 动态尺寸例外：高度由父组件传入，无法使用静态 Tailwind 类
        minHeight,
        maxHeight
      }}
    />
  );
};

export default SQLEditor;
