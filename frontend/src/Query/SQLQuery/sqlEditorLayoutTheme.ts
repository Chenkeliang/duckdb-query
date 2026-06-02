/**
 * SQL 编辑器布局主题：字号、内边距、高度等。
 * 与语法配色分离，避免覆盖 token 颜色。
 */
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export function createSqlEditorLayoutTheme(options: {
  minHeight?: string;
  maxHeight?: string;
  placeholderColor?: string;
  fontSize?: string;
  contentPadding?: string;
  linePadding?: string;
}): Extension {
  const {
    minHeight,
    maxHeight,
    placeholderColor = 'hsl(var(--muted-foreground))',
    fontSize = '14px',
    contentPadding = '8px 0',
    linePadding = '0 8px',
  } = options;

  return EditorView.theme({
    '&': {
      height: '100%',
      ...(minHeight ? { minHeight } : {}),
      ...(maxHeight ? { maxHeight } : {}),
      fontSize,
      fontFamily: 'var(--font-mono)',
    },
    '.cm-scroller': {
      overflow: 'auto',
      ...(minHeight ? { minHeight } : {}),
      ...(maxHeight ? { maxHeight } : {}),
    },
    '.cm-content': {
      padding: contentPadding,
    },
    '.cm-line': {
      padding: linePadding,
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-placeholder': {
      color: placeholderColor,
      fontStyle: 'italic',
    },
  });
}
