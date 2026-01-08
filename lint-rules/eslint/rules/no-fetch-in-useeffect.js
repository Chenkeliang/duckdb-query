/**
 * 规则: no-fetch-in-useeffect
 * 
 * 禁止在 useEffect 中直接调用 API (fetch/axios)
 * 
 * 应该使用 TanStack Query 管理服务端数据
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止在 useEffect 中直接调用 API',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/your-org/duckquery/blob/main/lint-rules/eslint/docs/no-fetch-in-useeffect.md',
    },
    messages: {
      noFetchInUseEffect: '❌ 禁止在 useEffect 中直接调用 API ({{apiMethod}})，请使用 TanStack Query Hook',
      suggestion: '建议: 创建或使用现有的 TanStack Query Hook (如 useDuckDBTables, useDataSources)',
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

    let currentUseEffectNode = null;

    return {
      // 进入 useEffect 调用
      'CallExpression[callee.name="useEffect"]'(node) {
        currentUseEffectNode = node;
      },

      // 离开 useEffect 调用
      'CallExpression[callee.name="useEffect"]:exit'() {
        currentUseEffectNode = null;
      },

      // 检查 fetch 调用
      'CallExpression[callee.name="fetch"]'(node) {
        if (currentUseEffectNode) {
          context.report({
            node,
            messageId: 'noFetchInUseEffect',
            data: {
              apiMethod: 'fetch',
            },
          });
        }
      },

      // 检查 axios 调用
      'CallExpression[callee.object.name="axios"]'(node) {
        if (currentUseEffectNode) {
          const method = node.callee.property?.name || 'request';
          context.report({
            node,
            messageId: 'noFetchInUseEffect',
            data: {
              apiMethod: `axios.${method}`,
            },
          });
        }
      },

      // 检查 apiClient 调用
      'CallExpression[callee.object.name="apiClient"]'(node) {
        if (currentUseEffectNode) {
          const method = node.callee.property?.name || 'request';
          context.report({
            node,
            messageId: 'noFetchInUseEffect',
            data: {
              apiMethod: `apiClient.${method}`,
            },
          });
        }
      },
    };
  },
};
