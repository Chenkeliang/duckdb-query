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
  useRef,
  useState,
} from "react";

// Ayu Dark 主题配置
const ayuDarkTheme = EditorView.theme({
  "&": {
    color: "#e6e1cf",
    backgroundColor: "#0f1419"
  },
  ".cm-content": {
    caretColor: "#ffcc66"
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ffcc66" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#253340" },
  ".cm-panels": { backgroundColor: "#0f1419", color: "#e6e1cf" },
  ".cm-panels.cm-panels-top": { borderBottom: "2px solid black" },
  ".cm-panels.cm-panels-bottom": { borderTop: "2px solid black" },
  ".cm-searchMatch": {
    backgroundColor: "#72a1ff59",
    outline: "1px solid #457dff"
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "#6199ff2f"
  },
  ".cm-activeLine": { backgroundColor: "#253340" },
  ".cm-selectionMatch": { backgroundColor: "#aafe661a" },
  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "#bad0f847",
    outline: "1px solid #515a6b"
  },
  ".cm-gutters": {
    backgroundColor: "#0f1419",
    color: "#3c4f66",
    border: "none"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#253340"
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "transparent",
    border: "none",
    color: "#ddd"
  },
  ".cm-tooltip": {
    border: "1px solid #181a1f",
    backgroundColor: "#262a33"
  },
  ".cm-tooltip .cm-tooltip-arrow:before": {
    borderTopColor: "transparent",
    borderBottomColor: "transparent"
  },
  ".cm-tooltip .cm-tooltip-arrow:after": {
    borderTopColor: "#262a33",
    borderBottomColor: "#262a33"
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      backgroundColor: "#72a1ff",
      color: "#262a33"
    }
  }
}, { dark: true });

// GitHub Light 主题 - 更亮的主题
const githubLightTheme = EditorView.theme({
  "&": {
    color: "#24292e",
    backgroundColor: "#ffffff"
  },
  ".cm-content": {
    caretColor: "#24292e"
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#24292e" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#c8c8fa" },
  ".cm-panels": { backgroundColor: "#f6f8fa", color: "#24292e" },
  ".cm-panels.cm-panels-top": { borderBottom: "2px solid #e1e4e8" },
  ".cm-panels.cm-panels-bottom": { borderTop: "2px solid #e1e4e8" },
  ".cm-searchMatch": {
    backgroundColor: "#ffd33d44",
    outline: "1px solid #ffd33d"
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "#ffd33d66"
  },
  ".cm-activeLine": { backgroundColor: "#f6f8fa" },
  ".cm-selectionMatch": { backgroundColor: "#ffd33d44" },
  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "#ffd33d44",
    outline: "1px solid #ffd33d"
  },
  ".cm-gutters": {
    backgroundColor: "#f6f8fa",
    color: "#586069",
    border: "none"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#f6f8fa"
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "transparent",
    border: "none",
    color: "#586069"
  },
  ".cm-tooltip": {
    border: "1px solid #e1e4e8",
    backgroundColor: "#ffffff"
  },
  ".cm-tooltip .cm-tooltip-arrow:before": {
    borderTopColor: "transparent",
    borderBottomColor: "transparent"
  },
  ".cm-tooltip .cm-tooltip-arrow:after": {
    borderTopColor: "#ffffff",
    borderBottomColor: "#ffffff"
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      backgroundColor: "#0366d6",
      color: "#ffffff"
    }
  }
}, { dark: false });

