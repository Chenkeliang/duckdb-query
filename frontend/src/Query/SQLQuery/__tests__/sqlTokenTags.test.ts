// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { sql } from '@codemirror/lang-sql';
import { ensureSyntaxTree } from '@codemirror/language';
import { duckDBDialect } from '../sqlDialect';
import { sqlEditorLightTheme } from '../sqlEditorTheme';

const SAMPLE = 'SELECT * FROM sample_orders LIMIT 10000';

function nodeNamesAt(doc: string) {
  // 2026-11-03: initial state trees can be partial when the parser's time budget expires.
  const tree = sql({ dialect: duckDBDialect, upperCaseKeywords: true }).language.parser.parse(doc);
  const parts: { text: string; name: string; from: number; to: number }[] = [];
  tree.cursor().iterate((node) => {
    if (node.from < node.to && node.name !== 'Statement') {
      parts.push({
        text: doc.slice(node.from, node.to),
        name: node.name,
        from: node.from,
        to: node.to,
      });
    }
  });
  return parts;
}

describe('SQL token names', () => {
  it('关键字应为 Keyword 节点', () => {
    const parts = nodeNamesAt(SAMPLE);
    const select = parts.find((p) => p.text === 'SELECT');
    const from = parts.find((p) => p.text === 'FROM');
    const limit = parts.find((p) => p.text === 'LIMIT');
    expect(select?.name).toBe('Keyword');
    expect(from?.name).toBe('Keyword');
    expect(limit?.name).toBe('Keyword');
  });

  it('表名应为 Identifier', () => {
    const parts = nodeNamesAt(SAMPLE);
    const table = parts.find((p) => p.text === 'sample_orders');
    expect(table?.name).toBe('Identifier');
  });

  it('DuckDB 2.0 JSON mutation functions should use builtin tokens', () => {
    const functions = ['json_set', 'json_insert', 'json_replace', 'json_remove'];
    const document = `SELECT ${functions
      .map((name) => `${name}('{}', '$.value', '1')`)
      .join(', ')}`;
    const parts = nodeNamesAt(document);

    for (const name of functions) {
      expect(parts.find((part) => part.text === name)?.name).toBe('Builtin');
    }
  });
});

describe('SQL editor DOM classes', () => {
  it('浅色：SELECT 与表名应使用不同 span class', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc: SAMPLE,
      extensions: [
        sql({ dialect: duckDBDialect, upperCaseKeywords: true }),
        sqlEditorLightTheme,
      ],
    });
    expect(ensureSyntaxTree(state, state.doc.length, 1000)).not.toBeNull();
    const view = new EditorView({ state, parent });
    const line = parent.querySelector('.cm-line')!;
    const spans = [...line.querySelectorAll('span')].map((s) => ({
      text: s.textContent,
      className: s.className,
    }));
    const selectSpan = spans.find((s) => s.text === 'SELECT');
    const tableSpan = spans.find((s) => s.text === 'sample_orders');
    expect(selectSpan).toBeTruthy();
    expect(tableSpan).toBeTruthy();
    expect(selectSpan!.className).not.toBe(tableSpan!.className);
    view.destroy();
    parent.remove();
  });
});
