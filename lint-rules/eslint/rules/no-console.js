/**
 * @fileoverview 禁止使用 console，应使用 logger
 * @author DuckQuery Team
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止使用 console，应使用 logger',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/duckquery/lint-rules/blob/main/docs/rules/no-console.md',
    },
    messages: {
      noConsole: '禁止使用 console.{{method}}，请使用 logger.{{suggestedMethod}}',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: '允许的 console 方法列表',
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const allowedMethods = new Set(options.allow || []);
    
    // console.log -> logger.debug
    // console.error -> logger.error
    // console.warn -> logger.warn
    // console.debug -> logger.debug
    // console.info -> logger.info
    const methodMapping = {
      log: 'debug',
      error: 'error',
      warn: 'warn',
      debug: 'debug',
      info: 'info',
      trace: 'debug',
      dir: 'debug',
      table: 'debug',
    };

    return {
      MemberExpression(node) {
        // 检查是否是 console.xxx 调用
        if (
          node.object.type === 'Identifier' &&
          node.object.name === 'console' &&
          node.property.type === 'Identifier'
        ) {
          const method = node.property.name;
          
          // 如果在允许列表中，跳过
          if (allowedMethods.has(method)) {
            return;
          }
          
          // 如果是已知的 console 方法
          if (methodMapping[method]) {
            context.report({
              node,
              messageId: 'noConsole',
              data: {
                method,
                suggestedMethod: methodMapping[method],
              },
            });
          }
        }
      },
    };
  },
};
