import { describe, expect, it } from 'vitest';
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

    const result = completer(context);
    expect(result).not.toBeNull();
    expect(result?.options.map((o) => o.label)).toContain('手机号');
    const labels = result?.options.map((o) => o.label) ?? [];
    expect(labels.every((l) => String(l).startsWith('手机') || String(l).includes('手机'))).toBe(
      true
    );
  });
});
