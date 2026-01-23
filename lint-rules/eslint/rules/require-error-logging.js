/**
 * @fileoverview catch 块必须记录错误到 logger
 * @author DuckQuery Team
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'catch 块必须记录错误到 logger',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/duckquery/lint-rules/blob/main/docs/rules/require-error-logging.md',
    },
    messages: {
      missingErrorLog: 'catch 块必须记录错误。使用 logger.error() 记录错误信息。',
      onlyConsoleError: 'catch 块不应只使用 console.error，应使用 logger.error()。',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowRethrow: {
            type: 'boolean',
            description: '是否允许只重新抛出错误而不记录',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const allowRethrow = options.allowRethrow || false;

    /**
     * 检查语句是否是 logger.error 调用
     */
    function isLoggerErrorCall(statement) {
      if (statement.type !== 'ExpressionStatement') return false;
      
      const expr = statement.expression;
      if (expr.type !== 'CallExpression') return false;
      
      const callee = expr.callee;
      if (callee.type !== 'MemberExpression') return false;
      
      // 检查是否是 logger.error
      return (
        callee.object.type === 'Identifier' &&
        callee.object.name === 'logger' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'error'
      );
    }

    /**
     * 检查语句是否是 console.error 调用
     */
    function isConsoleErrorCall(statement) {
      if (statement.type !== 'ExpressionStatement') return false;
      
      const expr = statement.expression;
      if (expr.type !== 'CallExpression') return false;
      
      const callee = expr.callee;
      if (callee.type !== 'MemberExpression') return false;
      
      return (
        callee.object.type === 'Identifier' &&
        callee.object.name === 'console' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'error'
      );
    }

    /**
     * 检查语句是否是 throw 语句
     */
    function isThrowStatement(statement) {
      return statement.type === 'ThrowStatement';
    }

    /**
     * 检查 catch 块是否有错误记录
     */
    function hasErrorLogging(catchClause) {
      const statements = catchClause.body.body;
      
      if (statements.length === 0) {
        return false;
      }

      let hasLoggerError = false;
      let hasConsoleError = false;
      let hasThrow = false;

      for (const statement of statements) {
        if (isLoggerErrorCall(statement)) {
          hasLoggerError = true;
        } else if (isConsoleErrorCall(statement)) {
          hasConsoleError = true;
        } else if (isThrowStatement(statement)) {
          hasThrow = true;
        }
      }

      // 如果只有 throw 且允许重新抛出，则通过
      if (allowRethrow && hasThrow && statements.length === 1) {
        return true;
      }

      // 如果有 logger.error，则通过
      if (hasLoggerError) {
        return true;
      }

      // 如果只有 console.error，报告应使用 logger.error
      if (hasConsoleError && !hasLoggerError) {
        return 'console-only';
      }

      return false;
    }

    return {
      CatchClause(node) {
        const result = hasErrorLogging(node);
        
        if (result === false) {
          context.report({
            node: node.body,
            messageId: 'missingErrorLog',
          });
        } else if (result === 'console-only') {
          context.report({
            node: node.body,
            messageId: 'onlyConsoleError',
          });
        }
      },
    };
  },
};
