/**
 * SQL 专用语法高亮（浅色 / 深色各一套，含 tags.name，互不混用）
 */
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/** 浅色：关键字蓝、标识符棕、运算符灰、数字绿 */
export const sqlHighlightLight = HighlightStyle.define(
  [
    { tag: tags.keyword, color: '#0550ae', fontWeight: '600' },
    { tag: tags.operatorKeyword, color: '#0550ae', fontWeight: '600' },
    { tag: [tags.name, tags.propertyName, tags.variableName], color: '#953800' },
    { tag: tags.standard(tags.name), color: '#8250df' },
    { tag: tags.typeName, color: '#116329' },
    { tag: tags.operator, color: '#57606a' },
    { tag: tags.punctuation, color: '#57606a' },
    { tag: [tags.bracket, tags.squareBracket, tags.brace, tags.paren], color: '#57606a' },
    { tag: [tags.number, tags.integer, tags.float], color: '#116329' },
    { tag: [tags.string, tags.special(tags.string)], color: '#0a3069' },
    { tag: tags.comment, color: '#6e7781', fontStyle: 'italic' },
    { tag: [tags.bool, tags.null], color: '#0550ae' },
  ],
  { themeType: 'light' }
);

/** 深色：关键字紫、标识符蓝、运算符青、数字橙 */
export const sqlHighlightDark = HighlightStyle.define(
  [
    { tag: tags.keyword, color: '#c678dd', fontWeight: '600' },
    { tag: tags.operatorKeyword, color: '#c678dd', fontWeight: '600' },
    { tag: [tags.name, tags.propertyName, tags.variableName], color: '#61afef' },
    { tag: tags.standard(tags.name), color: '#d19a66' },
    { tag: tags.typeName, color: '#e5c07b' },
    { tag: tags.operator, color: '#56b6c2' },
    { tag: tags.punctuation, color: '#abb2bf' },
    { tag: [tags.bracket, tags.squareBracket, tags.brace, tags.paren], color: '#abb2bf' },
    { tag: [tags.number, tags.integer, tags.float], color: '#d19a66' },
    { tag: [tags.string, tags.special(tags.string)], color: '#98c379' },
    { tag: tags.comment, color: '#7d8799', fontStyle: 'italic' },
    { tag: [tags.bool, tags.null], color: '#d19a66' },
  ],
  { themeType: 'dark' }
);
