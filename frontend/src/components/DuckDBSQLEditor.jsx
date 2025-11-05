import { autocompletion } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { sql } from "@codemirror/lang-sql";
import { lintGutter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { Box, Button, Typography } from "@mui/material";
import { EditorView, basicSetup } from "codemirror";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";


// (The long lists of sqlKeywords and sqlFunctions are omitted for brevity, they remain unchanged)
const sqlKeywords = [
  "SELECT",
  "FROM",
  "WHERE",
  "JOIN",
  "LEFT",
  "RIGHT",
  "INNER",
  "OUTER",
  "GROUP",
  "BY",
  "ORDER",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "DISTINCT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "DROP",
  "ALTER",
  "TABLE",
  "INDEX",
  "VIEW",
  "PROCEDURE",
  "FUNCTION",
  "TRIGGER",
  "AS",
  "ON",
  "AND",
  "OR",
  "NOT",
  "IN",
  "EXISTS",
  "BETWEEN",
  "LIKE",
  "IS",
  "NULL",
  "ASC",
  "DESC",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "IF",
  "COALESCE",
  "CAST",
  "CONVERT",
  "SUBSTRING",
  "CONCAT",
  "LENGTH",
  "UPPER",
  "LOWER",
  "TRIM",
  "LTRIM",
  "RTRIM",
  "REPLACE",
  "POSITION",
  "CHAR_LENGTH",
  "YEAR",
  "MONTH",
  "DAY",
  "HOUR",
  "MINUTE",
  "SECOND",
  "DATE",
  "TIME",
  "DATETIME",
  "TIMESTAMP",
  "INTERVAL",
  "EXTRACT",
  "DATE_TRUNC",
  "READ_CSV",
  "READ_PARQUET",
  "READ_JSON",
  "READ_EXCEL",
  "READ_NDJSON",
  "COPY",
  "EXPORT",
  "IMPORT",
  "INSTALL",
  "LOAD",
  "UNLOAD",
  "PRAGMA",
  "DESCRIBE",
  "SHOW",
  "EXPLAIN",
  "ANALYZE",
  "VACUUM",
  "CHECKPOINT",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "TRANSACTION",
  "SAVEPOINT",
  "RELEASE",
  "SET",
  "RESET",
  "CALL",
  "PREPARE",
  "EXECUTE",
  "DEALLOCATE",
  "GRANT",
  "REVOKE",
  "DENY",
  "WITH",
  "RECURSIVE",
  "WINDOW",
  "OVER",
  "PARTITION",
  "ROWS",
  "RANGE",
  "UNBOUNDED",
  "PRECEDING",
  "FOLLOWING",
  "CURRENT",
  "ROW_NUMBER",
  "RANK",
  "DENSE_RANK",
  "NTILE",
  "LAG",
  "LEAD",
  "FIRST_VALUE",
  "LAST_VALUE",
  "NTH_VALUE",
  "PERCENT_RANK",
  "CUME_DIST",
];
const sqlFunctions = [
  "read_csv",
  "read_parquet",
  "read_json",
  "read_excel",
  "read_ndjson",
  "list_aggregate_functions",
  "list_scalar_functions",
  "list_pragma_functions",
  "current_timestamp",
  "current_date",
  "current_time",
  "now",
  "today",
  "strftime",
  "date_trunc",
  "date_part",
  "extract",
  "epoch",
  "unixepoch",
  "array_agg",
  "list_agg",
  "string_agg",
  "json_agg",
  "json_object_agg",
  "unnest",
  "flatten",
  "list_zip",
  "list_contains",
  "list_position",
  "list_extract",
  "list_slice",
  "list_sort",
  "list_reverse",
  "list_unique",
  "json_extract",
  "json_extract_path",
  "json_extract_path_text",
  "json_object",
  "json_array",
  "json_type",
  "json_valid",
  "json_length",
  "json_keys",
  "json_each",
  "json_tree",
  "json_pretty",
  "json_serialize",
  "json_deserialize",
  "json_quote",
  "json_unquote",
  "json_merge_patch",
  "json_merge_preserve",
  "json_remove",
  "json_set",
  "json_insert",
  "json_replace",
  "json_patch",
  "json_contains",
  "json_contains_path",
  "json_depth",
  "json_storage_size",
  "json_storage_free",
  "regexp_replace",
  "regexp_extract",
  "regexp_extract_all",
  "string_split",
  "string_split_regex",
  "string_to_array",
  "array_to_string",
  "array_length",
  "array_contains",
  "array_position",
  "array_extract",
  "array_slice",
  "array_sort",
  "array_reverse",
  "array_unique",
  "array_intersect",
  "array_union",
  "array_except",
  "array_concat",
  "array_append",
  "array_prepend",
  "array_remove",
  "array_replace",
  "array_insert",
  "array_pop_back",
  "array_pop_front",
  "array_push_back",
  "array_push_front",
  "array_resize",
  "array_shuffle",
  "array_sample",
  "array_reverse_sort",
  "array_sort_desc",
  "array_sort_asc",
  "generate_series",
  "generate_subscripts",
  "range",
  "repeat",
  "sequence",
  "seq",
  "random",
  "randomblob",
  "zeroblob",
  "typeof",
  "length",
  "octet_length",
  "bit_length",
  "char_length",
  "character_length",
  "lower",
  "upper",
  "trim",
  "ltrim",
  "rtrim",
  "substring",
  "substr",
  "replace",
  "reverse",
  "repeat",
  "space",
  "pad",
  "lpad",
  "rpad",
  "left",
  "right",
  "mid",
  "locate",
  "position",
  "instr",
  "find_in_set",
  "field",
  "elt",
  "make_set",
  "export_set",
  "bin",
  "hex",
  "unhex",
  "oct",
  "conv",
  "ascii",
  "ord",
  "char",
  "concat",
  "concat_ws",
  "group_concat",
  "format",
  "printf",
  "abs",
  "sign",
  "mod",
  "div",
  "power",
  "pow",
  "sqrt",
  "cbrt",
  "exp",
  "ln",
  "log",
  "log10",
  "log2",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "sinh",
  "cosh",
  "tanh",
  "asinh",
  "acosh",
  "atanh",
  "degrees",
  "radians",
  "pi",
  "e",
  "random",
  "randomblob",
  "round",
  "ceil",
  "ceiling",
  "floor",
  "trunc",
  "truncate",
  "greatest",
  "least",
  "min",
  "max",
  "sum",
  "avg",
  "count",
  "count_star",
  "count_distinct",
  "variance",
  "var_pop",
  "var_samp",
  "stddev",
  "stddev_pop",
  "stddev_samp",
  "corr",
  "covar_pop",
  "covar_samp",
  "regr_avgx",
  "regr_avgy",
  "regr_count",
  "regr_intercept",
  "regr_r2",
  "regr_slope",
  "regr_sxx",
  "regr_sxy",
  "regr_syy",
  "percentile_cont",
  "percentile_disc",
  "percent_rank",
  "cume_dist",
  "ntile",
  "lag",
  "lead",
  "first_value",
  "last_value",
  "nth_value",
  "row_number",
  "rank",
  "dense_rank",
];

const DuckDBSQLEditor = forwardRef((props, ref) => {
  const {
    value = "",
    onChange,
    placeholder = "输入 SQL 查询...",
    height = "300px",
    readOnly = false,
    theme = "light",
    showLineNumbers = true,
    showGutter = true,
    className = "",
    style = {},
    tables,
  } = props;

  // 使用useMemo稳定tables引用，避免每次都是新数组
  const stableTables = useMemo(() => tables || [], [JSON.stringify(tables)]);

  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const [editorError, setEditorError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 使用ref跟踪是否是内部更新，避免光标丢失
  const isInternalUpdate = useRef(false);

  const normalizedHeight = typeof height === "number" ? `${height}px` : height;
  const editorViewportHeight = isFullscreen ? "calc(100vh - 120px)" : normalizedHeight;

  const editorAppearance = useMemo(() => {
    const isDark = theme === "dark";
    const lightBackground = "var(--dq-editor-light-bg)";
    const lightGutter = "var(--dq-editor-light-border)";
    const lightText = "var(--dq-editor-light-text)";
    const darkBackground = "var(--dq-editor-dark-bg)";
    const darkGutter = "var(--dq-editor-dark-border)";
    const darkText = "var(--dq-editor-dark-text)";
    const darkSelection = "var(--dq-editor-dark-selection)";
    const darkActiveLine = "color-mix(in oklab, var(--dq-accent-primary) 18%, transparent)";

    return EditorView.theme(
      {
        "&": {
          fontSize: "14px",
          fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
          backgroundColor: isDark ? darkBackground : lightBackground,
          color: isDark ? darkText : lightText
        },
        ".cm-content": {
          padding: "12px",
          color: isDark ? darkText : lightText
        },
        ".cm-line": {
          color: isDark ? darkText : lightText
        },
        ".cm-scroller": {
          fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
          minHeight: editorViewportHeight,
          backgroundColor: isDark ? darkBackground : lightBackground
        },
        ".cm-gutters": showGutter
          ? {
              padding: "0 8px",
              backgroundColor: isDark ? darkBackground : lightBackground,
              color: isDark ? "var(--dq-text-tertiary)" : "var(--dq-text-muted-strong)",
              borderRight: `1px solid ${isDark ? darkGutter : lightGutter}`
            }
          : {
              display: "none"
            },
        ".cm-activeLine": {
          backgroundColor: isDark ? darkActiveLine : "var(--dq-editor-light-active)"
        },
        ".cm-selectionBackground": {
          backgroundColor: isDark ? darkSelection : "var(--dq-editor-light-selection)"
        },
        ".cm-placeholder": {
          color: "var(--dq-text-tertiary)"
        },
        ".cm-cursor": {
          borderLeftColor: isDark ? darkText : lightText
        }
      },
      { dark: isDark }
    );
  }, [editorViewportHeight, showGutter, theme]);


  // 全屏切换功能
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // SQL格式化功能
  const formatSQL = () => {
    if (viewRef.current) {
      const currentValue = viewRef.current.state.doc.toString();
      const formatted = formatSQLQuery(currentValue);

      // 更新编辑器内容
      const transaction = viewRef.current.state.update({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: formatted
        }
      });
      viewRef.current.dispatch(transaction);
    }
  };

  // 简单的SQL格式化函数
  const formatSQLQuery = (sql) => {
    if (!sql.trim()) return sql;

    // 基本的SQL格式化
    let formatted = sql
      .replace(/\s+/g, ' ') // 合并多个空格
      .replace(/\s*,\s*/g, ',\n  ') // 逗号后换行
      .replace(/\s+FROM\s+/gi, '\nFROM ')
      .replace(/\s+WHERE\s+/gi, '\nWHERE ')
      .replace(/\s+JOIN\s+/gi, '\nJOIN ')
      .replace(/\s+LEFT\s+JOIN\s+/gi, '\nLEFT JOIN ')
      .replace(/\s+RIGHT\s+JOIN\s+/gi, '\nRIGHT JOIN ')
      .replace(/\s+INNER\s+JOIN\s+/gi, '\nINNER JOIN ')
      .replace(/\s+OUTER\s+JOIN\s+/gi, '\nOUTER JOIN ')
      .replace(/\s+GROUP\s+BY\s+/gi, '\nGROUP BY ')
      .replace(/\s+ORDER\s+BY\s+/gi, '\nORDER BY ')
      .replace(/\s+HAVING\s+/gi, '\nHAVING ')
      .replace(/\s+LIMIT\s+/gi, '\nLIMIT ')
      .replace(/\s+UNION\s+/gi, '\nUNION ')
      .replace(/\s+UNION\s+ALL\s+/gi, '\nUNION ALL ')
      .replace(/\s+AND\s+/gi, '\n  AND ')
      .replace(/\s+OR\s+/gi, '\n  OR ')
      .trim();

    return formatted;
  };

  // Expose a function to get the current value
  useImperativeHandle(ref, () => ({
    getValue: () => {
      if (viewRef.current) {
        return viewRef.current.state.doc.toString();
      }
      return value; // Fallback to prop value
    },
    setValue: (newValue) => {
      if (viewRef.current) {
        const transaction = viewRef.current.state.update({
          changes: {
            from: 0,
            to: viewRef.current.state.doc.length,
            insert: newValue || ''
          }
        });
        viewRef.current.dispatch(transaction);
      }
    },
    toggleFullscreen,
    formatSQL,
  }));

  const getTableCompletions = () => {
    return stableTables.map((table) => ({
      label: table,
      type: "table",
      boost: 12,
    }));
  };

  const enhancedSqlCompletions = (context) => {
    const word = context.matchBefore(/\w*/);
    if (!word) return null;

    const completions = [
      ...sqlKeywords.map((keyword) => ({
        label: keyword,
        type: "keyword",
        boost: 10,
      })),
      ...sqlFunctions.map((func) => ({
        label: func,
        type: "function",
        boost: 8,
      })),
      ...getTableCompletions(),
    ];

    return {
      from: word.from,
      options: completions.filter((option) =>
        option.label.toLowerCase().includes(word.text.toLowerCase()),
      ),
    };
  };

  useEffect(() => {
    if (!editorRef.current) return;

    try {
      const baseExtensions = [
        basicSetup,
        sql(),
        autocompletion({ override: [enhancedSqlCompletions] }),
        lintGutter(),
        keymap.of([indentWithTab]), // 添加Tab缩进支持
        EditorView.lineWrapping, // 添加自动换行
        EditorView.editable.of(!readOnly), // 添加 readOnly 状态控制
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) {
            try {
              // 标记为内部更新，避免useEffect触发导致光标丢失
              isInternalUpdate.current = true;
              onChange(update.state.doc.toString());
            } catch (e) {
              console.error('onChange error:', e);
            }
          }
        }),
        editorAppearance,
      ];

      const themeExtensions = theme === "dark" ? [oneDark] : [];

      const state = EditorState.create({
        doc: value,
        extensions: [...baseExtensions, ...themeExtensions],
      });

      const view = new EditorView({
        state,
        parent: editorRef.current,
      });

      viewRef.current = view;

      return () => {
        if (viewRef.current) {
          try {
            viewRef.current.destroy();
          } catch (e) {
          }
        }
      };
    } catch (e) {
      setEditorError(e.message);
      return () => { };
    }
  }, [stableTables, readOnly, theme, editorAppearance]); // 使用stableTables避免不必要的重新创建

  useEffect(() => {
    // 只在外部value变化时更新编辑器内容
    // 如果是内部更新（用户输入），跳过
    if (viewRef.current && !isInternalUpdate.current) {
      const currentContent = viewRef.current.state.doc.toString();
      // 只有在value不为空且与当前内容不同时才更新
      if (value && value !== currentContent) {
        try {
          const transaction = viewRef.current.state.update({
            changes: {
              from: 0,
              to: viewRef.current.state.doc.length,
              insert: value,
            },
          });
          viewRef.current.dispatch(transaction);
        } catch (e) {
          setEditorError(e.message);
        }
      }
    }
    // 重置标志
    isInternalUpdate.current = false;
  }, [value]);



  return (
    <Box
      className={className}
      style={{
        ...style,
        ...(isFullscreen && {
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 9999,
          backgroundColor: theme === 'dark' ? 'var(--dq-neutral-1000)' : 'var(--dq-surface)',
          padding: '20px',
          boxSizing: 'border-box'
        })
      }}
    >
      {isFullscreen && (
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          borderBottom: '1px solid var(--dq-border-subtle)',
          paddingBottom: '10px'
        }}>
          <Typography variant="h6">SQL编辑器 - 全屏模式</Typography>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={formatSQL}
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '1rem',
                px: 2.5,
                py: 0.5,
                borderRadius: 2,
                borderColor: 'var(--dq-border-subtle)',
                color: 'var(--dq-text-secondary)',
                '&:hover': {
                  borderColor: 'var(--dq-border-hover)',
                  color: 'var(--dq-accent-primary)',
                  backgroundColor: 'var(--dq-surface-hover)'
                }
              }}
            >
              格式化SQL
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={toggleFullscreen}
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '1rem',
                px: 2.5,
                py: 0.5,
                borderRadius: 2,
                borderColor: 'var(--dq-border-subtle)',
                color: 'var(--dq-text-secondary)',
                '&:hover': {
                  borderColor: 'var(--dq-border-hover)',
                  color: 'var(--dq-accent-primary)',
                  backgroundColor: 'var(--dq-surface-hover)'
                }
              }}
            >
              退出全屏
            </Button>
          </Box>
        </Box>
      )}

      {editorError && (
        <Box sx={{ color: "red", mb: 1, fontSize: "1rem" }}>
          编辑器错误: {editorError}
        </Box>
      )}

      <Box
        ref={editorRef}
        sx={{
          width: '100%',
          border: `1px solid ${theme === "dark" ? 'var(--dq-border-card)' : 'var(--dq-border-subtle)'}`,
          borderRadius: "8px",
          overflow: "hidden",
          backgroundColor: theme === "dark" ? 'var(--dq-editor-dark-bg)' : 'var(--dq-editor-light-bg)',
          "& .cm-editor": {
            height: editorViewportHeight,
          },
        }}
      />

    </Box>
  );
});

export default DuckDBSQLEditor;
