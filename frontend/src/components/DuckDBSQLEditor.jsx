import { autocompletion } from "@codemirror/autocomplete";
import { sql } from "@codemirror/lang-sql";
import { lintGutter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { Box } from "@mui/material";
import { EditorView, basicSetup } from "codemirror";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
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
    tables = [],
  } = props;

  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const [editorError, setEditorError] = useState(null);

  // Expose a function to get the current value
  useImperativeHandle(ref, () => ({
    getValue: () => {
      if (viewRef.current) {
        return viewRef.current.state.doc.toString();
      }
      return value; // Fallback to prop value
    },
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

    try {
      const state = EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          sql(),
          autocompletion({ override: [enhancedSqlCompletions] }),
          lintGutter(),
          theme === "dark" ? oneDark : [],
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
              height: height,
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
  }, [tables, readOnly]); // 添加 readOnly 到依赖数组

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
    <Box className={className} style={style}>
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
            height: height,
          },
        }}
      />
    </Box>
  );
});

export default DuckDBSQLEditor;
