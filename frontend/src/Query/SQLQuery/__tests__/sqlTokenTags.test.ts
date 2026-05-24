// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { sql } from '@codemirror/lang-sql';
import { syntaxTree } from '@codemirror/language';
import { duckDBDialect } from '../sqlDialect';
import { sqlEditorLightTheme } from '../sqlEditorTheme';

const SAMPLE = 'SELECT * FROM left0423_jst_del LIMIT 10000';

function nodeNamesAt(doc: string) {
  const state = EditorState.create({
    doc,
    extensions: [sql({ dialect: duckDBDialect, upperCaseKeywords: true })],
  });
  const tree = syntaxTree(state);
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
    const table = parts.find((p) => p.text === 'left0423_jst_del');
    expect(table?.name).toBe('Identifier');
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
    const view = new EditorView({ state, parent });
    const line = parent.querySelector('.cm-line')!;
    const spans = [...line.querySelectorAll('span')].map((s) => ({
      text: s.textContent,
      className: s.className,
    }));
    const selectSpan = spans.find((s) => s.text === 'SELECT');
    const tableSpan = spans.find((s) => s.text === 'left0423_jst_del');
    expect(selectSpan).toBeTruthy();
    expect(tableSpan).toBeTruthy();
    expect(selectSpan!.className).not.toBe(tableSpan!.className);
    view.destroy();
    parent.remove();
  });
});
