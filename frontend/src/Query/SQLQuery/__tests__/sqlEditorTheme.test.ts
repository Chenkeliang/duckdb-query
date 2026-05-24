// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { sql } from '@codemirror/lang-sql';
import { highlightingFor } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { duckDBDialect } from '../sqlDialect';
import {
  sqlEditorDarkTheme,
  sqlEditorLightTheme,
} from '../sqlEditorTheme';

const SAMPLE_SQL = 'SELECT * FROM users LIMIT 10';

describe('sqlEditorTheme', () => {
  let parent: HTMLDivElement;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
  });

  afterEach(() => {
    parent.remove();
  });

  function createView(theme: typeof sqlEditorLightTheme) {
    const state = EditorState.create({
      doc: SAMPLE_SQL,
      extensions: [
        sql({ dialect: duckDBDialect, upperCaseKeywords: true }),
        createSqlEditorLayoutThemeStub(),
        theme,
      ],
    });
    return new EditorView({ state, parent });
  }

  function createSqlEditorLayoutThemeStub() {
    return EditorView.theme({ '&': { height: '120px' } });
  }

  function highlightedClassCount(view: EditorView) {
    const kw = highlightingFor(view.state, [tags.keyword]);
    const name = highlightingFor(view.state, [tags.name]);
    const operator = highlightingFor(view.state, [tags.operator]);
    const number = highlightingFor(view.state, [tags.number]);
    return { kw, name, operator, number };
  }

  it('浅色：关键字、表名、运算符、数字均有独立高亮 class', () => {
    const view = createView(sqlEditorLightTheme);
    const classes = highlightedClassCount(view);
    expect(classes.kw).toBeTruthy();
    expect(classes.name).toBeTruthy();
    expect(classes.operator).toBeTruthy();
    expect(classes.number).toBeTruthy();
    expect(classes.kw).not.toBe(classes.name);

    const line = parent.querySelector('.cm-line');
    expect(line?.querySelectorAll('span').length).toBeGreaterThan(3);
    view.destroy();
  });

  it('深色：关键字、表名、运算符、数字均有独立高亮 class', () => {
    const view = createView(sqlEditorDarkTheme);
    const classes = highlightedClassCount(view);
    expect(classes.kw).toBeTruthy();
    expect(classes.name).toBeTruthy();
    expect(classes.operator).toBeTruthy();
    expect(classes.number).toBeTruthy();
    expect(classes.kw).not.toBe(classes.name);
    view.destroy();
  });
});