// Solarized Light 主题 - 护眼的浅色主题
const solarizedLightTheme = EditorView.theme({
  "&": {
    color: "#586e75",
    backgroundColor: "#fdf6e3"
  },
  ".cm-content": {
    caretColor: "#586e75"
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#586e75" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#eee8d5" },
  ".cm-panels": { backgroundColor: "#fdf6e3", color: "#586e75" },
  ".cm-panels.cm-panels-top": { borderBottom: "2px solid #93a1a1" },
  ".cm-panels.cm-panels-bottom": { borderTop: "2px solid #93a1a1" },
  ".cm-searchMatch": {
    backgroundColor: "#b5890059",
    outline: "1px solid #b58900"
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "#b5890066"
  },
  ".cm-activeLine": { backgroundColor: "#eee8d5" },
  ".cm-selectionMatch": { backgroundColor: "#b5890059" },
  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "#b5890059",
    outline: "1px solid #b58900"
  },
  ".cm-gutters": {
    backgroundColor: "#eee8d5",
    color: "#93a1a1",
    border: "none"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#eee8d5"
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "transparent",
    border: "none",
    color: "#93a1a1"
  },
  ".cm-tooltip": {
    border: "1px solid #93a1a1",
    backgroundColor: "#fdf6e3"
  },
  ".cm-tooltip .cm-tooltip-arrow:before": {
    borderTopColor: "transparent",
    borderBottomColor: "transparent"
  },
  ".cm-tooltip .cm-tooltip-arrow:after": {
    borderTopColor: "#fdf6e3",
    borderBottomColor: "#fdf6e3"
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      backgroundColor: "#268bd2",
      color: "#fdf6e3"
    }
  }
}, { dark: false });

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
    tables = [],
  } = props;

  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const [editorError, setEditorError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    toggleFullscreen,
    formatSQL,
  }));

  const getTableCompletions = () => {
    return tables.map((table) => ({
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

    console.log('DuckDBSQLEditor: 初始化编辑器，主题:', theme);

    try {
      const state = EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          sql(),
          autocompletion({ override: [enhancedSqlCompletions] }),
          lintGutter(),
          keymap.of([indentWithTab]), // 添加Tab缩进支持
          EditorView.lineWrapping, // 添加自动换行
          (() => {
            console.log('DuckDBSQLEditor: 选择主题，当前主题:', theme);
            if (theme === "dark") {
              console.log('DuckDBSQLEditor: 使用 oneDark 主题');
              return oneDark;
            } else if (theme === "github-light") {
              console.log('DuckDBSQLEditor: 使用 githubLightTheme 主题');
              return githubLightTheme;
            } else if (theme === "solarized-light") {
              console.log('DuckDBSQLEditor: 使用 solarizedLightTheme 主题');
              return solarizedLightTheme;
            } else {
              console.log('DuckDBSQLEditor: 使用默认主题');
              return [];
            }
          })(),
          EditorView.editable.of(!readOnly), // 添加 readOnly 状态控制
          EditorView.updateListener.of((update) => {
            if (update.docChanged && onChange) {
              try {
                onChange(update.state.doc.toString());
              } catch (e) {
                console.error("更新文档时出错:", e);
              }
            }
          }),
          EditorView.theme({
            "&": {
              height: isFullscreen ? "100vh" : height,
              fontSize: "14px",
              fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
            },
            ".cm-editor": {
              height: "100%",
            },
            ".cm-scroller": {
              fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
            },
            ".cm-placeholder": {
              color: "#999",
            },
          }),
        ],
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
            console.error("销毁编辑器时出错:", e);
          }
        }
      };
    } catch (e) {
      console.error("初始化编辑器时出错:", e);
      setEditorError(e.message);
      return () => { };
    }
  }, [tables, readOnly, theme, isFullscreen]); // 添加 theme 和 isFullscreen 到依赖数组

  useEffect(() => {
    if (viewRef.current && value !== viewRef.current.state.doc.toString()) {
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
        console.error("更新编辑器内容时出错:", e);
        setEditorError(e.message);
      }
    }
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
          backgroundColor: 'white',
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
          borderBottom: '1px solid #ccc',
          paddingBottom: '10px'
        }}>
          <Typography variant="h6">SQL编辑器 - 全屏模式</Typography>
          <Box>
            <Button
              variant="outlined"
              size="small"
              onClick={formatSQL}
              sx={{ mr: 1 }}
            >
              格式化SQL
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={toggleFullscreen}
            >
              退出全屏
            </Button>
          </Box>
        </Box>
      )}

      {editorError && (
        <Box sx={{ color: "red", mb: 1, fontSize: "0.875rem" }}>
          编辑器错误: {editorError}
        </Box>
      )}

      <Box
        ref={editorRef}
        sx={{
          border: "1px solid #ccc",
          borderRadius: "4px",
          overflow: "hidden",
          "& .cm-editor": {
            height: isFullscreen ? "calc(100vh - 120px)" : height,
          },
        }}
      />

      {!isFullscreen && (
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={formatSQL}
            sx={{ mr: 1 }}
          >
            格式化SQL
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={toggleFullscreen}
          >
            全屏编辑
          </Button>
        </Box>
      )}
    </Box>
  );
});

export default DuckDBSQLEditor;
