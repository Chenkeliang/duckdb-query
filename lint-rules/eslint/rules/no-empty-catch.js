/**
 * @fileoverview 禁止空的 catch 块
 * @author DuckQuery Team
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止空的 catch 块，必须处理或记录错误',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/duckquery/lint-rules/blob/main/docs/rules/no-empty-catch.md',
    },
    messages: {
      emptyCatch: '空的 catch 块。必须处理错误或至少记录到日志。',
      emptyCatchWithComment: '空的 catch 块。即使有注释，也应该记录错误到日志。',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowEmptyWithComment: {
            type: 'boolean',
            description: '是否允许带注释的空 catch 块',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const allowEmptyWithComment = options.allowEmptyWithComment || false;
    const sourceCode = context.getSourceCode();

    return {
      CatchClause(node) {
        const catchBody = node.body;
        
        // 检查 catch 块是否为空
        if (catchBody.body.length === 0) {
          // 检查是否有注释
          const comments = sourceCode.getCommentsBefore(catchBody) || [];
          const hasComment = comments.length > 0 || 
                           sourceCode.getCommentsInside(catchBody).length > 0;
          
          if (hasComment && allowEmptyWithComment) {
            // 允许带注释的空 catch 块
            return;
          }
          
          context.report({
            node: catchBody,
            messageId: hasComment ? 'emptyCatchWithComment' : 'emptyCatch',
          });
        }
      },
    };
  },
};
