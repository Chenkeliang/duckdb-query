/**
 * 规则: no-hardcoded-colors
 * 
 * 禁止硬编码颜色值 (hex, rgb, rgba)
 * 
 * 应该使用 Tailwind CSS 语义类
 */

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: '禁止硬编码颜色值',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/your-org/duckquery/blob/main/lint-rules/eslint/docs/no-hardcoded-colors.md',
    },
    messages: {
      noHardcodedColor: '❌ 禁止硬编码颜色 ({{colorValue}})，请使用 Tailwind 语义类',
      suggestion: '建议使用: text-primary, bg-background, border-border 等',
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();
    
    // 只检查新布局目录
    const isNewLayout = filename.includes('/src/new/') || filename.includes('\\src\\new\\');
    
    if (!isNewLayout) {
      return {};
    }

    // 颜色值正则表达式
    const hexColorRegex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
    const rgbColorRegex = /rgba?\s*\([^)]+\)/;

    function checkForHardcodedColor(node, value) {
      if (typeof value !== 'string') return;

      const hexMatch = value.match(hexColorRegex);
      const rgbMatch = value.match(rgbColorRegex);

      if (hexMatch || rgbMatch) {
        context.report({
          node,
          messageId: 'noHardcodedColor',
          data: {
            colorValue: hexMatch ? hexMatch[0] : rgbMatch[0],
          },
        });
      }
    }

    return {
      // 检查 JSX 属性中的颜色
      'JSXAttribute[name.name="style"]'(node) {
        if (node.value?.type === 'JSXExpressionContainer') {
          const expression = node.value.expression;
          
          if (expression.type === 'ObjectExpression') {
            expression.properties.forEach(prop => {
              if (prop.value?.type === 'Literal') {
                checkForHardcodedColor(prop.value, prop.value.value);
              }
            });
          }
        }
      },

      // 检查 className 中的 arbitrary values
      'JSXAttribute[name.name="className"]'(node) {
        if (node.value?.type === 'Literal') {
          const className = node.value.value;
          // 检查 Tailwind arbitrary values 中的颜色
          const arbitraryColorRegex = /\[(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\]/;
          const match = className.match(arbitraryColorRegex);
          
          if (match) {
            context.report({
              node: node.value,
              messageId: 'noHardcodedColor',
              data: {
                colorValue: match[1],
              },
            });
          }
        }
      },

      // 检查 styled-components 或 CSS-in-JS
      'TemplateLiteral'(node) {
        node.quasis.forEach(quasi => {
          checkForHardcodedColor(quasi, quasi.value.raw);
        });
      },
    };
  },
};
