import { describe, expect, it } from 'vitest';
import { duckDBDialect } from '../sqlDialect';
import { sql, StandardSQL } from '@codemirror/lang-sql';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { createColumnPrefixCompleter } from '../sqlColumnCompletion';

describe('createColumnPrefixCompleter', () => {
  it('suggests Chinese columns for prefix 手机', () => {
    const columns = ['手机号', '产品名称', '订单号'];
    const completer = createColumnPrefixCompleter(() => columns);
    const state = EditorState.create({
      doc: 'SELECT * FROM t WHERE 手机',
    });
    const pos = state.doc.length;
    const context = {
      state,
      pos,
      explicit: false,
      matchBefore: (re: RegExp) => {
        const line = state.doc.lineAt(pos);
        const start = Math.max(line.from, pos - 250);
        const str = line.text.slice(start - line.from, pos - line.from);
        const found = str.search(re);
        if (found < 0) return null;
        return { from: start + found, to: pos, text: str.slice(found) };
      },
    } as Parameters<typeof completer>[0];

    const raw = completer(context);
    expect(raw).not.toBeNull();
    expect(raw).not.toBeInstanceOf(Promise);
    if (!raw || raw instanceof Promise) return;
    expect(raw.options.map((o) => o.label)).toContain('手机号');
    const labels = raw.options.map((o) => o.label);
    expect(labels.every((l) => String(l).startsWith('手机') || String(l).includes('手机'))).toBe(
      true
    );
  });
});


describe('column completion context', () => {
  const source = createColumnPrefixCompleter(() => ['orders', '手机号', '123_code', 'user_id']);
  function complete(doc: string, explicit = false) {
    const state = EditorState.create({ doc, extensions: [sql({ dialect: StandardSQL })] });
    return source(new CompletionContext(state, doc.length, explicit));
  }
  it.each(['SELECT 123', "SELECT 'user", 'SELECT -- user', 'SELECT /* user', 'SELECT '])('does not automatically suggest columns in %s', (doc) => {
    expect(complete(doc)).toBeNull();
  });
  it.each(['SELECT ', 'SELECT 1 ', "SELECT 'x' ", 'SELECT -- note\n'])('keeps explicit completion after token boundaries in %s', (doc) => {
    expect(complete(doc, true)).not.toBeNull();
  });
  it('does not mix unrelated columns into qualified aliases', () => {
    expect(complete('SELECT o.')).toBeNull();
  });
  it.each(['SELECT * FROM or', 'SELECT * FROM users JOIN or'])('keeps table positions free of global column hints', (doc) => {
    expect(complete(doc)).toBeNull();
  });
});

// Exercise CodeMirror's real composition/ranking, including its SQL alias resolver.
import { EditorView } from '@codemirror/view';
import { closeCompletion, currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { buildSqlAutocompletion, triggerCompletionIfFocused } from '../sqlColumnCompletion';
import { afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((view) => view.destroy()));
function editor(doc: string, pos = doc.length) {
  const schema = { orders: ['order_id', 'total', '手机号'], users: ['user_id', 'email'] };
  const view = new EditorView({ parent: document.body, state: EditorState.create({ doc, selection: { anchor: pos }, extensions: [sql({ dialect: StandardSQL }), buildSqlAutocompletion({ schema, dialect: StandardSQL, getColumnNames: () => ['order_id', 'total', 'user_id', '手机号'] })] }) });
  views.push(view); view.focus(); return view;
}
async function options(doc: string, pos?: number) {
  const view = editor(doc, pos); startCompletion(view);
  await waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0));
  return currentCompletions(view.state);
}
describe('SQL source ordering and refresh', () => {
  it('ranks tables first after FROM without ambient columns', async () => {
    const labels = (await options('SELECT * FROM ')).map((option) => option.label);
    expect(labels.slice(0, 2).sort()).toEqual(['orders', 'users']);
    expect(labels).not.toContain('order_id');
  });
  it('ranks fields first in SELECT', async () => {
    const results = await options('SELECT ');
    expect(results[0].type).toBe('property');
  });
  it('limits alias-dot completion to fields of that alias', async () => {
    const doc = 'SELECT o. FROM orders AS o JOIN users AS u ON o.order_id = u.user_id';
    const labels = (await options(doc, 'SELECT o.'.length)).map((option) => option.label);
    expect(labels).toContain('order_id'); expect(labels).not.toContain('user_id'); expect(labels).not.toContain('users'); expect(labels).not.toContain('SELECT');
  });
  it('uses the innermost query for context', async () => {
    const doc = 'SELECT (SELECT * FROM ) FROM orders';
    const results = await options(doc, 'SELECT (SELECT * FROM '.length);
    expect(results[0].type).not.toBe('property');
  });
  it('metadata arrival never opens a closed or escaped completion', async () => {
    const view = editor('SELECT total'); triggerCompletionIfFocused(view);
    expect(currentCompletions(view.state)).toEqual([]);
    startCompletion(view); await waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0));
    closeCompletion(view); triggerCompletionIfFocused(view);
    expect(currentCompletions(view.state)).toEqual([]);
  });
});


describe('DuckDB relation completion noise', () => {
  function relationEditor(doc: string, defaultTable = 'So1') {
    const schema = { So1: ['sub_order_id', 'source_id'], also: [], json: [], jsonb: [], orders: [] };
    const view = new EditorView({ parent: document.body, state: EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [sql({ dialect: duckDBDialect }), buildSqlAutocompletion({ schema, defaultTable, dialect: duckDBDialect, getColumnNames: () => schema.So1 })] }) });
    views.push(view); view.focus(); return view;
  }
  it.each(['select * from so', 'SELECT * FROM so', 'select * from orders join so'])('only offers case-insensitive table prefixes in %s', async (doc) => {
    const view = relationEditor(doc); startCompletion(view);
    await waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0));
    expect(currentCompletions(view.state).map(option => option.label)).toEqual(['So1']);
  });
  it('does not offer an unfinished parsed default table as a real table', async () => {
    const view = relationEditor('select * from so', 'so'); startCompletion(view);
    await waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0));
    expect(currentCompletions(view.state).map(option => option.label)).toEqual(['So1']);
  });
  it('keeps built-in function prefixes used by FROM read_csv/read_parquet', async () => {
    const view = relationEditor('select * from read_'); startCompletion(view);
    await waitFor(() => expect(currentCompletions(view.state).map(option => option.label)).toContain('read_csv'));
    expect(currentCompletions(view.state).map(option => option.label)).toContain('read_parquet');
    expect(currentCompletions(view.state).every(option => option.label.startsWith('read_'))).toBe(true);
  });
  it('keeps clause keywords after a completed table name', async () => {
    const view = relationEditor('select * from So1 wh'); startCompletion(view);
    await waitFor(() => expect(currentCompletions(view.state).map(option => option.label)).toContain('where'));
  });
  it('refilters after typing and deletion without keeping stale candidates', async () => {
    const view = relationEditor('select * from s'); startCompletion(view);
    await waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0));
    view.dispatch({changes: {from: view.state.doc.length, insert: 'o'}, selection: {anchor: view.state.doc.length + 1}, userEvent: 'input.type'});
    await waitFor(() => expect(currentCompletions(view.state).map(option => option.label)).toEqual(['So1']));
    view.dispatch({changes: {from: view.state.doc.length - 2, to: view.state.doc.length, insert: 'or'}, selection: {anchor: view.state.doc.length}, userEvent: 'input.type'});
    await waitFor(() => expect(currentCompletions(view.state).map(option => option.label)).toEqual(['orders']));
  });
});
