/**
 * SQL 专用语法高亮。颜色全部来自主题 token（--syn-*），浅色 / 深色由 :root / .dark 提供，
 * 两套 HighlightStyle 仅 themeType 不同，切换主题时 Compartment 整包替换。
 */
import { HighlightStyle, type TagStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const syn = (name: string) => `hsl(var(--syn-${name}))`;

const SQL_TAG_STYLES: TagStyle[] = [
  { tag: tags.keyword, color: syn('keyword'), fontWeight: '500' },
  { tag: tags.operatorKeyword, color: syn('keyword'), fontWeight: '500' },
  { tag: [tags.name, tags.propertyName, tags.variableName], color: 'hsl(var(--foreground))' },
  { tag: tags.standard(tags.name), color: syn('function') },
  { tag: tags.typeName, color: syn('function') },
  { tag: tags.operator, color: syn('punct') },
  { tag: tags.punctuation, color: syn('punct') },
  { tag: [tags.bracket, tags.squareBracket, tags.brace, tags.paren], color: syn('punct') },
  { tag: [tags.number, tags.integer, tags.float], color: syn('number') },
  { tag: [tags.string, tags.special(tags.string)], color: syn('string') },
  { tag: tags.comment, color: syn('comment'), fontStyle: 'italic' },
  { tag: [tags.bool, tags.null], color: syn('keyword') },
];

export const sqlHighlightLight = HighlightStyle.define(SQL_TAG_STYLES, { themeType: 'light' });

export const sqlHighlightDark = HighlightStyle.define(SQL_TAG_STYLES, { themeType: 'dark' });
