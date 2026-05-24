/**
 * SQL 编辑器主题：浅色 / 深色两套独立整包（chrome + 语法高亮），切换时 Compartment 整包替换。
 */
import { EditorView } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { sqlHighlightDark, sqlHighlightLight } from './sqlHighlightStyles';

const sqlEditorChromeLight = EditorView.theme(
  {
    '&': {
      backgroundColor: 'hsl(var(--background))',
      color: '#24292f',
    },
    '.cm-content': {
      caretColor: '#24292f',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#24292f',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: 'hsl(var(--primary) / 0.2)',
      },
    '.cm-gutters': {
      backgroundColor: 'hsl(var(--muted))',
      color: 'hsl(var(--muted-foreground))',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'hsl(var(--muted) / 0.35)',
    },
  },
  { dark: false }
);

const sqlEditorChromeDark = EditorView.theme(
  {
    '&': {
      color: '#abb2bf',
      backgroundColor: '#282c34',
    },
    '.cm-content': {
      caretColor: '#528bff',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#528bff',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: '#3e4451',
      },
    '.cm-gutters': {
      backgroundColor: '#282c34',
      color: '#5c6370',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: '#2c313a',
    },
  },
  { dark: true }
);

/** 浅色整包 */
export const sqlEditorLightTheme: Extension = [
  sqlEditorChromeLight,
  syntaxHighlighting(sqlHighlightLight),
];

/** 深色整包 */
export const sqlEditorDarkTheme: Extension = [
  sqlEditorChromeDark,
  syntaxHighlighting(sqlHighlightDark),
];

export function getSqlEditorIsDarkMode(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
  );
}

export function sqlEditorThemeExtensions(isDarkMode: boolean): Extension {
  return isDarkMode ? sqlEditorDarkTheme : sqlEditorLightTheme;
}
