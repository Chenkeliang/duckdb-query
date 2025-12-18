/**
 * SQL 编辑器组件
 * 使用 CodeMirror 6 实现 SQL 语法高亮和自动补全
 */

import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { sql, SQLDialect, StandardSQL } from '@codemirror/lang-sql';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { lintKeymap } from '@codemirror/lint';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { cn } from '@/lib/utils';

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
  /** 是否自动聚焦 */
  autoFocus?: boolean;
}

// DuckDB SQL 方言配置
const duckDBDialect = SQLDialect.define({
  keywords: StandardSQL.spec.keywords + ' COPY EXPORT IMPORT PIVOT UNPIVOT QUALIFY SAMPLE TABLESAMPLE',
  types: StandardSQL.spec.types + ' HUGEINT UTINYINT USMALLINT UINTEGER UBIGINT',
  builtin: 'read_csv read_parquet read_json list_value struct_pack',
});

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
  autoFocus = false,
}) => {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const sqlCompartment = useRef(new Compartment());


  // 检测深色模式
  const isDarkMode = useMemo(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  }, []);

  // 构建自动补全的 schema
  // CodeMirror SQL 的 schema 格式: { tableName: [columnName1, columnName2, ...] }
  const schema = useMemo(() => {
    const result: Record<string, string[]> = {};
    // 确保所有表都在 schema 中，即使没有列信息
    tables.forEach((table) => {
      result[table] = columns[table] || [];
    });
    return result;
  }, [tables, columns]);

  // 调试：打印 schema 信息
  useEffect(() => {
    if (tables.length > 0) {
      console.log('[SQLEditor] Autocomplete tables:', tables.length, 'tables');
    }
  }, [tables]);

  // 创建执行快捷键
  const executeKeymap = useMemo(() => {
    if (!onExecute) return [];
    return [
      {
        key: 'Ctrl-Enter',
        mac: 'Cmd-Enter',
        run: () => {
          onExecute();
          return true;
        },
      },
    ];
  }, [onExecute]);

  // 获取实际的 placeholder 文本
  const placeholderText = placeholder || t('query.sql.placeholder', '输入 SQL 查询语句，按 Ctrl+Enter 执行...');

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
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        
        // SQL 语言支持（使用 Compartment 以便动态更新 schema）
        sqlCompartment.current.of(
          sql({
            dialect: duckDBDialect,
            schema: schema,
            upperCaseKeywords: true,
          })
        ),
        
        // 自动补全 - 启用输入时自动触发
        autocompletion({
          activateOnTyping: true,
          defaultKeymap: true,
          maxRenderedOptions: 50,
          // 降低触发阈值，输入 1 个字符就开始提示
          activateOnTypingDelay: 100,
        }),
        
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
        
        // 主题
        themeCompartment.current.of(isDarkMode ? oneDark : []),
        
        // 只读模式
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        
        // 更新监听
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) {
            onChange(update.state.doc.toString());
          }
        }),
        
        // 样式
        EditorView.theme({
          '&': {
            height: '100%',
            minHeight,
            maxHeight,
            fontSize: '14px',
            fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
          },
          '.cm-scroller': {
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
          '.cm-placeholder': {
            color: 'var(--muted-foreground)',
            fontStyle: 'italic',
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

  // 同步主题变化
  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      view.dispatch({
        effects: themeCompartment.current.reconfigure(isDark ? oneDark : []),
      });
    };

    // 监听主题变化
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

  // 同步 schema 变化（表名和列名自动补全）
  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    view.dispatch({
      effects: sqlCompartment.current.reconfigure(
        sql({
          dialect: duckDBDialect,
          schema: schema,
          upperCaseKeywords: true,
        })
      ),
    });
  }, [schema]);

  // 暴露方法
  const focus = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const getSelection = useCallback(() => {
    const view = editorRef.current;
    if (!view) return '';
    const { from, to } = view.state.selection.main;
    return view.state.doc.sliceString(from, to);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'border border-border rounded-md overflow-hidden bg-background',
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
