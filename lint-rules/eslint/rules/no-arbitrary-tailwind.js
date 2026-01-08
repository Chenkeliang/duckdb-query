/**
 * @fileoverview 禁止在新布局中使用 Tailwind CSS arbitrary values
 * @author DuckQuery Team
 */

'use strict';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止在新布局中使用 Tailwind CSS arbitrary values',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/duckquery/lint-rules/blob/main/eslint/docs/no-arbitrary-tailwind.md'
    },
    messages: {
      noArbitraryValue: '禁止使用 Tailwind arbitrary value "{{value}}"，请使用标准 Tailwind 类或 shadcn/ui 语义类',
      noArbitraryColor: '禁止使用 arbitrary color "{{value}}"，请使用 Tailwind 语义颜色类（如 bg-primary, text-foreground）',
      noArbitrarySize: '禁止使用 arbitrary size "{{value}}"，请使用标准 Tailwind 尺寸类',
      noArbitraryZIndex: '禁止使用 arbitrary z-index "{{value}}"，请使用标准 z-index 类或在 tailwind.config.js 中定义',
      useSemanticClass: '建议使用语义化类名，而不是 arbitrary value'
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedPaths: {
            type: 'array',
            items: { type: 'string' },
            description: '允许使用 arbitrary values 的文件路径模式'
          },
          allowedProperties: {
            type: 'array',
            items: { type: 'string' },
            description: '允许使用 arbitrary values 的 CSS 属性'
          }
        },
        additionalProperties: false
      }
    ]
  },

  create(context) {
    const options = context.options[0] || {};
    const allowedPaths = options.allowedPaths || [
      '**/components/**', // 旧布局
      '**/*.test.*',      // 测试文件
      '**/__tests__/**'   // 测试目录
    ];
    const allowedProperties = options.allowedProperties || [
      'width',   // 动态宽度可能需要
      'height',  // 动态高度可能需要
      'top',     // 动态定位可能需要
      'left',
      'right',
      'bottom'
    ];

    const filename = context.getFilename();
    
    // 检查是否在新布局中
    const isNewLayout = filename.includes('/src/new/') && 
                       !allowedPaths.some(pattern => {
                         const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                         return regex.test(filename);
                       });

    if (!isNewLayout) {
      return {};
    }

    // Arbitrary value 模式
    const arbitraryPatterns = {
      // 颜色: bg-[#fff], text-[rgb(255,0,0)], border-[hsl(0,100%,50%)]
      color: /^(bg|text|border|ring|fill|stroke|from|via|to|decoration|divide|outline|shadow|accent|caret)-\[(?:#[0-9a-fA-F]{3,8}|rgb|rgba|hsl|hsla|var\()/,
      
      // 尺寸: w-[100px], h-[50%], text-[14px], p-[2rem]
      size: /^(w|h|min-w|min-h|max-w|max-h|text|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space|leading|tracking)-\[[\d.]+(?:px|rem|em|%|vh|vw|ch|ex)\]/,
      
      // z-index: z-[999], z-[9999]
      zIndex: /^z-\[\d+\]/,
      
      // 其他 arbitrary values: top-[10px], left-[50%], etc.
      other: /^[\w-]+-\[.+\]/
    };

    /**
     * 检查类名字符串中的 arbitrary values
     */
    function checkClassNames(node, classNameStr) {
      if (!classNameStr || typeof classNameStr !== 'string') {
        return;
      }

      // 分割类名
      const classNames = classNameStr.split(/\s+/).filter(Boolean);

      classNames.forEach(className => {
        // 检查颜色 arbitrary values
        if (arbitraryPatterns.color.test(className)) {
          context.report({
            node,
            messageId: 'noArbitraryColor',
            data: { value: className }
          });
          return;
        }

        // 检查 z-index arbitrary values
        if (arbitraryPatterns.zIndex.test(className)) {
          context.report({
            node,
            messageId: 'noArbitraryZIndex',
            data: { value: className }
          });
          return;
        }

        // 检查尺寸 arbitrary values
        if (arbitraryPatterns.size.test(className)) {
          // 提取属性名
          const propMatch = className.match(/^([\w-]+)-\[/);
          const prop = propMatch ? propMatch[1] : '';

          // 检查是否是允许的属性
          const isAllowedProp = allowedProperties.some(allowed => {
            if (prop === allowed) return true;
            // 支持前缀匹配，如 'width' 匹配 'w', 'min-w', 'max-w'
            if (prop.includes(allowed) || allowed.includes(prop)) return true;
            return false;
          });

          if (!isAllowedProp) {
            context.report({
              node,
              messageId: 'noArbitrarySize',
              data: { value: className }
            });
          }
          return;
        }

        // 检查其他 arbitrary values
        if (arbitraryPatterns.other.test(className)) {
          context.report({
            node,
            messageId: 'noArbitraryValue',
            data: { value: className }
          });
        }
      });
    }

    return {
      // 检查 JSX className 属性
      JSXAttribute(node) {
        if (node.name.name !== 'className') {
          return;
        }

        const value = node.value;

        // 字符串字面量: className="bg-[#fff]"
        if (value && value.type === 'Literal' && typeof value.value === 'string') {
          checkClassNames(value, value.value);
        }

        // 模板字符串: className={`bg-[#fff] ${other}`}
        if (value && value.type === 'JSXExpressionContainer') {
          const expr = value.expression;

          if (expr.type === 'TemplateLiteral') {
            expr.quasis.forEach(quasi => {
              checkClassNames(quasi, quasi.value.raw);
            });
          }

          // 字符串字面量: className={"bg-[#fff]"}
          if (expr.type === 'Literal' && typeof expr.value === 'string') {
            checkClassNames(expr, expr.value);
          }
        }
      },

      // 检查 clsx/cn 调用
      CallExpression(node) {
        const callee = node.callee;
        
        // 检查是否是 clsx, cn, classNames 等工具函数
        if (callee.type === 'Identifier' && 
            ['clsx', 'cn', 'classNames', 'classnames'].includes(callee.name)) {
          
          node.arguments.forEach(arg => {
            // 字符串参数
            if (arg.type === 'Literal' && typeof arg.value === 'string') {
              checkClassNames(arg, arg.value);
            }

            // 模板字符串参数
            if (arg.type === 'TemplateLiteral') {
              arg.quasis.forEach(quasi => {
                checkClassNames(quasi, quasi.value.raw);
              });
            }

            // 对象参数: cn({ 'bg-[#fff]': true })
            if (arg.type === 'ObjectExpression') {
              arg.properties.forEach(prop => {
                if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
                  checkClassNames(prop.key, prop.key.value);
                }
                if (prop.key.type === 'Identifier') {
                  checkClassNames(prop.key, prop.key.name);
                }
              });
            }
          });
        }
      }
    };
  }
};
