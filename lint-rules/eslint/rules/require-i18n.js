/**
 * 规则: require-i18n
 * 
 * 检测代码中的中文字符串，要求使用 i18n 国际化
 * 
 * 支持检测：
 * - JSX 文本节点中的中文
 * - 字符串字面量中的中文
 * - 模板字符串中的中文
 */

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: '检测中文字符串，要求使用 i18n 国际化',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/your-org/duckquery/blob/main/lint-rules/eslint/docs/require-i18n.md',
    },
    messages: {
      chineseTextFound: '❌ 发现中文文本 "{{text}}"，请使用 i18n 翻译',
      suggestion: '建议: 使用 t("{{key}}") 或在翻译文件中添加对应的 key',
      missingI18nImport: '💡 提示: 需要导入 useTranslation: import { useTranslation } from "react-i18next"',
    },
    schema: [
      {
        type: 'object',
        properties: {
          // 允许的中文文本（白名单）
          allowList: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
          // 是否检查注释中的中文
          checkComments: {
            type: 'boolean',
            default: false,
          },
          // 是否检查 console.log 中的中文
          checkConsole: {
            type: 'boolean',
            default: false,
          },
          // 最小中文字符数（少于此数量不报错）
          minChineseChars: {
            type: 'number',
            default: 1,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const { isLintScopedFrontend } = require('../utils/frontend-scope');
    const filename = context.getFilename();
    const sourceCode = context.getSourceCode();

    if (!isLintScopedFrontend(filename)) {
      return {};
    }

    // 获取配置选项
    const options = context.options[0] || {};
    const allowList = options.allowList || [];
    const checkComments = options.checkComments || false;
    const checkConsole = options.checkConsole || false;
    const minChineseChars = options.minChineseChars || 1;

    // 中文字符正则表达式（包括中文标点）
    const chineseRegex = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g;

    // 检查是否导入了 useTranslation
    let hasI18nImport = false;

    /**
     * 检查文本是否包含中文
     */
    function hasChinese(text) {
      if (!text || typeof text !== 'string') return false;
      const matches = text.match(chineseRegex);
      return matches && matches.length >= minChineseChars;
    }

    /**
     * 检查文本是否在白名单中
     */
    function isInAllowList(text) {
      return allowList.some(allowed => text.includes(allowed));
    }

    /**
     * 提取中文文本（用于错误消息）
     */
    function extractChineseText(text, maxLength = 20) {
      if (!text) return '';
      const trimmed = text.trim();
      if (trimmed.length > maxLength) {
        return trimmed.substring(0, maxLength) + '...';
      }
      return trimmed;
    }

    /**
     * 生成建议的 i18n key
     */
    function suggestI18nKey(text) {
      // 简单的 key 生成逻辑
      const cleaned = text.trim().substring(0, 30);
      const pinyin = cleaned
        .replace(/[\u4e00-\u9fa5]/g, 'text')
        .replace(/[^\w]/g, '_')
        .toLowerCase();
      return pinyin || 'your_key_here';
    }

    /**
     * 报告中文文本错误
     */
    function reportChineseText(node, text) {
      if (!hasChinese(text) || isInAllowList(text)) {
        return;
      }

      const extractedText = extractChineseText(text);
      const suggestedKey = suggestI18nKey(text);

      context.report({
        node,
        messageId: 'chineseTextFound',
        data: {
          text: extractedText,
        },
      });
    }

    return {
      // 检查 import 语句
      ImportDeclaration(node) {
        if (node.source.value === 'react-i18next') {
          const hasUseTranslation = node.specifiers.some(
            spec => spec.imported && spec.imported.name === 'useTranslation'
          );
          if (hasUseTranslation) {
            hasI18nImport = true;
          }
        }
      },

      // 检查 JSX 文本节点
      JSXText(node) {
        const text = node.value;
        reportChineseText(node, text);
      },

      // 检查 JSX 属性中的字符串
      'JSXAttribute > Literal'(node) {
        // 排除某些不需要翻译的属性
        const parent = node.parent;
        const attrName = parent.name?.name;
        
        // 这些属性通常不需要翻译
        const skipAttributes = [
          'className',
          'id',
          'key',
          'ref',
          'style',
          'type',
          'name',
          'value',
          'href',
          'src',
          'alt', // alt 可能需要翻译，但通常是描述性的
        ];

        if (skipAttributes.includes(attrName)) {
          return;
        }

        reportChineseText(node, node.value);
      },

      // 检查字符串字面量
      Literal(node) {
        // 跳过已经在 JSX 属性中检查过的
        if (node.parent.type === 'JSXAttribute') {
          return;
        }

        // 跳过对象的 key
        if (node.parent.type === 'Property' && node.parent.key === node) {
          return;
        }

        // 检查 console.log
        if (!checkConsole) {
          let parent = node.parent;
          while (parent) {
            if (
              parent.type === 'CallExpression' &&
              parent.callee.type === 'MemberExpression' &&
              parent.callee.object.name === 'console'
            ) {
              return; // 跳过 console 调用
            }
            parent = parent.parent;
          }
        }

        if (typeof node.value === 'string') {
          reportChineseText(node, node.value);
        }
      },

      // 检查模板字符串
      TemplateLiteral(node) {
        node.quasis.forEach(quasi => {
          reportChineseText(quasi, quasi.value.raw);
        });
      },

      // 检查注释（可选）
      Program(node) {
        if (!checkComments) {
          return;
        }

        const comments = sourceCode.getAllComments();
        comments.forEach(comment => {
          if (hasChinese(comment.value) && !isInAllowList(comment.value)) {
            const extractedText = extractChineseText(comment.value);
            context.report({
              loc: comment.loc,
              messageId: 'chineseTextFound',
              data: {
                text: extractedText,
              },
            });
          }
        });
      },
    };
  },
};
