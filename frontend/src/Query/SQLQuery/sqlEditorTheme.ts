/**
 * SQL 编辑器主题：浅色 / 深色两套独立整包（chrome + 语法高亮），切换时 Compartment 整包替换。
 */
import { EditorView } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { sqlHighlightDark, sqlHighlightLight } from './sqlHighlightStyles';

// Chrome follows the theme tokens, so both bundles share one spec and differ only in `dark`.
const sqlEditorChromeSpec = {
  '&': {
    backgroundColor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
  },
  '.cm-content': {
    caretColor: 'hsl(var(--primary))',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'hsl(var(--primary))',
    borderLeftWidth: '2px',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    {
      backgroundColor: 'hsl(var(--primary) / 0.22)',
    },
  '.cm-gutters': {
    backgroundColor: 'hsl(var(--background))',
    color: 'hsl(var(--muted-foreground))',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'hsl(var(--foreground))',
  },
  '.cm-activeLine': {
    backgroundColor: 'hsl(var(--surface))',
  },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy hsl(var(--error))',
    textUnderlineOffset: '4px',
  },
};

const sqlEditorChromeLight = EditorView.theme(sqlEditorChromeSpec, { dark: false });

const sqlEditorChromeDark = EditorView.theme(sqlEditorChromeSpec, { dark: true });

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
