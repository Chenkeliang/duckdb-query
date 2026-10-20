import { syntaxTree } from '@codemirror/language';
import { type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  autocompletion,
  completeFromList,
  completionStatus,
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

/** Use the SQL language tree, including the innermost SELECT subquery. */
function completionPosition(context: CompletionContext) {
  const word = context.matchBefore(/[\p{L}_$][\p{L}\p{N}_$]*$/u);
  const tree = syntaxTree(context.state);
  for (let current = tree.resolveInner(context.pos, -1); current; current = current.parent!) {
    if (current.to >= context.pos && /^(String|Number|LineComment|BlockComment)$/.test(current.name)) return null;
  }
  let node = tree.resolveInner(context.state.sliceDoc(0, context.pos).trimEnd().length, -1);
  const qualified = context.matchBefore(/(?:[\p{L}_$][\p{L}\p{N}_$]*|"(?:[^"]|"")+")\.(?:"?[\p{L}\p{N}_$]*)$/u) !== null;
  if (!context.explicit && !word && !qualified) return null;
  let scope = node;
  while (node.parent) {
    if (node.name === 'Statement') { scope = node; break; }
    if (node.name === 'Parens') {
      let hasSelect = false;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name === 'Keyword' && context.state.sliceDoc(child.from, child.to).toUpperCase() === 'SELECT') hasSelect = true;
      }
      if (hasSelect) { scope = node; break; }
    }
    node = node.parent;
  }
  let clause = '';
  let relationExpected = false;
  for (let child = scope.firstChild; child && child.from < (word?.from ?? context.pos); child = child.nextSibling) {
    const value = context.state.sliceDoc(child.from, child.to).toUpperCase();
    if (child.name === 'Keyword' && ['SELECT', 'FROM', 'JOIN', 'WHERE', 'ON', 'HAVING', 'GROUP', 'ORDER', 'LIMIT', 'OFFSET', 'SET', 'INTO', 'UPDATE', 'VALUES'].includes(value)) {
      clause = value;
      relationExpected = ['FROM', 'JOIN', 'INTO', 'UPDATE'].includes(value);
    } else if (value === ',' && ['FROM', 'JOIN'].includes(clause)) {
      relationExpected = true;
    } else if (child.to <= (word?.from ?? context.pos) && /^(Identifier|QuotedIdentifier|CompositeIdentifier|Parens)$/.test(child.name)) {
      relationExpected = false;
    }
  }
  return { qualified, table: relationExpected, column: ['SELECT', 'WHERE', 'ON', 'HAVING', 'GROUP', 'ORDER', 'SET'].includes(clause) };
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
    const position = completionPosition(context);
    if (!position || position.table || position.qualified) return null;
    const columns = getColumnNames();
    if (columns.length === 0) return null;

    const cacheKey = columns.join('\0');
    if (cacheKey !== cachedKey) {
      cachedKey = cacheKey;
      const completions: Completion[] = columns.map((label) => ({
        label,
        type: 'property',
        detail: 'column',
        boost: 25,
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
        boost: 25,
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
  // A partial defaultTable must not create a synthetic relation candidate.
  const relationCompleter = schemaCompletionSource({ schema, dialect });
  const keywordCompleter = keywordCompletionSource(dialect, false);
  const builtinNames = new Set((dialect.spec.builtin ?? '').split(/\s+/).filter(Boolean).map((name) => name.toLowerCase()));

  const schemaSource: CompletionSource = (context) => {
    const position = completionPosition(context);
    if (!position) return null;
    const result = (position.table ? relationCompleter : schemaCompleter)(context);
    if (!result || result instanceof Promise) return result;
    if (position.table) {
      const prefix = context.state.sliceDoc(result.from, context.pos).replace(/^"/, '');
      const builtins = position.qualified || !prefix ? null : keywordCompleter(context);
      const functions = builtins && !(builtins instanceof Promise) && builtins.from === result.from
        ? builtins.options.filter((option) => builtinNames.has(option.label.toLowerCase())) : [];
      return {
        from: result.from,
        to: result.to,
        options: [...result.options.filter((option) => option.type === 'type'), ...functions]
          .filter((option) => matchesColumnNamePrefix(option.label, prefix))
          .sort((a, b) => a.label.localeCompare(b.label)),
        // The source supplies exact prefixes; disable CodeMirror's fuzzy expansion.
        filter: false,
        getMatch: () => prefix ? [0, prefix.length] : [],
        update: (_current, _from, _to, nextContext) => {
          const next = schemaSource(nextContext);
          return next && !(next instanceof Promise) ? next : null;
        },
      };
    }
    return { ...result, options: result.options.map((option) => ({ ...option,
      boost: position.column ? (option.type === 'property' ? 20 : option.type === 'constant' ? 10 : -5) : option.boost })) };
  };

  return [
    dialect.language.data.of({
      wordChars: SQL_WORD_CHARS_CJK,
    }),
    autocompletion({
      activateOnTyping: true,
      defaultKeymap: true,
      maxRenderedOptions: 50,
      activateOnTypingDelay: 180,
      override: [columnCompleter, schemaSource, (context) => {
        const position = completionPosition(context);
        return !position || position.qualified || position.table ? null : keywordCompleter(context);
      }],
    }),
  ];
}

/** Metadata refresh may update an already-open completion, never reopen a dismissed one. */
export function triggerCompletionIfFocused(view: EditorView | null): void {
  if (view?.hasFocus && completionStatus(view.state) !== null) {
    startCompletion(view);
  }
}
