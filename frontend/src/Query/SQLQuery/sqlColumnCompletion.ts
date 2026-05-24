import { type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  autocompletion,
  completeFromList,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionSource,
} from '@codemirror/autocomplete';
import {
  keywordCompletionSource,
  schemaCompletionSource,
  type SQLDialect,
} from '@codemirror/lang-sql';
import { matchesColumnNamePrefix } from '@/utils/sqlAutocompleteSchema';
import { needsQuoting, quoteIdent } from '@/utils/sqlUtils';

/** CJK 等作为 SQL “词”字符，便于补全识别中文列名前缀 */
export const SQL_WORD_CHARS_CJK =
  '_$' +
  '\u4e00-\u9fff' +
  '\u3400-\u4dbf' +
  '\uf900-\ufaff';

function applyColumnName(name: string): string {
  return needsQuoting(name) ? quoteIdent(name, 'duckdb') : name;
}

/**
 * 列名前缀补全（优先于关键字）；中文列名走 completeFromList 的 Unicode 前缀匹配
 */
export function createColumnPrefixCompleter(
  getColumnNames: () => string[]
): CompletionSource {
  let cachedKey = '';
  let cachedSource: CompletionSource | null = null;

  return (context: CompletionContext) => {
    const columns = getColumnNames();
    if (columns.length === 0) return null;

    const cacheKey = columns.join('\0');
    if (cacheKey !== cachedKey) {
      cachedKey = cacheKey;
      const completions: Completion[] = columns.map((label) => ({
        label,
        type: 'property',
        detail: 'column',
        boost: 2,
        apply: applyColumnName(label),
      }));
      cachedSource = completeFromList(completions);
    }

    const raw = cachedSource?.(context) ?? null;
    const result = raw && !(raw instanceof Promise) ? raw : null;
    if (result) {
      const typed = context.state.sliceDoc(result.from, context.pos).replace(/^"/, '');
      if (typed.length > 0) {
        const filtered = result.options.filter((option) =>
          matchesColumnNamePrefix(String(option.label), typed)
        );
        if (filtered.length > 0) {
          return { ...result, options: filtered };
        }
      } else if (result.options.length > 0) {
        return result;
      }
    }

    const word = context.matchBefore(/[^\s,();]+$/);
    if (!word || word.text.length < 1) {
      return null;
    }
    const prefix = word.text.replace(/^"/, '');
    const options: Completion[] = columns
      .filter((col) => matchesColumnNamePrefix(col, prefix))
      .slice(0, 50)
      .map((col) => ({
        label: col,
        type: 'property' as const,
        detail: 'column',
        boost: 2,
        apply: applyColumnName(col),
      }));
    if (options.length === 0) return null;
    return { from: word.from, options };
  };
}

export interface SqlAutocompleteConfig {
  schema: Record<string, string[]>;
  dialect: SQLDialect;
  defaultTable?: string;
  getColumnNames: () => string[];
}

/** 合并列名 / schema / 关键字补全（override 须包含 lang-sql 内置源） */
export function buildSqlAutocompletion(config: SqlAutocompleteConfig): Extension {
  const { schema, dialect, defaultTable, getColumnNames } = config;
  const columnCompleter = createColumnPrefixCompleter(getColumnNames);
  const schemaCompleter = schemaCompletionSource({
    schema,
    dialect,
    defaultTable,
  });
  const keywordCompleter = keywordCompletionSource(dialect, false);

  return [
    dialect.language.data.of({
      wordChars: SQL_WORD_CHARS_CJK,
    }),
    autocompletion({
      activateOnTyping: true,
      defaultKeymap: true,
      maxRenderedOptions: 50,
      activateOnTypingDelay: 80,
      override: [columnCompleter, schemaCompleter, keywordCompleter],
    }),
  ];
}

/** 列数据到达后若编辑器聚焦，重新弹出补全 */
export function triggerCompletionIfFocused(view: EditorView | null): void {
  if (view?.hasFocus) {
    startCompletion(view);
  }
}
